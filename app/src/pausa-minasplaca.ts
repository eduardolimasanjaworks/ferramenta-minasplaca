/**
 * Controle de pausa da IA — por contato (telefone) e global.
 * - Estado ativo em Redis (rapido, checado a cada mensagem).
 * - Historico de eventos em Postgres (auditoria persistente).
 */
import pg from 'pg';
import { obterRedis } from './lib/redis.js';
import { config } from './config.js';
import { obterStatusConexaoAtivo } from './lib/canal-whatsapp.js';
import { normalizarTelefone, telefoneEhContatoValido, canonizarTelefoneBr } from './util/telefone.js';
import { publicarEventoPainel } from './painel-eventos.js';

/** IA não pode ser religada / considerada ativa sem WhatsApp conectado. */
export class IaBloqueadaPorWhatsappError extends Error {
  constructor(message = 'WhatsApp desconectado — a IA não pode ficar ativa') {
    super(message);
    this.name = 'IaBloqueadaPorWhatsappError';
  }
}

export async function whatsappConectadoParaIa(): Promise<boolean> {
  const status = await obterStatusConexaoAtivo();
  return status.conectado === true;
}

async function exigirWhatsappParaReligiar(pausar: boolean): Promise<void> {
  if (pausar) return;
  if (!(await whatsappConectadoParaIa())) {
    throw new IaBloqueadaPorWhatsappError();
  }
}

const redis = obterRedis();
const pool = new pg.Pool({ connectionString: config.databaseUrl });

const PREFIXO = 'ia:pausada:';
const CHAVE_GLOBAL = 'ia:pausa_global';

export interface EstadoPausa {
  pausada: boolean;
  telefone: string;
  status?: string;
  motivo?: string;
  origem?: string;
  atualizado_em: string;
}

export interface EstadoPausaGlobal {
  pausada: boolean;
  motivo?: string;
  origem?: string;
  atualizado_em: string;
}

export interface LogPausa {
  id: number;
  escopo: 'contato' | 'global';
  telefone: string | null;
  acao: 'pausada' | 'religada';
  status: string | null;
  motivo: string | null;
  origem: string | null;
  criado_em: string;
}

function chave(telefone: string): string {
  return `${PREFIXO}${canonizarTelefoneBr(telefone)}`;
}

export function validarTelefone(telefone: string): string {
  const n = canonizarTelefoneBr(telefone);
  if (!telefoneEhContatoValido(n)) {
    throw new Error(`Telefone invalido: ${telefone}`);
  }
  return n;
}

/** Status do Chatwoot que pausam a IA (atendimento humano ativo). */
const STATUS_PAUSA = new Set(['open', 'pending', 'snoozed']);
/** Status do Chatwoot que religam a IA. */
const STATUS_DESPAUSA = new Set(['resolved']);

export function statusImplicaPausa(status: string): boolean | null {
  const s = status.toLowerCase().trim();
  if (STATUS_PAUSA.has(s)) return true;
  if (STATUS_DESPAUSA.has(s)) return false;
  return null;
}

// ---------------------------------------------------------------------------
// Auditoria (Postgres)
// ---------------------------------------------------------------------------

