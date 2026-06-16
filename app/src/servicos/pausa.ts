/**
 * Controle de pausa da IA — por contato ou global.
 */
import { obterRedis } from '../lib/redis.js';
import { normalizarTelefone } from '../util/telefone.js';
import { sincronizarPausaIaErp } from './erp-atendimento-motorista.js';

const redis = obterRedis();
const CHAVE_GLOBAL = 'pausa:global';
const PREFIXO_CONTATO = 'pausa:contato:';

export interface StatusPausa {
  global: boolean;
  globalMotivo?: string;
  contatos: Array<{ telefone: string; motivo?: string }>;
}

export async function pausaGlobalAtiva(): Promise<boolean> {
  return (await redis.get(CHAVE_GLOBAL)) === '1';
}

export async function pausarGlobal(motivo?: string): Promise<void> {
  await redis.set(CHAVE_GLOBAL, '1');
  if (motivo) await redis.set(`${CHAVE_GLOBAL}:motivo`, motivo);
}

export async function despausarGlobal(): Promise<void> {
  await redis.del(CHAVE_GLOBAL, `${CHAVE_GLOBAL}:motivo`);
}

export async function pausarContato(telefone: string, motivo?: string): Promise<void> {
  const n = normalizarTelefone(telefone);
  await redis.set(`${PREFIXO_CONTATO}${n}`, '1', 'EX', 86400 * 30);
  if (motivo) await redis.set(`${PREFIXO_CONTATO}${n}:motivo`, motivo, 'EX', 86400 * 30);
  await sincronizarPausaIaErp(n, true, motivo);
}

export async function despausarContato(telefone: string): Promise<void> {
  const n = normalizarTelefone(telefone);
  await redis.del(`${PREFIXO_CONTATO}${n}`, `${PREFIXO_CONTATO}${n}:motivo`);
  await sincronizarPausaIaErp(n, false);
}

export async function contatoPausado(telefone: string): Promise<boolean> {
  const n = normalizarTelefone(telefone);
  return (await redis.get(`${PREFIXO_CONTATO}${n}`)) === '1';
}

/** Verifica se a IA pode responder para este telefone */
export async function iaPodeResponder(telefone: string): Promise<boolean> {
  if (await pausaGlobalAtiva()) return false;
  if (await contatoPausado(telefone)) return false;
  return true;
}

export async function obterStatusPausa(): Promise<StatusPausa> {
  const global = await pausaGlobalAtiva();
  const globalMotivo = global ? (await redis.get(`${CHAVE_GLOBAL}:motivo`)) ?? undefined : undefined;

  const chaves = await redis.keys(`${PREFIXO_CONTATO}*`);
  const contatos: StatusPausa['contatos'] = [];
  for (const chave of chaves) {
    if (chave.endsWith(':motivo')) continue;
    const telefone = chave.replace(PREFIXO_CONTATO, '');
    if (!/^\d+$/.test(telefone)) continue;
    const motivo = (await redis.get(`${chave}:motivo`)) ?? undefined;
    contatos.push({ telefone, motivo });
  }

  return { global, globalMotivo, contatos };
}
