/**
 * Marca envio da IA (evita ecos em integrações futuras).
 */
import { obterRedis } from '../lib/redis.js';
import { normalizarTelefone } from '../util/telefone.js';

const redis = obterRedis();
const PREFIXO = 'ia:enviando:';

export async function marcarEnvioIa(telefone: string, segundos = 60): Promise<void> {
  const n = normalizarTelefone(telefone);
  await redis.set(`${PREFIXO}${n}`, '1', 'EX', segundos);
}

export async function ehEnvioIa(telefone: string): Promise<boolean> {
  const n = normalizarTelefone(telefone);
  return (await redis.get(`${PREFIXO}${n}`)) === '1';
}

export async function limparMarcadorEnvioIa(telefone: string): Promise<void> {
  const n = normalizarTelefone(telefone);
  await redis.del(`${PREFIXO}${n}`);
}
