/**
 * Cliente Redis compartilhado — evita múltiplas conexões e erros "Unhandled error event".
 */
import { Redis } from 'ioredis';
import { config } from '../config.js';
let cliente = null;
let avisoConexao = false;
function opcoesRedis() {
    return {
        lazyConnect: true,
        maxRetriesPerRequest: 3,
        enableOfflineQueue: true,
        connectTimeout: 5000,
        retryStrategy(times) {
            if (times > 3)
                return null;
            return Math.min(times * 250, 2000);
        },
    };
}
function registrarErroUmaVez(err) {
    if (avisoConexao)
        return;
    avisoConexao = true;
    console.warn(`[redis] Indisponível (${config.redisUrl}): ${err.message}`);
}
/** Singleton ioredis — use em todos os serviços. */
export function obterRedis() {
    if (!cliente) {
        cliente = new Redis(config.redisUrl, opcoesRedis());
        cliente.on('error', registrarErroUmaVez);
        cliente.on('connect', () => {
            avisoConexao = false;
        });
    }
    return cliente;
}
export async function pingRedis() {
    try {
        const r = obterRedis();
        if (r.status === 'wait')
            await r.connect();
        await r.ping();
        avisoConexao = false;
        return true;
    }
    catch {
        return false;
    }
}
