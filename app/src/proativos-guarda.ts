/**
 * Guarda anti-acúmulo dos disparos proativos.
 * Garante no máximo 1 mensagem por alvo/dia em cada job (mesmo com vários
 * horários) e detecta "religada" — job parado por 1+ dia que voltou a rodar —
 * para que jobs com backlog (ex.: rastreio) valham só daqui pra frente.
 */
import { obterRedis } from './lib/redis.js';

const redis = obterRedis();
const PREFIXO_SENT = 'proativo:sent:';
const PREFIXO_JOB_DIA = 'proativo:jobdia:';
const CHAVE_CORTE_RASTREIO = 'proativo:rastreio:corte-id';
const TTL_SENT_SEGUNDOS = 60 * 60 * 26;

/** Já enviamos para este alvo hoje? Dedupe por dia, independe do horário. */
export async function jaEnviadoNoDia(slug: string, dia: string, idAlvo: string): Promise<boolean> {
  const v = await redis.get(`${PREFIXO_SENT}${slug}:${dia}:${idAlvo}`);
  return v === '1';
}

export async function marcarEnviadoNoDia(slug: string, dia: string, idAlvo: string): Promise<void> {
  await redis.set(`${PREFIXO_SENT}${slug}:${dia}:${idAlvo}`, '1', 'EX', TTL_SENT_SEGUNDOS);
}

/** Heartbeat: registra que o job estava ativo e habilitado neste dia. */
export async function registrarJobAtivoNoDia(slug: string, dia: string): Promise<void> {
  await redis.set(`${PREFIXO_JOB_DIA}${slug}`, dia);
}

/**
 * Religada = job nunca rodou ou ficou parado por mais de 1 dia
 * (app desligado, disparos desabilitados ou job desativado no painel).
 */
export async function jobEstaReligando(slug: string, dia: string): Promise<boolean> {
  const ultimoDia = await redis.get(`${PREFIXO_JOB_DIA}${slug}`);
  if (!ultimoDia) return true;
  if (ultimoDia === dia) return false;
  const msPorDia = 24 * 60 * 60 * 1000;
  const diffDias = (new Date(dia).getTime() - new Date(ultimoDia).getTime()) / msPorDia;
  return diffDias > 1;
}

/** Corte do rastreio: só pedidos com id_ped ACIMA dele recebem disparos. */
export async function obterCorteRastreio(): Promise<number> {
  const v = await redis.get(CHAVE_CORTE_RASTREIO);
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function definirCorteRastreio(maiorIdPed: number): Promise<void> {
  await redis.set(CHAVE_CORTE_RASTREIO, String(maiorIdPed));
}
