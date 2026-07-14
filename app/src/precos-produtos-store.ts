import pg from 'pg';
import { config } from './config.js';
import {
  CATEGORIAS_PRECOS,
  EXTRAS_LABELS,
  PRECOS_EXTRAS_PADRAO,
  type FaixaPreco,
} from './precos-tabelas-padrao.js';

const pool = new pg.Pool({ connectionString: config.databaseUrl });
const QTD_MAX_INF = 2_147_483_647;
const CACHE_MS = 30_000;

let cacheTabelas: Record<string, FaixaPreco[]> | null = null;
let cacheExtras: Record<string, number> | null = null;
let cacheExpira = 0;

export interface LinhaPrecoDb {
  id: number;
  categoria: string;
  qtd_min: number;
  qtd_max: number;
  tamanho: string;
  preco: number;
}

export interface CategoriaPrecosPainel {
  slug: string;
  nome: string;
  faixas: FaixaPreco[];
}

function qtdMaxParaDb(max: number): number {
  return !Number.isFinite(max) || max >= QTD_MAX_INF ? QTD_MAX_INF : max;
}

function qtdMaxDeDb(max: number): number {
  return max >= QTD_MAX_INF ? Infinity : max;
}

function invalidarCache(): void {
  cacheTabelas = null;
  cacheExtras = null;
  cacheExpira = 0;
}

function montarFaixas(linhas: LinhaPrecoDb[]): Record<string, FaixaPreco[]> {
  const mapa = new Map<string, Map<string, FaixaPreco>>();

  for (const linha of linhas) {
    const chaveFaixa = `${linha.categoria}:${linha.qtd_min}:${linha.qtd_max}`;
    if (!mapa.has(linha.categoria)) mapa.set(linha.categoria, new Map());
    const porFaixa = mapa.get(linha.categoria)!;
    if (!porFaixa.has(chaveFaixa)) {
      porFaixa.set(chaveFaixa, {
        min: linha.qtd_min,
        max: qtdMaxDeDb(linha.qtd_max),
        precos: {},
      });
    }
    porFaixa.get(chaveFaixa)!.precos[linha.tamanho] = Number(linha.preco);
  }

  const resultado: Record<string, FaixaPreco[]> = {};
  for (const [categoria, faixasMap] of mapa) {
    resultado[categoria] = Array.from(faixasMap.values()).sort((a, b) => a.min - b.min);
  }
  return resultado;
}

