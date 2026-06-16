/**
 * Debounce de mensagens via Redis.
 */
import { obterRedis, pingRedis } from '../lib/redis.js';
import { config } from '../config.js';
import type { ItemDebounce } from '../tipos/evolution.js';
import { gerarRespostaRefinada, montarPromptCompactoPassadas } from './inferencia-refinada.js';
import { tentarEnviarResposta } from './enviar-resposta.js';
import { obterHistorico, adicionarAoHistorico } from './historico.js';
import { processarFerramentas } from './ferramentas.js';
import { normalizarRespostaWhatsapp } from './mensagem.js';
import { iaPodeResponder } from './pausa.js';
import { jidParaTelefone, telefoneParaJid } from '../util/telefone.js';
import { montarPromptSistemaInferencia } from './contexto-inferencia.js';
import { gerarConversaRapida, deveUsarConversaRapida } from './conversa-rapida.js';
import { logEvento } from '../util/log-eventos.js';
import { pararDigitando, garantirDigitando } from './digitando-sessao.js';
import { rotearMensagem } from './roteador-intencao.js';
import { garantirContatoMotorista } from './contato-motorista.js';
import { registrarIntencaoWhatsapp } from './erp-atendimento-motorista.js';
import { obterConfigTempo } from './config-tempo.js';
import {
  iniciarTrace,
  adicionarEtapa,
  finalizarTrace,
  obterTraceIdAtivo,
} from './trace-pipeline.js';

const redis = obterRedis();

const PREFIXO_LISTA = 'debounce:lista:';
const PREFIXO_TIMER = 'debounce:timer:';
const PREFIXO_LOCK = 'debounce:lock:';

export async function adicionarAoDebounce(item: ItemDebounce): Promise<void> {
  const chaveLista = `${PREFIXO_LISTA}${item.remoteJid}`;
  const chaveTimer = `${PREFIXO_TIMER}${item.remoteJid}`;

  garantirDigitando(item.instance, item.remoteJid);

  await redis.rpush(chaveLista, JSON.stringify(item));
  await redis.expire(chaveLista, 120);
  await redis.set(chaveTimer, Date.now().toString(), 'EX', 120);
}

export async function statusDebounce(): Promise<
  Array<{ remoteJid: string; mensagens: number; aguardandoMs: number }>
> {
  const chavesTimer = await redis.keys(`${PREFIXO_TIMER}*`);
  const agora = Date.now();
  const resultado = [];

  for (const chaveTimer of chavesTimer) {
    const remoteJid = chaveTimer.replace(PREFIXO_TIMER, '');
    const valorTimer = await redis.get(chaveTimer);
    if (!valorTimer) continue;
    const inicio = parseInt(valorTimer, 10);
    const lista = await redis.llen(`${PREFIXO_LISTA}${remoteJid}`);
    const tempoCfg = await obterConfigTempo();
    resultado.push({
      remoteJid,
      mensagens: lista,
      aguardandoMs: Math.max(0, tempoCfg.debounceMs - (agora - inicio)),
    });
  }
  return resultado;
}

export async function processarDebounceExpirado(): Promise<void> {
  const chavesTimer = await redis.keys(`${PREFIXO_TIMER}*`);
  const agora = Date.now();
  const tempo = await obterConfigTempo();

  for (const chaveTimer of chavesTimer) {
    const remoteJid = chaveTimer.replace(PREFIXO_TIMER, '');
    const valorTimer = await redis.get(chaveTimer);
    if (!valorTimer) continue;

    const inicio = parseInt(valorTimer, 10);
    if (agora - inicio < tempo.debounceMs) continue;

    const chaveLock = `${PREFIXO_LOCK}${remoteJid}`;
    const lock = await redis.set(chaveLock, '1', 'PX', 60000, 'NX');
    if (!lock) continue;

    try {
      await processarLote(remoteJid);
    } finally {
      await redis.del(chaveLock);
    }
  }
}

