/**
 * Reconciliação periódica: analisa históricos WhatsApp e garante espelho no ERP (coleção disponivel).
 */
import { config } from '../config.js';
import { chatCompletionComMeta } from './chat-providers.js';
import { ContadorCustoSessao } from '../util/custo-llm.js';
import {
  listarJidsHistoricoRecente,
  obterHistoricoBruto,
  type MensagemHistorico,
} from './historico.js';
import { jidParaTelefone } from '../util/telefone.js';
import {
  buscarUltimaDisponibilidade,
  buscarMotoristaPorTelefone,
  registrarDisponibilidade,
  verificarDisponibilidadeNoErp,
} from './motorista-gmx.js';
import { directusConfigurado } from './directus.js';

const PALAVRAS_DISPONIBILIDADE =
  /\b(dispon[ií]vel|vazio|livre|carregad|em viagem|localiza[cç][aã]o|to em|estou em|t[oô] em|por aqui|cidade|libero|libera)\b/i;

const TIMEOUT_IA_MS = Math.min(
  90_000,
  Math.max(20_000, parseInt(process.env.RECONCILIACAO_TIMEOUT_IA_MS ?? '45000', 10)),
);

export interface ExtracaoDisponibilidadeIa {
  refletiu_disponibilidade: boolean;
  disponivel: boolean;
  status: 'disponivel' | 'carregado' | 'indisponivel';
  localizacao_atual: string | null;
  data_previsao_disponibilidade: string | null;
  confianca: number;
  evidencia: string;
}

function historicoRecente(
  msgs: MensagemHistorico[],
  janelaHoras: number,
): MensagemHistorico[] {
  const limite = Date.now() - janelaHoras * 60 * 60 * 1000;
  return msgs.filter((m) => m.timestamp >= limite);
}

function formatarTranscricao(msgs: MensagemHistorico[]): string {
  return msgs
    .map((m) => {
      const quem =
        m.papel === 'user'
          ? 'Motorista'
          : m.papel === 'assistant'
            ? 'IA GMX'
            : m.papel === 'empresa'
              ? 'Equipe GMX'
              : 'Sistema';
      return `${quem}: ${m.conteudo}`;
    })
    .join('\n');
}

function parseJsonExtracao(raw: string): ExtracaoDisponibilidadeIa | null {
  const limpo = raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
  const ini = limpo.indexOf('{');
  const fim = limpo.lastIndexOf('}');
  if (ini < 0 || fim <= ini) return null;
  try {
    const obj = JSON.parse(limpo.slice(ini, fim + 1)) as ExtracaoDisponibilidadeIa;
    if (typeof obj.confianca !== 'number') obj.confianca = 0;
    return obj;
  } catch {
    return null;
  }
}

async function extrairDisponibilidadeComIa(
  transcricao: string,
  telefone: string,
  contador: ContadorCustoSessao,
): Promise<ExtracaoDisponibilidadeIa | null> {
  const prompt = `Analise a conversa WhatsApp abaixo entre motorista e GMX.
Identifique se o motorista informou DISPONIBILIDADE e/ou LOCALIZAÇÃO atual (ou destino + previsão se carregado).

Responda SOMENTE com JSON válido:
{
  "refletiu_disponibilidade": true ou false,
  "disponivel": true se vazio/disponível para carga, false se carregado/em viagem,
  "status": "disponivel" | "carregado" | "indisponivel",
  "localizacao_atual": "Cidade UF" ou null,
  "data_previsao_disponibilidade": "AAAA-MM-DD HH:mm:ss" ou null (só se carregado),
  "confianca": 0.0 a 1.0,
  "evidencia": "trecho curto que comprova"
}

Regras:
- refletiu_disponibilidade=true só se há informação clara de local OU status vazio/carregado.
- localizacao_atual precisa cidade reconhecível (ex: "Campinas SP"), não "perto do posto".
- Use a informação MAIS RECENTE do motorista.
- confianca < 0.65 → prefira refletiu_disponibilidade=false.

Conversa:
${transcricao}`;

  const ia = chatCompletionComMeta(
    [
      {
        role: 'system',
        content:
          'Você extrai dados estruturados de conversas logísticas. Responda apenas JSON, sem markdown.',
      },
      { role: 'user', content: prompt },
    ],
    { temperature: 0.1, max_tokens: 512 },
  );

  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`timeout IA reconciliação (${TIMEOUT_IA_MS}ms)`)), TIMEOUT_IA_MS);
  });

  const { texto, provedor, modelo, uso } = await Promise.race([ia, timeout]);

  contador.registrar({
    contexto: `reconciliacao_disponibilidade:${telefone}`,
    provedor,
    modelo,
    uso,
  });

  return parseJsonExtracao(texto);
}

function erpCondizComExtracao(
  erp: Record<string, unknown> | null,
  ext: ExtracaoDisponibilidadeIa,
): boolean {
  if (!erp) return false;
  const locErp = String(erp.localizacao_atual ?? erp.local_disponibilidade ?? '')
    .trim()
    .toLowerCase();
  const locExt = (ext.localizacao_atual ?? '').trim().toLowerCase();
  const dispErp = erp.disponivel === true;
  if (locExt && locErp) {
    if (!locErp.includes(locExt.split(' ')[0]) && !locExt.includes(locErp.split(' ')[0])) {
      return false;
    }
  } else if (locExt && !locErp) {
    return false;
  }
  if (ext.disponivel !== dispErp && ext.status === 'disponivel') return false;
  return true;
}

