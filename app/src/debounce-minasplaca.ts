/**
 * Debounce Minas Placa — acumula mensagens e dispara o agente.
 */
import { obterRedis } from './lib/redis.js';
import { jidParaTelefone } from './util/telefone.js';
import { logEvento } from './util/log-eventos.js';
import { gerarRespostaAgente } from './agente-minasplaca.js';
import { tentarEnviarResposta } from './lib/evolution.js';
import { obterHistorico, adicionarAoHistorico } from './historico-minasplaca.js';
import { config } from './config.js';
import type { ItemDebounce } from './lib/tipos.js';

const redis = obterRedis();
const PREFIXO_LISTA = 'debounce:lista:';
const PREFIXO_TIMER = 'debounce:timer:';
const PREFIXO_LOCK = 'debounce:lock:';
const TTL = 2 * 60 * 60;

export async function adicionarAoDebounce(item: ItemDebounce): Promise<void> {
  const telefone = item.telefone;
  const chaveLista = `${PREFIXO_LISTA}${telefone}`;
  const chaveTimer = `${PREFIXO_TIMER}${telefone}`;

  const pipeline = redis.pipeline();
  pipeline.rpush(chaveLista, JSON.stringify(item));
  pipeline.expire(chaveLista, TTL);
  pipeline.set(chaveTimer, '1', 'EX', Math.ceil(config.debounceMs / 1000));
  await pipeline.exec();
  console.log(`[debounce] mensagem adicionada para ${telefone}`);
}

export async function processarContato(remoteJid: string): Promise<void> {
  const telefone = jidParaTelefone(remoteJid);
  const chaveLista = `${PREFIXO_LISTA}${telefone}`;
  const chaveLock = `${PREFIXO_LOCK}${telefone}`;

  const lock = await redis.set(chaveLock, '1', 'EX', 30, 'NX');
  if (!lock) return;

  try {
    const raw = await redis.lrange(chaveLista, 0, -1);
    console.log(`[debounce] processando ${telefone}: ${raw.length} mensagens`);
    if (!raw.length) return;
    await redis.del(chaveLista);

    const itens: ItemDebounce[] = raw.map((s) => JSON.parse(s));
    const textos = itens
      .filter((i) => i.tipo === 'texto' && i.conteudo)
      .map((i) => i.conteudo);
    const mensagem = textos.join('\n\n').trim();
    if (!mensagem) return;

    const pushName = itens[0]?.pushName;
    const historico = await obterHistorico(telefone, 100);

    console.log(`[debounce] chamando agente para ${telefone}`);
    const resposta = await gerarRespostaAgente({
      telefone,
      mensagem,
      historico,
      pushName,
    });

    await adicionarAoHistorico(telefone, [
      { role: 'user', content: mensagem, timestamp: Date.now() },
      { role: 'assistant', content: resposta, timestamp: Date.now() },
    ]);

    console.log(`[debounce] enviando resposta para ${telefone}: ${resposta.slice(0, 80)}`);
    const resultado = await tentarEnviarResposta(telefone, resposta, config.evolutionInstance, {
      remoteJid,
      mensagensEntrada: itens.length,
    });
    console.log(`[debounce] resultado envio:`, resultado);
  } catch (err) {
    const motivo = err instanceof Error ? err.message : String(err);
    logEvento('debounce', 'Erro ao processar contato', { telefone, motivo }, 'error');
    console.error(`[debounce] erro: ${motivo}`);
  } finally {
    await redis.del(chaveLock);
  }
}

export function iniciarWorkerDebounce(intervaloMs = 300): void {
  console.log('[debounce] worker iniciado');
  async function tick() {
    try {
      const chaves = await redis.keys(`${PREFIXO_TIMER}*`);
      if (chaves.length) console.log(`[debounce] timers encontrados: ${chaves.length}`);
      for (const chave of chaves) {
        const telefone = chave.replace(PREFIXO_TIMER, '');
        await redis.del(chave);
        await processarContato(`${telefone}@s.whatsapp.net`);
      }
    } catch (err) {
      const motivo = err instanceof Error ? err.message : String(err);
      logEvento('debounce', 'Erro no worker', { motivo }, 'error');
      console.error(`[debounce] worker erro: ${motivo}`);
    }
    setTimeout(tick, intervaloMs);
  }
  tick();
}
