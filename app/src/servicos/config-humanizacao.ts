/**
 * Configurações de humanização de envio (Postgres + cache em memória).
 */
import pg from 'pg';
import { config } from '../config.js';

const pool = new pg.Pool({ connectionString: config.databaseUrl });
const CHAVE = 'humanizacao_envio';

export interface ConfigHumanizacao {
  /** Delay aleatório entre mensagens (ms) */
  delayMinMs: number;
  delayMaxMs: number;
  /** Duração aleatória do "digitando..." antes de cada fragmento (ms) */
  digitandoMinMs: number;
  digitandoMaxMs: number;
  /** Ativa sendPresence composing na Evolution */
  digitandoAtivo: boolean;
}

export const HUMANIZACAO_PADRAO: ConfigHumanizacao = {
  delayMinMs: 200,
  delayMaxMs: 600,
  digitandoMinMs: 300,
  digitandoMaxMs: 800,
  digitandoAtivo: true,
};

let cache: ConfigHumanizacao | null = null;
let cacheEm = 0;
const CACHE_TTL_MS = 5000;

function normalizar(partial: Partial<ConfigHumanizacao>): ConfigHumanizacao {
  const base = { ...HUMANIZACAO_PADRAO, ...partial };
  const delayMinMs = Math.max(0, Math.min(base.delayMinMs, base.delayMaxMs));
  const delayMaxMs = Math.max(delayMinMs, base.delayMaxMs);
  const digitandoMinMs = Math.max(0, Math.min(base.digitandoMinMs, base.digitandoMaxMs));
  const digitandoMaxMs = Math.max(digitandoMinMs, base.digitandoMaxMs);
  return {
    delayMinMs,
    delayMaxMs,
    digitandoMinMs,
    digitandoMaxMs,
    digitandoAtivo: Boolean(base.digitandoAtivo),
  };
}

export async function obterConfigHumanizacao(): Promise<ConfigHumanizacao> {
  if (cache && Date.now() - cacheEm < CACHE_TTL_MS) return cache;

  try {
    const res = await pool.query('SELECT valor FROM configuracao WHERE chave = $1', [CHAVE]);
    if (res.rowCount && res.rows[0]?.valor) {
      const parsed = JSON.parse(res.rows[0].valor as string) as Partial<ConfigHumanizacao>;
      cache = normalizar(parsed);
      cacheEm = Date.now();
      return cache;
    }
  } catch {
    /* tabela pode não existir ainda */
  }

  cache = { ...HUMANIZACAO_PADRAO };
  cacheEm = Date.now();
  return cache;
}

export async function salvarConfigHumanizacao(dados: Partial<ConfigHumanizacao>): Promise<ConfigHumanizacao> {
  const normalizado = normalizar(dados);
  await pool.query(
    `INSERT INTO configuracao (chave, valor, atualizado_em)
     VALUES ($1, $2, NOW())
     ON CONFLICT (chave) DO UPDATE SET valor = $2, atualizado_em = NOW()`,
    [CHAVE, JSON.stringify(normalizado)],
  );
  cache = normalizado;
  cacheEm = Date.now();
  return normalizado;
}

/** Inteiro aleatório inclusivo entre min e max */
export function aleatorioEntre(min: number, max: number): number {
  const a = Math.floor(min);
  const b = Math.floor(max);
  if (b <= a) return a;
  return a + Math.floor(Math.random() * (b - a + 1));
}

export function aguardar(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
