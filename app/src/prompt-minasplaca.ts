/**
 * Prompt Minas Placa — persistencia simples no Postgres.
 */
import pg from 'pg';
import { config } from './config.js';

const pool = new pg.Pool({ connectionString: config.databaseUrl });

const PROMPT_PADRAO = `Voce e a assistente comercial da Minas Placa.

Responda de forma clara, prestativa e objetiva.
A Minas Placa vende placas de sinalizacao, placas de aluminio, placas de PVC e adesivos refletivos.
Quando o cliente pedir um orcamento, confirme a quantidade minima e calcule o valor total.

Se nao souber algo, diga que vai verificar com a equipe.`;

export async function inicializarBancoPrompt(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS configuracao (
      chave TEXT PRIMARY KEY,
      valor TEXT NOT NULL,
      atualizado_em TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  const existe = await pool.query('SELECT valor FROM configuracao WHERE chave = $1', ['prompt_sistema']);
  if (existe.rowCount === 0) {
    await pool.query(
      'INSERT INTO configuracao (chave, valor) VALUES ($1, $2)',
      ['prompt_sistema', PROMPT_PADRAO],
    );
  }
}

export async function obterPromptBruto(): Promise<string> {
  const res = await pool.query('SELECT valor FROM configuracao WHERE chave = $1', ['prompt_sistema']);
  return (res.rows[0]?.valor as string) ?? PROMPT_PADRAO;
}

export async function salvarPrompt(prompt: string): Promise<void> {
  await pool.query(
    `INSERT INTO configuracao (chave, valor, atualizado_em)
     VALUES ($1, $2, NOW())
     ON CONFLICT (chave) DO UPDATE SET valor = $2, atualizado_em = NOW()`,
    ['prompt_sistema', prompt],
  );
}
