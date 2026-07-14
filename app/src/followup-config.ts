/**
 * Configuracao do follow-up — controlada pelo painel.
 * - ativo: liga/desliga o follow-up automatico.
 * - minutos: tempo de silencio do cliente antes de disparar.
 * - instrucoes: regras/modelo que a IA usa ao elaborar o follow-up.
 *
 * Persistido em Postgres. Cache curto em memoria para nao consultar o banco
 * a cada agendamento.
 */
import pg from 'pg';
import { config } from './config.js';

const pool = new pg.Pool({ connectionString: config.databaseUrl });

export const INSTRUCAO_PADRAO =
  'Você deve realizar um follow-up com o cliente apenas se ele iniciou um pedido/cotação e não concluiu. ' +
  'Avalie o contexto da conversa e decida se o follow-up faz sentido. Se sim, escreva uma mensagem curta, ' +
  'amigável e consultiva em nome do Rafael para retomar o contato de onde pararam. Seja breve (máximo 2 ' +
  'parágrafos pequenos), não repita preços desnecessariamente e termine com uma pergunta simples e receptiva. ' +
  'Modelo de referência: "Oi! Posso te ajudar a concluir seu pedido?"';

const MINUTOS_PADRAO = Math.max(1, Math.round((config.followupMs || 1800000) / 60000));

export interface ConfigFollowup {
  ativo: boolean;
  minutos: number;
  instrucoes: string;
  atualizado_em: string;
}

let cache: { valor: ConfigFollowup; expira: number } | null = null;
const CACHE_MS = 15000;

export async function inicializarBancoFollowup(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS config_followup (
      id INT PRIMARY KEY DEFAULT 1,
      ativo BOOLEAN DEFAULT TRUE,
      minutos INT DEFAULT 30,
      instrucoes TEXT,
      atualizado_em TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT config_followup_single CHECK (id = 1)
    )
  `);
  await pool.query(
    `INSERT INTO config_followup (id, ativo, minutos, instrucoes)
     VALUES (1, TRUE, $1, $2)
     ON CONFLICT (id) DO NOTHING`,
    [MINUTOS_PADRAO, INSTRUCAO_PADRAO],
  );
}

export async function obterConfigFollowup(): Promise<ConfigFollowup> {
  if (cache && cache.expira > Date.now()) return cache.valor;
  let valor: ConfigFollowup = {
    ativo: true,
    minutos: MINUTOS_PADRAO,
    instrucoes: INSTRUCAO_PADRAO,
    atualizado_em: new Date().toISOString(),
  };
  try {
    const res = await pool.query(`SELECT * FROM config_followup WHERE id = 1`);
    if (res.rows.length > 0) {
      const r = res.rows[0];
      valor = {
        ativo: r.ativo !== false,
        minutos: Math.min(Math.max(Number(r.minutos) || MINUTOS_PADRAO, 1), 1440),
        instrucoes: r.instrucoes || INSTRUCAO_PADRAO,
        atualizado_em: r.atualizado_em ? new Date(r.atualizado_em).toISOString() : new Date().toISOString(),
      };
    }
  } catch (err) {
    console.error('[followup-config] Erro ao obter config:', err);
  }
  cache = { valor, expira: Date.now() + CACHE_MS };
  return valor;
}

export async function salvarConfigFollowup(
  dados: { ativo?: boolean; minutos?: number; instrucoes?: string },
): Promise<ConfigFollowup> {
  const atual = await obterConfigFollowup();
  const ativo = dados.ativo === undefined ? atual.ativo : dados.ativo === true;
  const minutos =
    dados.minutos === undefined
      ? atual.minutos
      : Math.min(Math.max(Math.round(Number(dados.minutos)) || atual.minutos, 1), 1440);
  const instrucoes = dados.instrucoes === undefined ? atual.instrucoes : (dados.instrucoes || INSTRUCAO_PADRAO);

  await pool.query(
    `INSERT INTO config_followup (id, ativo, minutos, instrucoes, atualizado_em)
     VALUES (1, $1, $2, $3, NOW())
     ON CONFLICT (id) DO UPDATE
       SET ativo = EXCLUDED.ativo,
           minutos = EXCLUDED.minutos,
           instrucoes = EXCLUDED.instrucoes,
           atualizado_em = NOW()`,
    [ativo, minutos, instrucoes],
  );
  cache = null;
  return obterConfigFollowup();
}