export interface ResultadoReconciliacaoLote {
  analisados: number;
  candidatos: number;
  sincronizados: number;
  jaOk: number;
  ignorados: number;
  erros: number;
  interrompidoPorTimeout: boolean;
}

/**
 * Varre históricos Redis e reconcilia com ERP.
 */
export async function executarReconciliacaoDisponibilidade(): Promise<ResultadoReconciliacaoLote> {
  const inicioCiclo = Date.now();
  const deadline = inicioCiclo + config.reconciliacaoTimeoutMs;
  const tempoEsgotado = () => Date.now() >= deadline;

  const rotulo = `reconciliação disponibilidade ${new Date().toISOString()}`;
  const contador = new ContadorCustoSessao(rotulo);
  const resultado: ResultadoReconciliacaoLote = {
    analisados: 0,
    candidatos: 0,
    sincronizados: 0,
    jaOk: 0,
    ignorados: 0,
    erros: 0,
    interrompidoPorTimeout: false,
  };

  if (!directusConfigurado()) {
    console.warn('[reconciliacao-disponibilidade] Directus não configurado — ciclo ignorado');
    contador.imprimirResumo();
    return resultado;
  }

  const scanTimeout = Math.min(config.reconciliacaoTimeoutMs, 90_000);
  console.log(
    `[reconciliacao-disponibilidade] Scan Redis (max ${config.reconciliacaoMaxChavesScan} chaves, prefetch ${config.reconciliacaoPrefetchMensagens})…`,
  );

  const jids = await listarJidsHistoricoRecente({
    janelaHoras: config.reconciliacaoJanelaHoras,
    maxChaves: config.reconciliacaoMaxChavesScan,
    prefetchMensagens: config.reconciliacaoPrefetchMensagens,
    filtroConteudo: PALAVRAS_DISPONIBILIDADE,
    minMensagensNaJanela: 2,
    timeoutMs: scanTimeout,
  });

  console.log(
    `[reconciliacao-disponibilidade] Início — ${jids.length} candidato(s) após scan, janela ${config.reconciliacaoJanelaHoras}h, timeout ciclo ${config.reconciliacaoTimeoutMs}ms, max IA ${config.reconciliacaoMaxIaPorCiclo}`,
  );

  let chamadasIa = 0;

  for (const jid of jids) {
    if (tempoEsgotado()) {
      resultado.interrompidoPorTimeout = true;
      console.warn('[reconciliacao-disponibilidade] Ciclo interrompido por timeout global');
      break;
    }

    resultado.analisados += 1;
    resultado.candidatos += 1;
    const telefone = jidParaTelefone(jid);

    if (chamadasIa >= config.reconciliacaoMaxIaPorCiclo) {
      resultado.ignorados += 1;
      continue;
    }

    const bruto = await obterHistoricoBruto(jid);
    const recente = historicoRecente(bruto, config.reconciliacaoJanelaHoras);
    const transcricao = formatarTranscricao(recente.slice(-config.reconciliacaoMaxMensagens));

    try {
      chamadasIa += 1;
      console.log(
        `[reconciliacao-disponibilidade] IA ${chamadasIa}/${config.reconciliacaoMaxIaPorCiclo} → ${telefone}`,
      );

      const ext = await extrairDisponibilidadeComIa(transcricao, telefone, contador);
      if (!ext?.refletiu_disponibilidade || ext.confianca < 0.65) {
        resultado.ignorados += 1;
        continue;
      }

      const motorista = await buscarMotoristaPorTelefone(telefone);
      if (!motorista) {
        resultado.ignorados += 1;
        continue;
      }

      const erpAtual = await buscarUltimaDisponibilidade(motorista.id);
      if (erpCondizComExtracao(erpAtual, ext)) {
        resultado.jaOk += 1;
        console.log(
          `[reconciliacao-disponibilidade] OK ${telefone} — ERP já reflete (${ext.localizacao_atual ?? ext.status})`,
        );
        continue;
      }

      await registrarDisponibilidade({
        telefone,
        disponivel: ext.disponivel,
        status: ext.status,
        localizacao_atual: ext.localizacao_atual ?? undefined,
        data_previsao_disponibilidade: ext.data_previsao_disponibilidade ?? undefined,
        observacao: `reconciliacao_ia ${new Date().toISOString()} — ${ext.evidencia.slice(0, 120)}`,
      });

      const verificacao = await verificarDisponibilidadeNoErp(telefone, {
        disponivel: ext.disponivel,
        localizacao_atual: ext.localizacao_atual ?? undefined,
        status: ext.status,
      });

      if (verificacao.ok) {
        resultado.sincronizados += 1;
        console.log(
          `[reconciliacao-disponibilidade] SYNC ${telefone} → ${ext.localizacao_atual ?? ext.status} (conf=${ext.confianca.toFixed(2)})`,
        );
      } else {
        resultado.erros += 1;
        console.error(
          `[reconciliacao-disponibilidade] FALHA verificação ${telefone}: ${verificacao.motivo}`,
        );
      }
    } catch (err) {
      resultado.erros += 1;
      console.error(
        `[reconciliacao-disponibilidade] Erro ${telefone}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  const duracaoS = ((Date.now() - inicioCiclo) / 1000).toFixed(1);
  console.log(
    `[reconciliacao-disponibilidade] Fim em ${duracaoS}s — candidatos=${resultado.candidatos} sync=${resultado.sincronizados} ja_ok=${resultado.jaOk} ignorados=${resultado.ignorados} erros=${resultado.erros}${resultado.interrompidoPorTimeout ? ' (timeout)' : ''}`,
  );
  contador.imprimirResumo();
  return resultado;
}
