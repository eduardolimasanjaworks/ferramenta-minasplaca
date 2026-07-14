import pg from 'pg';
import { config } from './config.js';

const pool = new pg.Pool({ connectionString: config.databaseUrl });

export interface EntregaPosVenda {
  id: number;
  id_pedido: string;
  nome: string;
  telefone: string;
  data_entrega: Date;
  origem: string;
  criado_em: Date;
}

export interface LogDisparoProativo {
  id: number;
  job_slug: string;
  telefone: string;
  id_alvo: string;
  status: string;
  erro: string | null;
  payload_resumo: string | null;
  criado_em: Date;
}

export async function inicializarTabelasProativos(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS entregas_pos_venda (
      id SERIAL PRIMARY KEY,
      id_pedido VARCHAR(64) NOT NULL,
      nome VARCHAR(255) NOT NULL DEFAULT '',
      telefone VARCHAR(32) NOT NULL,
      data_entrega DATE NOT NULL,
      origem VARCHAR(64) NOT NULL DEFAULT 'rastreamento',
      criado_em TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (id_pedido)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS proativos_disparos_log (
      id SERIAL PRIMARY KEY,
      job_slug VARCHAR(64) NOT NULL,
      telefone VARCHAR(32) NOT NULL,
      id_alvo VARCHAR(128) NOT NULL DEFAULT '',
      status VARCHAR(32) NOT NULL,
      erro TEXT,
      payload_resumo TEXT,
      criado_em TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_proativos_log_criado ON proativos_disparos_log (criado_em DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_entregas_pos_data ON entregas_pos_venda (data_entrega)
  `);
}

export async function inserirEntregaPosVenda(dados: {
  id_pedido: string;
  nome: string;
  telefone: string;
  data_entrega: Date;
  origem?: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO entregas_pos_venda (id_pedido, nome, telefone, data_entrega, origem)
     VALUES ($1, $2, $3, $4::date, $5)
     ON CONFLICT (id_pedido) DO NOTHING`,
    [dados.id_pedido, dados.nome, dados.telefone, dados.data_entrega, dados.origem ?? 'rastreamento'],
  );
}

export async function listarEntregasPosVenda(): Promise<EntregaPosVenda[]> {
  const res = await pool.query(
    `SELECT id, id_pedido, nome, telefone, data_entrega, origem, criado_em
     FROM entregas_pos_venda
     ORDER BY data_entrega DESC`,
  );
  return res.rows.map((r) => ({
    ...r,
    data_entrega: new Date(r.data_entrega),
    criado_em: new Date(r.criado_em),
  }));
}

export async function registrarLogDisparo(dados: {
  job_slug: string;
  telefone: string;
  id_alvo: string;
  status: 'enviado' | 'pulado' | 'erro' | 'dry_run' | 'teste';
  erro?: string;
  payload_resumo?: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO proativos_disparos_log (job_slug, telefone, id_alvo, status, erro, payload_resumo)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      dados.job_slug,
      dados.telefone,
      dados.id_alvo,
      dados.status,
      dados.erro ?? null,
      dados.payload_resumo ?? null,
    ],
  );
}

export async function listarLogsDisparos(limite = 50): Promise<LogDisparoProativo[]> {
  const res = await pool.query(
    `SELECT id, job_slug, telefone, id_alvo, status, erro, payload_resumo, criado_em
     FROM proativos_disparos_log
     ORDER BY criado_em DESC
     LIMIT $1`,
    [limite],
  );
  return res.rows.map((r) => ({ ...r, criado_em: new Date(r.criado_em) }));
}
