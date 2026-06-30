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
const redis = obterRedis();
const PREFIXO_LISTA = 'debounce:lista:';
const PREFIXO_TIMER = 'debounce:timer:';
const PREFIXO_LOCK = 'debounce:lock:';
const TTL = 2 * 60 * 60;
export async function adicionarAoDebounce(item) {
    const telefone = item.telefone;
    const chaveLista = `${PREFIXO_LISTA}${telefone}`;
    const chaveTimer = `${PREFIXO_TIMER}${telefone}`;
    const pipeline = redis.pipeline();
    pipeline.rpush(chaveLista, JSON.stringify(item));
    pipeline.expire(chaveLista, TTL);
    pipeline.set(chaveTimer, '1', 'EX', Math.ceil(config.debounceMs / 1000));
    await pipeline.exec();
}
export async function processarContato(remoteJid) {
    const telefone = jidParaTelefone(remoteJid);
    const chaveLista = `${PREFIXO_LISTA}${telefone}`;
    const chaveLock = `${PREFIXO_LOCK}${telefone}`;
    const lock = await redis.set(chaveLock, '1', 'EX', 30, 'NX');
    if (!lock)
        return;
    try {
        const raw = await redis.lrange(chaveLista, 0, -1);
        if (!raw.length)
            return;
        await redis.del(chaveLista);
        const itens = raw.map((s) => JSON.parse(s));
        const textos = itens
            .filter((i) => i.tipo === 'texto' && i.conteudo)
            .map((i) => i.conteudo);
        const mensagem = textos.join('\n\n').trim();
        if (!mensagem)
            return;
        const pushName = itens[0]?.pushName;
        const historico = await obterHistorico(telefone, 20);
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
        await tentarEnviarResposta(telefone, resposta, config.evolutionInstance, {
            remoteJid,
            mensagensEntrada: itens.length,
        });
    }
    catch (err) {
        const motivo = err instanceof Error ? err.message : String(err);
        logEvento('debounce', 'Erro ao processar contato', { telefone, motivo }, 'error');
    }
    finally {
        await redis.del(chaveLock);
    }
}
export function iniciarWorkerDebounce(intervaloMs = 300) {
    async function tick() {
        try {
            const chaves = await redis.keys(`${PREFIXO_TIMER}*`);
            for (const chave of chaves) {
                const telefone = chave.replace(PREFIXO_TIMER, '');
                await redis.del(chave);
                await processarContato(`${telefone}@s.whatsapp.net`);
            }
        }
        catch (err) {
            const motivo = err instanceof Error ? err.message : String(err);
            logEvento('debounce', 'Erro no worker', { motivo }, 'error');
        }
        setTimeout(tick, intervaloMs);
    }
    tick();
}
