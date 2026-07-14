/**
 * Dedupe de mensagens WhatsApp (Evolution + UazAPI).
 * Evita processar o mesmo messageId duas vezes no debounce.
 */
import { obterRedis } from './redis.js';

const PREFIXO = 'wa:dedupe:';
const TTL_SEG = 24 * 60 * 60;

/** true = mensagem nova (pode processar). false = ja vista. */
export async function marcarMensagemNova(messageId: string | undefined | null): Promise<boolean> {
  const id = String(messageId ?? '').trim();
  if (!id) return true;
  const redis = obterRedis();
  const ok = await redis.set(`${PREFIXO}${id}`, '1', 'EX', TTL_SEG, 'NX');
  return ok === 'OK';
}
