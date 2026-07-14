/**
 * Historico de conversas — Minas Placa clean.
 */
import pg from 'pg';
import { config } from './config.js';
import type { RegistroHistorico } from './lib/tipos.js';
import { canonizarTelefoneBr, variantesTelefoneBr, telefoneEhContatoValido } from './util/telefone.js';

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

function mapRow(r: { role: string; content: string; timestamp: Date | string }): RegistroHistorico {
  return {
    role: r.role as 'user' | 'assistant',
    content: r.content,
    timestamp: new Date(r.timestamp).getTime(),
  };
}

/** Mensagens proativas recentes (logs) para enriquecer o histórico da IA. */
async function obterMensagensProativas(
  telefones: string[],
  limite = 5,
): Promise<RegistroHistorico[]> {
  if (!telefones.length) return [];
  try {
    const res = await pool.query(
      `SELECT telefone, payload_resumo, criado_em
       FROM proativos_disparos_log
       WHERE telefone = ANY($1)
         AND status IN ('enviado', 'teste')
         AND payload_resumo IS NOT NULL
         AND payload_resumo <> ''
         AND criado_em > NOW() - INTERVAL '7 days'
       ORDER BY criado_em DESC
       LIMIT $2`,
      [telefones, limite],
    );
    return res.rows.map((r) => ({
      role: 'assistant' as const,
      content: `[Mensagem proativa automática — ${r.telefone}]\n${String(r.payload_resumo)}`,
      timestamp: new Date(r.criado_em as string).getTime(),
    }));
  } catch {
    return [];
  }
}

function mesclarHistorico(
  mensagens: RegistroHistorico[],
  proativas: RegistroHistorico[],
): RegistroHistorico[] {
  const chaves = new Set(
    mensagens.map((m) => `${m.role}:${m.content.slice(0, 120)}`),
  );
  const extras: RegistroHistorico[] = [];
  for (const p of proativas) {
    const chave = `assistant:${p.content.slice(0, 120)}`;
    const chaveSemPrefixo = `assistant:${p.content.replace(/^\[Mensagem proativa[^\]]*\]\n/, '').slice(0, 120)}`;
    const jaTem = [...chaves].some(
      (k) => k.includes(chaveSemPrefixo.slice(10)) || chaveSemPrefixo.includes(k.slice(10)),
    );
    if (!chaves.has(chave) && !jaTem) {
      extras.push(p);
      chaves.add(chave);
    }
  }
  return [...mensagens, ...extras].sort((a, b) => a.timestamp - b.timestamp);
}

export async function obterHistorico(telefone: string, limite = 20): Promise<RegistroHistorico[]> {
  const canon = canonizarTelefoneBr(telefone);
  const variantes = variantesTelefoneBr(telefone);

  const res = await pool.query(
    `SELECT role, content, timestamp FROM historico_conversa
     WHERE telefone = ANY($1)
     ORDER BY timestamp DESC
     LIMIT $2`,
    [variantes, limite],
  );

  const mensagens = res.rows.map(mapRow).reverse();
  const proativas = await obterMensagensProativas(variantes, 3);
  return mesclarHistorico(mensagens, proativas);
}

export async function adicionarAoHistorico(
  telefone: string,
  mensagens: Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }>,
): Promise<void> {
  const canon = canonizarTelefoneBr(telefone);
  for (const m of mensagens) {
    await pool.query(
      'INSERT INTO historico_conversa (telefone, role, content, timestamp) VALUES ($1, $2, $3, $4)',
      [canon, m.role, m.content, new Date(m.timestamp).toISOString()],
    );
  }
}

export interface ConversaIniciada {
  telefone: string;
  ultima_msg: string;
  total_mensagens: number;
  pausada: boolean;
}

/** Conversas com histórico recente + estado de pausa por contato. */
export async function listarConversasIniciadas(dias = 90): Promise<ConversaIniciada[]> {
  const diasNum = Math.min(365, Math.max(1, Number(dias) || 90));
  const res = await pool.query(
    `SELECT telefone, MAX(timestamp) AS ultima_msg, COUNT(*)::int AS total
     FROM historico_conversa
     WHERE timestamp > NOW() - ($1::text || ' days')::interval
     GROUP BY telefone
     ORDER BY ultima_msg DESC`,
    [String(diasNum)],
  );

  const mapa = new Map<string, { ultima_msg: Date; total: number }>();
  for (const row of res.rows) {
    const canon = canonizarTelefoneBr(String(row.telefone ?? ''));
    if (!telefoneEhContatoValido(canon)) continue;
    const ultima = new Date(row.ultima_msg as string);
    const total = Number(row.total) || 0;
    const existente = mapa.get(canon);
    if (!existente || ultima > existente.ultima_msg) {
      mapa.set(canon, {
        ultima_msg: ultima,
        total: (existente?.total ?? 0) + total,
      });
    } else if (existente) {
      existente.total += total;
    }
  }

  const { obterEstadoPausa } = await import('./pausa-minasplaca.js');
  const lista: ConversaIniciada[] = [];
  for (const [telefone, info] of mapa) {
    const est = await obterEstadoPausa(telefone);
    lista.push({
      telefone,
      ultima_msg: info.ultima_msg.toISOString(),
      total_mensagens: info.total,
      pausada: est?.pausada === true,
    });
  }

  return lista.sort(
    (a, b) => new Date(b.ultima_msg).getTime() - new Date(a.ultima_msg).getTime(),
  );
}
