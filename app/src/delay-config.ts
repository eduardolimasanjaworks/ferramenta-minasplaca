/**
 * Configuracao de delay aleatorio entre respostas — controlada pelo painel.
 * Antes de cada fragmento enviado ao WhatsApp, aguarda um tempo aleatorio
 * entre delay_min_seg e delay_max_seg (em segundos).
 */
import pg from 'pg';
import { config } from './config.js';

const pool = new pg.Pool({ connectionString: config.databaseUrl });

export interface ConfigDelay {
  delay_min_seg: number;
  delay_max_seg: number;
  atualizado_em: string;
}

const MIN_PADRAO = 1;
const MAX_PADRAO = 4;

let cache: { valor: ConfigDelay; expira: number } | null = null;
const CACHE_MS = 15000;

export async function inicializarBancoDelay(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS config_delay (
      id INT PRIMARY KEY DEFAULT 1,
      delay_min_seg INT DEFAULT 1,
      delay_max_seg INT DEFAULT 4,
      atualizado_em TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT config_delay_single CHECK (id = 1)
    )
  `);
  await pool.query(
    `INSERT INTO config_delay (id, delay_min_seg, delay_max_seg)
     VALUES (1, $1, $2)
     ON CONFLICT (id) DO NOTHING`,
    [MIN_PADRAO, MAX_PADRAO],
  );
}

export async function obterConfigDelay(): Promise<ConfigDelay> {
  if (cache && cache.expira > Date.now()) return cache.valor;
  let valor: ConfigDelay = {
    delay_min_seg: MIN_PADRAO,
    delay_max_seg: MAX_PADRAO,
    atualizado_em: new Date().toISOString(),
  };
  try {
    const res = await pool.query(`SELECT * FROM config_delay WHERE id = 1`);
    if (res.rows.length > 0) {
      const r = res.rows[0];
      let minSeg = Math.min(Math.max(Number(r.delay_min_seg) || MIN_PADRAO, 0), 120);
      let maxSeg = Math.min(Math.max(Number(r.delay_max_seg) || MAX_PADRAO, 0), 120);
      if (maxSeg < minSeg) maxSeg = minSeg;
      valor = {
        delay_min_seg: minSeg,
        delay_max_seg: maxSeg,
        atualizado_em: r.atualizado_em ? new Date(r.atualizado_em).toISOString() : new Date().toISOString(),
      };
    }
  } catch (err) {
    console.error('[delay-config] Erro ao obter config:', err);
  }
  cache = { valor, expira: Date.now() + CACHE_MS };
  return valor;
}

export async function salvarConfigDelay(
  dados: { delay_min_seg?: number; delay_max_seg?: number },
): Promise<ConfigDelay> {
  const atual = await obterConfigDelay();
  let minSeg =
    dados.delay_min_seg === undefined
      ? atual.delay_min_seg
      : Math.min(Math.max(Math.round(Number(dados.delay_min_seg)) || atual.delay_min_seg, 0), 120);
  let maxSeg =
    dados.delay_max_seg === undefined
      ? atual.delay_max_seg
      : Math.min(Math.max(Math.round(Number(dados.delay_max_seg)) || atual.delay_max_seg, 0), 120);
  if (maxSeg < minSeg) maxSeg = minSeg;

  await pool.query(
    `INSERT INTO config_delay (id, delay_min_seg, delay_max_seg, atualizado_em)
     VALUES (1, $1, $2, NOW())
     ON CONFLICT (id) DO UPDATE
       SET delay_min_seg = EXCLUDED.delay_min_seg,
           delay_max_seg = EXCLUDED.delay_max_seg,
           atualizado_em = NOW()`,
    [minSeg, maxSeg],
  );
  cache = null;
  return obterConfigDelay();
}

/** Retorna delay aleatorio em milissegundos dentro do intervalo configurado. */
export async function obterDelayAleatorioMs(): Promise<number> {
  const cfg = await obterConfigDelay();
  const minMs = cfg.delay_min_seg * 1000;
  const maxMs = cfg.delay_max_seg * 1000;
  if (maxMs <= minMs) return minMs;
  return Math.floor(minMs + Math.random() * (maxMs - minMs + 1));
}