async function processarLote(remoteJid: string): Promise<void> {
  const chaveLista = `${PREFIXO_LISTA}${remoteJid}`;
  const chaveTimer = `${PREFIXO_TIMER}${remoteJid}`;

  const itensRaw = await redis.lrange(chaveLista, 0, -1);
  if (itensRaw.length === 0) {
    await redis.del(chaveTimer);
    return;
  }

  await redis.del(chaveLista, chaveTimer);

  const itens: ItemDebounce[] = itensRaw.map((r: string) => JSON.parse(r) as ItemDebounce);
  const mensagens = itens.map((i) => i.conteudo).filter(Boolean);
  if (mensagens.length === 0) return;

  const instance = itens[0].instance;
  const origem = itens.find((i) => i.origem)?.origem;
  const numero = jidParaTelefone(remoteJid);
  const textoUsuario = mensagens.join('\n\n');
  const pushName = itens.find((i) => i.pushName)?.pushName;
  const tiposEntrada = [...new Set(itens.map((i) => i.tipo))];
  const primeiroTs = Math.min(...itens.map((i) => i.timestamp ?? Date.now()));
  const tempo = await obterConfigTempo();
  const debounceAguardouMs = Date.now() - primeiroTs - tempo.debounceMs;

  let traceId = (await obterTraceIdAtivo(remoteJid)) ?? '';
  if (!traceId) {
    traceId = await iniciarTrace({
      telefone: numero,
      remoteJid,
      entrada: textoUsuario,
      tipos: tiposEntrada,
      debounceAguardouMs: Math.max(0, debounceAguardouMs),
    });
  } else {
    await adicionarEtapa(traceId, 'debounce', 'Debounce expirou — processando lote', {
      mensagens: mensagens.length,
      tipos: tiposEntrada,
    });
  }

  const t0 = Date.now();

  const registro = await garantirContatoMotorista(numero, pushName);
  if (registro.criado) {
    logEvento('debounce', 'Contato registrado no ERP (primeiro contato)', {
      telefone: numero,
      motoristaId: registro.motoristaId,
    });
  }

  if (!(await iaPodeResponder(numero))) {
    logEvento('debounce', 'Lote descartado — contato pausado', { telefone: numero });
    await finalizarTrace(traceId, { status: 'silencio', resposta: '(contato pausado)' });
    return;
  }

  if (tiposEntrada.some((t) => t === 'imagem' || t === 'documento')) {
    await adicionarEtapa(traceId, 'ocr', 'OCR / leitura de mídia', {
      preview: textoUsuario.slice(0, 200),
      midiaId: itens.find((i) => i.midiaId)?.midiaId,
    });
  }

  logEvento('debounce', 'Processando lote', {
    telefone: numero,
    mensagens: mensagens.length,
    tipos: [...new Set(itens.map((i) => i.tipo))],
  });

  try {
    await adicionarAoHistorico(remoteJid, 'user', textoUsuario);

    const historico = await obterHistorico(remoteJid);
    const historicoSemAtual = historico.slice(0, -1);
    const ultimaAssistant = [...historicoSemAtual]
      .reverse()
      .find((h) => h.role === 'assistant')?.content;

    const rota = await rotearMensagem({
      telefone: numero,
      mensagem: textoUsuario,
      historico: historicoSemAtual,
      ultimaAssistant,
      itens,
      nomeContato: pushName,
    });

    await adicionarEtapa(
      traceId,
      'roteamento',
      'Decisão do roteador',
      {
        tipo: rota.tipo,
        intencao: rota.tipo === 'llm' ? rota.intencao : rota.intencao,
        passo: rota.tipo === 'programatico' ? rota.passo : undefined,
        cenario: rota.tipo === 'llm' ? rota.cenario : undefined,
      },
      Date.now() - t0,
    );

    logEvento('debounce', 'Roteamento', {
      telefone: numero,
      intencao: rota.tipo === 'llm' ? rota.intencao : rota.intencao,
      tipo: rota.tipo,
    });

    if (rota.tipo === 'silencio') {
      logEvento('debounce', 'Silêncio — motorista encerrou sem necessidade de resposta', {
        telefone: numero,
        motivo: rota.motivo,
        texto: textoUsuario.slice(0, 80),
      });
      await finalizarTrace(traceId, { status: 'silencio', resposta: '(silêncio)' });
      return;
    }

    let resposta: string;
    let enviarUmaBolha = false;
    const tGen = Date.now();

    if (rota.tipo === 'programatico') {
      resposta = rota.textoComFerramentas;
      enviarUmaBolha = rota.fragmentar === false;
      if (rota.executarFerramentas) {
        resposta = await processarFerramentas(resposta, { remoteJid, instance, itens });
      } else {
        resposta = rota.resposta;
      }
      logEvento('debounce', 'Resposta programática', {
        telefone: numero,
        intencao: rota.intencao,
        passo: rota.passo,
        texto: resposta.slice(0, 80),
      });
      await adicionarEtapa(
        traceId,
        'geracao',
        'Resposta programática (sem LLM)',
        { passo: rota.passo, intencao: rota.intencao, preview: resposta.slice(0, 120) },
        Date.now() - tGen,
      );
    } else {
      const midias = itens
        .filter((i) => i.midiaId)
        .map((i) => `midia_id=${i.midiaId} (${i.fileName ?? i.tipo})`)
        .join(', ');

      const promptCompleto = await montarPromptSistemaInferencia({
        telefone: numero,
        nomeContato: pushName,
        mensagemUsuario: textoUsuario,
        historico: historicoSemAtual,
        anexosLote: midias || undefined,
      });

      const midiaId = itens.find((i) => i.midiaId)?.midiaId;

      if (deveUsarConversaRapida(rota)) {
        const respostaBruta = await gerarConversaRapida({
          promptCompleto,
          mensagensUsuario: mensagens,
          historico: historicoSemAtual,
          cenario: rota.cenario,
          intencaoRoteador: rota.intencao,
        });
        logEvento('debounce', 'Conversa rápida (1 passada LLM)', {
          telefone: numero,
          cenario: rota.cenario ?? 6,
          roteador: rota.intencao,
          texto: respostaBruta.slice(0, 120),
        });
        await adicionarEtapa(
          traceId,
          'geracao',
          'Conversa rápida — 1 passada LLM',
          { cenario: rota.cenario ?? 6, preview: respostaBruta.slice(0, 120) },
          Date.now() - tGen,
        );
        resposta = await processarFerramentas(respostaBruta, { remoteJid, instance, itens });
      } else {
        const promptSistema =
          rota.cenario !== undefined
            ? montarPromptCompactoPassadas(promptCompleto, {
                cenario: `CENÁRIO ${rota.cenario}`,
                ferramentas: [],
                observacoes: `roteador:${rota.intencao}`,
              })
            : promptCompleto;

        const { texto: respostaBruta, plano, passadas, analise, cadeiaPensamento } =
          await gerarRespostaRefinada(
            promptSistema,
            mensagens,
            historicoSemAtual,
            { telefone: numero, midiaId },
          );
        logEvento('debounce', 'Inferência refinada', {
          telefone: numero,
          cenario: plano.cenario,
          ferramentas: plano.ferramentas,
          passadas,
          roteador: rota.intencao,
          intencao: analise?.intencao_provavel,
          ambiguo: analise?.ambiguo,
          cadeiaPensamento: cadeiaPensamento?.map((c) => ({
            etapa: c.etapa,
            aprovado: c.aprovado,
            raciocinio: c.raciocinio,
          })),
        });
        await adicionarEtapa(
          traceId,
          'geracao',
          `Inferência refinada — ${passadas} passada(s)`,
          {
            cenario: plano.cenario,
            passadas,
            ferramentas: plano.ferramentas,
            preview: respostaBruta.slice(0, 120),
          },
          Date.now() - tGen,
        );

        resposta = normalizarRespostaWhatsapp(respostaBruta);
        resposta = await processarFerramentas(resposta, { remoteJid, instance, itens });

        if (analise?.intencao_provavel) {
          void registrarIntencaoWhatsapp(numero, analise.intencao_provavel, {
            ambiguo: analise.ambiguo,
            notas: analise.notas,
          });
        }
      }
    }

    const tEnv = Date.now();
    const envio = await tentarEnviarResposta(numero, resposta, instance, {
      remoteJid,
      mensagensEntrada: mensagens.length,
      origem,
      fragmentar: enviarUmaBolha ? false : undefined,
    });

    await adicionarEtapa(
      traceId,
      'envio',
      envio.enviado ? 'Enviado ao WhatsApp' : 'Enfileirado / teste',
      {
        fragmentos: envio.fragmentos,
        motivo: envio.motivo,
        pendente: envio.pendente,
      },
      Date.now() - tEnv,
    );

    await adicionarAoHistorico(remoteJid, 'assistant', resposta);

    if (envio.enviado) {
      logEvento('debounce', 'Resposta enviada', {
        telefone: numero,
        fragmentos: envio.fragmentos,
      });
      await finalizarTrace(traceId, { status: 'ok', resposta });
    } else {
      logEvento(
        'debounce',
        'Resposta na fila (canal indisponível)',
        {
          telefone: numero,
          motivo: envio.motivo,
          filaId: envio.filaId,
          fragmentos: envio.fragmentos,
        },
        'warn',
      );
      await finalizarTrace(traceId, { status: 'ok', resposta });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logEvento(
      'debounce',
      'Erro ao processar lote',
      { telefone: numero, erro: msg },
      'error',
    );
    await finalizarTrace(traceId, { status: 'erro', erro: msg });
    const fallback =
      'Desculpe, tive um problema ao processar sua mensagem, tente novamente em instantes';
    await tentarEnviarResposta(numero, fallback, instance, {
      remoteJid,
      mensagensEntrada: mensagens.length,
      origem,
    });
  } finally {
    pararDigitando(remoteJid);
  }
}

export async function simularDebounce(
  telefone: string,
  mensagens: string[],
  pushName = 'Teste',
): Promise<{ remoteJid: string; enfileiradas: number }> {
  const remoteJid = telefoneParaJid(telefone);
  for (const conteudo of mensagens) {
    await adicionarAoDebounce({
      remoteJid,
      pushName,
      tipo: 'texto',
      conteudo,
      instance: config.evolutionInstance,
      timestamp: Date.now(),
      origem: 'teste',
    });
  }
  return { remoteJid, enfileiradas: mensagens.length };
}

export function iniciarWorkerDebounce(): void {
  setInterval(() => {
    processarDebounceExpirado().catch((err) =>
      console.error('[debounce] Worker erro:', err),
    );
  }, config.debounceWorkerMs);
  console.log(
    `[debounce] Worker iniciado (intervalo ${config.debounceWorkerMs}ms, debounce ${config.debounceMs}ms)`,
  );
}

export async function verificarRedis(): Promise<boolean> {
  return pingRedis();
}

export { redis };