export async function inicializarBancoPausa(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS log_pausa (
      id SERIAL PRIMARY KEY,
      escopo TEXT NOT NULL,
      telefone TEXT,
      acao TEXT NOT NULL,
      status TEXT,
      motivo TEXT,
      origem TEXT,
      criado_em TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_log_pausa_criado ON log_pausa (criado_em DESC)
  `);
}

async function registrarLog(evento: Omit<LogPausa, 'id' | 'criado_em'>): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO log_pausa (escopo, telefone, acao, status, motivo, origem)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [evento.escopo, evento.telefone, evento.acao, evento.status, evento.motivo, evento.origem],
    );
  } catch (err) {
    console.error('[pausa] Erro ao registrar log:', err);
  }
}

export async function obterLogsPausa(limite = 100, telefone?: string): Promise<LogPausa[]> {
  const n = Math.min(Math.max(Number(limite) || 100, 1), 500);
  try {
    if (telefone) {
      const tel = normalizarTelefone(telefone);
      const res = await pool.query(
        `SELECT * FROM log_pausa WHERE telefone = $1 ORDER BY criado_em DESC LIMIT $2`,
        [tel, n],
      );
      return res.rows as LogPausa[];
    }
    const res = await pool.query(
      `SELECT * FROM log_pausa ORDER BY criado_em DESC LIMIT $1`,
      [n],
    );
    return res.rows as LogPausa[];
  } catch (err) {
    console.error('[pausa] Erro ao obter logs:', err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Pausa por contato
// ---------------------------------------------------------------------------

export async function definirPausa(
  telefone: string,
  pausar: boolean,
  meta: { status?: string; motivo?: string; origem?: string } = {},
): Promise<EstadoPausa> {
  await exigirWhatsappParaReligiar(pausar);
  const n = validarTelefone(telefone);
  const estado: EstadoPausa = {
    pausada: pausar,
    telefone: n,
    status: meta.status,
    motivo: meta.motivo,
    origem: meta.origem,
    atualizado_em: new Date().toISOString(),
  };

  if (pausar) {
    await redis.set(chave(n), JSON.stringify(estado));
    console.log(`[pausa] IA PAUSADA para ${n} (status=${meta.status ?? 'manual'}, origem=${meta.origem ?? 'api'})`);
  } else {
    await redis.del(chave(n));
    console.log(`[pausa] IA RELIGADA para ${n} (status=${meta.status ?? 'manual'}, origem=${meta.origem ?? 'api'})`);
  }

  void publicarEventoPainel({
    tipo: 'pausa_contato',
    telefone: n,
    pausada: pausar,
    origem: meta.origem,
    atualizado_em: estado.atualizado_em,
  });

  void registrarLog({
    escopo: 'contato',
    telefone: n,
    acao: pausar ? 'pausada' : 'religada',
    status: meta.status ?? null,
    motivo: meta.motivo ?? null,
    origem: meta.origem ?? null,
  });

  // Mantém CRM alinhado (exceto quando a própria origem já é o CRM)
  if (meta.origem !== 'crm') {
    void import('./crm-store.js')
      .then((m) => m.espelharAutomacaoPorTelefone(n, !pausar))
      .catch(() => {});
  }

  return estado;
}

/** True se a IA nao deve responder (WhatsApp off, pausa global ou pausa do contato). */
export async function iaEstaPausada(telefone: string): Promise<boolean> {
  if (!(await whatsappConectadoParaIa())) return true;
  if (await pausaGlobalAtiva()) return true;
  const n = canonizarTelefoneBr(telefone);
  if (!n) return false;
  const raw = await redis.get(chave(n));
  if (!raw) return false;
  try {
    const estado = JSON.parse(raw) as EstadoPausa;
    return estado.pausada === true;
  } catch {
    return raw === '1' || raw === 'true';
  }
}

/** Lista contatos com pausa ativa no Redis. */
export async function listarPausasAtivas(): Promise<EstadoPausa[]> {
  const resultados: EstadoPausa[] = [];
  let cursor = '0';
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', `${PREFIXO}*`, 'COUNT', 100);
    cursor = next;
    for (const key of keys) {
      const raw = await redis.get(key);
      if (!raw) continue;
      try {
        const estado = JSON.parse(raw) as EstadoPausa;
        if (estado.pausada) resultados.push(estado);
      } catch {
        const tel = key.replace(PREFIXO, '');
        if (tel) {
          resultados.push({
            pausada: true,
            telefone: tel,
            atualizado_em: new Date().toISOString(),
          });
        }
      }
    }
  } while (cursor !== '0');
  return resultados.sort(
    (a, b) => new Date(b.atualizado_em).getTime() - new Date(a.atualizado_em).getTime(),
  );
}

export async function obterEstadoPausa(telefone: string): Promise<EstadoPausa | null> {
  const n = canonizarTelefoneBr(telefone);
  if (!n) return null;
  const raw = await redis.get(chave(n));
  if (!raw) {
    return { pausada: false, telefone: n, atualizado_em: new Date().toISOString() };
  }
  try {
    return JSON.parse(raw) as EstadoPausa;
  } catch {
    return { pausada: true, telefone: n, atualizado_em: new Date().toISOString() };
  }
}

// ---------------------------------------------------------------------------
// Pausa global
// ---------------------------------------------------------------------------

export async function definirPausaGlobal(
  pausar: boolean,
  meta: { motivo?: string; origem?: string } = {},
): Promise<EstadoPausaGlobal> {
  await exigirWhatsappParaReligiar(pausar);
  const estado: EstadoPausaGlobal = {
    pausada: pausar,
    motivo: meta.motivo,
    origem: meta.origem,
    atualizado_em: new Date().toISOString(),
  };

  if (pausar) {
    await redis.set(CHAVE_GLOBAL, JSON.stringify(estado));
    console.log(`[pausa] IA PAUSADA GLOBALMENTE (origem=${meta.origem ?? 'painel'})`);
  } else {
    await redis.del(CHAVE_GLOBAL);
    console.log(`[pausa] IA RELIGADA GLOBALMENTE (origem=${meta.origem ?? 'painel'})`);
  }

  void publicarEventoPainel({
    tipo: 'pausa_global',
    pausada: pausar,
    atualizado_em: estado.atualizado_em,
  });

  void registrarLog({
    escopo: 'global',
    telefone: null,
    acao: pausar ? 'pausada' : 'religada',
    status: null,
    motivo: meta.motivo ?? null,
    origem: meta.origem ?? null,
  });

  return estado;
}

export async function pausaGlobalAtiva(): Promise<boolean> {
  const raw = await redis.get(CHAVE_GLOBAL);
  if (!raw) return false;
  try {
    return (JSON.parse(raw) as EstadoPausaGlobal).pausada === true;
  } catch {
    return raw === '1' || raw === 'true';
  }
}

export async function obterEstadoPausaGlobal(): Promise<EstadoPausaGlobal> {
  const raw = await redis.get(CHAVE_GLOBAL);
  if (!raw) {
    return { pausada: false, atualizado_em: new Date().toISOString() };
  }
  try {
    return JSON.parse(raw) as EstadoPausaGlobal;
  } catch {
    return { pausada: true, atualizado_em: new Date().toISOString() };
  }
}

export interface ResultadoPausaLote {
  ok: boolean;
  total: number;
  pausadas?: number;
  religadas?: number;
  resultados: EstadoPausa[];
  erros: string[];
}

/** Pausa ou religa vários contatos (sem afetar pausa global). */
export async function pausarContatosEmLote(
  telefones: string[],
  pausar: boolean,
  meta: { motivo?: string; origem?: string } = {},
): Promise<ResultadoPausaLote> {
  const resultados: EstadoPausa[] = [];
  const erros: string[] = [];
  const unicos = new Set<string>();

  for (const raw of telefones) {
    try {
      const n = validarTelefone(raw);
      if (unicos.has(n)) continue;
      unicos.add(n);
      const estado = await definirPausa(n, pausar, {
        motivo: meta.motivo ?? (pausar ? 'Pausa em lote pelo painel' : 'Religada em lote pelo painel'),
        origem: meta.origem ?? 'painel-lote',
      });
      resultados.push(estado);
    } catch (err) {
      erros.push(`${raw}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    ok: erros.length === 0 || resultados.length > 0,
    total: resultados.length,
    pausadas: pausar ? resultados.length : undefined,
    religadas: pausar ? undefined : resultados.length,
    resultados,
    erros,
  };
}

/** Pausa todas as conversas com histórico recente (não altera pausa global). */
export async function pausarTodasConversasIniciadas(
  dias = 90,
): Promise<ResultadoPausaLote & { telefones_encontrados: number }> {
  const { listarConversasIniciadas } = await import('./historico-minasplaca.js');
  const conversas = await listarConversasIniciadas(dias);
  const paraPausar = conversas.filter((c) => !c.pausada).map((c) => c.telefone);
  const resultado = await pausarContatosEmLote(paraPausar, true, {
    motivo: 'Pausa em massa — todas as conversas iniciadas',
    origem: 'painel-massa',
  });
  return { ...resultado, telefones_encontrados: conversas.length };
}