export async function inicializarBancoPrecos(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS precos_faixa (
      id SERIAL PRIMARY KEY,
      categoria VARCHAR(32) NOT NULL,
      qtd_min INTEGER NOT NULL,
      qtd_max INTEGER NOT NULL,
      tamanho VARCHAR(16) NOT NULL,
      preco NUMERIC(12, 4) NOT NULL,
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (categoria, qtd_min, qtd_max, tamanho)
    );
    CREATE TABLE IF NOT EXISTS precos_extra (
      chave VARCHAR(64) PRIMARY KEY,
      valor NUMERIC(12, 4) NOT NULL,
      label TEXT,
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const { rows } = await pool.query<{ n: string }>('SELECT COUNT(*)::text AS n FROM precos_faixa');
  if (Number(rows[0]?.n ?? 0) === 0) {
    await semearPrecosPadrao();
  } else {
    const extras = await pool.query<{ n: string }>('SELECT COUNT(*)::text AS n FROM precos_extra');
    if (Number(extras.rows[0]?.n ?? 0) === 0) {
      await semearExtrasPadrao();
    }
  }
}

async function semearExtrasPadrao(): Promise<void> {
  for (const [chave, valor] of Object.entries(PRECOS_EXTRAS_PADRAO)) {
    await pool.query(
      `INSERT INTO precos_extra (chave, valor, label) VALUES ($1, $2, $3)
       ON CONFLICT (chave) DO NOTHING`,
      [chave, valor, EXTRAS_LABELS[chave] ?? chave],
    );
  }
}

export async function semearPrecosPadrao(): Promise<void> {
  for (const cat of CATEGORIAS_PRECOS) {
    for (const faixa of cat.tabela) {
      const qtdMax = qtdMaxParaDb(faixa.max);
      for (const [tamanho, preco] of Object.entries(faixa.precos)) {
        await pool.query(
          `INSERT INTO precos_faixa (categoria, qtd_min, qtd_max, tamanho, preco)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (categoria, qtd_min, qtd_max, tamanho) DO NOTHING`,
          [cat.slug, faixa.min, qtdMax, tamanho, preco],
        );
      }
    }
  }
  await semearExtrasPadrao();
  invalidarCache();
}

export async function obterTabelasPrecos(): Promise<Record<string, FaixaPreco[]>> {
  const agora = Date.now();
  if (cacheTabelas && agora < cacheExpira) return cacheTabelas;

  const { rows } = await pool.query<LinhaPrecoDb>(
    'SELECT id, categoria, qtd_min, qtd_max, tamanho, preco::float8 AS preco FROM precos_faixa ORDER BY categoria, qtd_min, tamanho',
  );

  if (!rows.length) {
    cacheTabelas = Object.fromEntries(CATEGORIAS_PRECOS.map((c) => [c.slug, c.tabela]));
  } else {
    cacheTabelas = montarFaixas(rows);
  }
  cacheExpira = agora + CACHE_MS;
  return cacheTabelas;
}

export async function obterPrecosExtras(): Promise<Record<string, number>> {
  const agora = Date.now();
  if (cacheExtras && agora < cacheExpira) return cacheExtras;

  const { rows } = await pool.query<{ chave: string; valor: string }>(
    'SELECT chave, valor::text FROM precos_extra',
  );

  const extras = { ...PRECOS_EXTRAS_PADRAO };
  for (const row of rows) {
    extras[row.chave] = Number(row.valor);
  }
  cacheExtras = extras;
  if (!cacheTabelas) cacheExpira = agora + CACHE_MS;
  return cacheExtras;
}

export async function listarCategoriasPrecosPainel(): Promise<CategoriaPrecosPainel[]> {
  const tabelas = await obterTabelasPrecos();
  return CATEGORIAS_PRECOS.map((cat) => ({
    slug: cat.slug,
    nome: cat.nome,
    faixas: tabelas[cat.slug] ?? cat.tabela,
  }));
}

export async function listarExtrasPainel(): Promise<Array<{ chave: string; valor: number; label: string | null }>> {
  const extras = await obterPrecosExtras();
  const { rows } = await pool.query<{ chave: string; label: string | null }>(
    'SELECT chave, label FROM precos_extra ORDER BY chave',
  );
  const labels = new Map(rows.map((r) => [r.chave, r.label]));
  return Object.entries(extras).map(([chave, valor]) => ({
    chave,
    valor,
    label: labels.get(chave) ?? EXTRAS_LABELS[chave] ?? chave,
  }));
}

export async function resetarPrecosPadrao(): Promise<void> {
  await pool.query('TRUNCATE precos_faixa RESTART IDENTITY');
  await pool.query('TRUNCATE precos_extra');
  await semearPrecosPadrao();
}

export async function atualizarPrecoCelula(dados: {
  categoria: string;
  qtd_min: number;
  qtd_max: number;
  tamanho: string;
  preco: number;
}): Promise<void> {
  const qtdMax = qtdMaxParaDb(dados.qtd_max);
  await pool.query(
    `INSERT INTO precos_faixa (categoria, qtd_min, qtd_max, tamanho, preco, atualizado_em)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (categoria, qtd_min, qtd_max, tamanho)
     DO UPDATE SET preco = EXCLUDED.preco, atualizado_em = NOW()`,
    [dados.categoria, dados.qtd_min, qtdMax, dados.tamanho, dados.preco],
  );
  invalidarCache();
}

export async function atualizarPrecoExtra(chave: string, valor: number): Promise<void> {
  await pool.query(
    `INSERT INTO precos_extra (chave, valor, atualizado_em) VALUES ($1, $2, NOW())
     ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = NOW()`,
    [chave, valor],
  );
  invalidarCache();
}

export async function salvarLotePrecos(linhas: Array<{
  categoria: string;
  qtd_min: number;
  qtd_max: number;
  tamanho: string;
  preco: number;
}>): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const linha of linhas) {
      const qtdMax = qtdMaxParaDb(linha.qtd_max);
      await client.query(
        `INSERT INTO precos_faixa (categoria, qtd_min, qtd_max, tamanho, preco, atualizado_em)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (categoria, qtd_min, qtd_max, tamanho)
         DO UPDATE SET preco = EXCLUDED.preco, atualizado_em = NOW()`,
        [linha.categoria, linha.qtd_min, qtdMax, linha.tamanho, linha.preco],
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  invalidarCache();
}
