/**
 * Historico de conversas — Minas Placa clean.
 */
import pg from 'pg';
import { config } from './config.js';
import type { RegistroHistorico } from './lib/tipos.js';

const pool = new pg.Pool({ connectionString: config.databaseUrl });

export async function inicializarBancoHistorico(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS historico_conversa (
      id SERIAL PRIMARY KEY,
      telefone TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_historico_telefone_ts
    ON historico_conversa (telefone, timestamp DESC)
  `);
}

export async function obterHistorico(telefone: string, limite = 20): Promise<RegistroHistorico[]> {
  const res = await pool.query(
    'SELECT role, content, timestamp FROM historico_conversa WHERE telefone = $1 ORDER BY timestamp DESC LIMIT $2',
    [telefone, limite],
  );
  return res.rows
    .map((r) => ({
      role: r.role as 'user' | 'assistant',
      content: r.content as string,
      timestamp: new Date(r.timestamp as string).getTime(),
    }))
    .reverse();
}

export async function adicionarAoHistorico(
  telefone: string,
  mensagens: Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }>,
): Promise<void> {
  for (const m of mensagens) {
    await pool.query(
      'INSERT INTO historico_conversa (telefone, role, content, timestamp) VALUES ($1, $2, $3, $4)',
      [telefone, m.role, m.content, new Date(m.timestamp).toISOString()],
    );
  }
}
