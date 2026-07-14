/**
 * Consulta Postgres Master T.I.: a linha WhatsApp tem licença de IA?
 * Sem URL configurada: só a instância principal (whatsappInstance) responde.
 */
import pg from 'pg';
import { config } from './config.js';

type CacheEntry = { ok: boolean; exp: number };

let pool: pg.Pool | null = null;
const cache = new Map<string, CacheEntry>();
const CACHE_MS = 45_000;

function normalizarInstance(name: string): string {
  return String(name || '').trim().toLowerCase();
}

function obterPool(): pg.Pool | null {
  const url = process.env.LICENCA_IA_DATABASE_URL?.trim();
  if (!url) return null;
  if (!pool) pool = new pg.Pool({ connectionString: url, max: 3 });
  return pool;
}

async function consultarPostgres(instance: string): Promise<boolean | null> {
  const p = obterPool();
  if (!p) return null;
  try {
    const { rows } = await p.query<{ habilitada: boolean }>(
      `SELECT habilitada FROM ia_licenca_linha
       WHERE lower(instance_name) = $1
       LIMIT 1`,
      [normalizarInstance(instance)],
    );
    if (!rows.length) return false;
    return rows[0].habilitada === true;
  } catch (err) {
    console.error('[licenca-ia] falha ao consultar master:', err);
    return null;
  }
}

/** true = IA pode responder nesta linha WhatsApp. */
export async function linhaTemLicencaIa(instance?: string | null): Promise<boolean> {
  const inst = (instance && String(instance).trim()) || config.whatsappInstance;
  const key = normalizarInstance(inst);
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.ok;

  const doPg = await consultarPostgres(inst);
  let ok: boolean;
  if (doPg === null) {
    // Sem master DB: só a linha principal.
    ok = key === normalizarInstance(config.whatsappInstance);
  } else {
    ok = doPg;
  }

  cache.set(key, { ok, exp: Date.now() + CACHE_MS });
  return ok;
}

/** Invalida cache (útil em testes). */
export function limparCacheLicencaIa(): void {
  cache.clear();
}
