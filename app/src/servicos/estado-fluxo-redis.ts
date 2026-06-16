/**
 * Estado de fluxo conversacional por telefone (Redis — sobrevive restart).
 */
import { obterRedis } from '../lib/redis.js';
import { normalizarTelefone } from '../util/telefone.js';

const redis = obterRedis();
const PREFIXO = 'fluxo:';
const TTL_SEG = 86400; // 24h

export async function obterEstadoFluxo<T>(telefone: string): Promise<T | null> {
  const raw = await redis.get(`${PREFIXO}${normalizarTelefone(telefone)}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function salvarEstadoFluxo(telefone: string, estado: unknown): Promise<void> {
  await redis.set(
    `${PREFIXO}${normalizarTelefone(telefone)}`,
    JSON.stringify(estado),
    'EX',
    TTL_SEG,
  );
}

export async function limparEstadoFluxo(telefone: string): Promise<void> {
  await redis.del(`${PREFIXO}${normalizarTelefone(telefone)}`);
}

/** Limpa todo estado (testes). */
export async function limparTodosEstadosFluxo(): Promise<void> {
  const keys = await redis.keys(`${PREFIXO}*`);
  if (keys.length > 0) await redis.del(...keys);
}
