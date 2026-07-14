/**
 * Notificacao de intervencao humana — Minas Placa.
 *
 * Quando a IA (ou uma regra) detecta que a conversa precisa de um humano,
 * dispara uma mensagem de WhatsApp para um telefone de destino configuravel,
 * usando um modelo com variaveis:
 *   #name_contact#  -> nome do cliente
 *   #phone_contact# -> telefone do cliente
 *   #date#          -> data (America/Sao_Paulo)
 *   #time#          -> hora (America/Sao_Paulo)
 *   #motivo#        -> motivo resumido da transferencia
 *
 * Config (telefone/mensagem/ativo) persistida em Postgres e editavel pelo painel.
 * Estado de "ja notificado recentemente" em Redis para evitar spam.
 */
import pg from 'pg';
import { config } from './config.js';
import { obterRedis } from './lib/redis.js';
import { enviarTextoAtivo } from './lib/canal-whatsapp.js';
import { normalizarTelefone, telefoneEhContatoValido } from './util/telefone.js';

const pool = new pg.Pool({ connectionString: config.databaseUrl });
const redis = obterRedis();

const PREFIXO_DEDUPE = 'notif:humano:';
const TTL_DEDUPE_SEG = 6 * 60 * 60; // 6h — nao renotifica o mesmo contato nesse intervalo

export const MENSAGEM_PADRAO =
  '🔔 *Intervenção humana necessária*\n\n' +
  'Cliente: #name_contact#\n' +
  'Telefone: #phone_contact#\n' +
  'Data: #date# às #time#\n' +
  'Motivo: #motivo#';

export interface ConfigNotificacao {
  telefone_destino: string | null;
  mensagem_modelo: string;
  ativo: boolean;
  atualizado_em: string;
}

export interface LogNotificacao {
  id: number;
  telefone_cliente: string | null;
  nome_cliente: string | null;
  telefone_destino: string | null;
  motivo: string | null;
  enviado: boolean;
  detalhe: string | null;
  criado_em: string;
}

export async function inicializarBancoNotificacao(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS config_notificacao (
      id INT PRIMARY KEY DEFAULT 1,
      telefone_destino TEXT,
      mensagem_modelo TEXT,
      ativo BOOLEAN DEFAULT TRUE,
      atualizado_em TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT config_notificacao_single CHECK (id = 1)
    )
  `);
  await pool.query(
    `INSERT INTO config_notificacao (id, telefone_destino, mensagem_modelo, ativo)
     VALUES (1, NULL, $1, TRUE)
     ON CONFLICT (id) DO NOTHING`,
    [MENSAGEM_PADRAO],
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS log_notificacao (
      id SERIAL PRIMARY KEY,
      telefone_cliente TEXT,
      nome_cliente TEXT,
      telefone_destino TEXT,
      motivo TEXT,
      enviado BOOLEAN NOT NULL,
      detalhe TEXT,
      criado_em TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_log_notificacao_criado ON log_notificacao (criado_em DESC)
  `);
}

export async function obterConfigNotificacao(): Promise<ConfigNotificacao> {
  try {
    const res = await pool.query(`SELECT * FROM config_notificacao WHERE id = 1`);
    if (res.rows.length > 0) {
      const r = res.rows[0];
      return {
        telefone_destino: r.telefone_destino ?? null,
        mensagem_modelo: r.mensagem_modelo || MENSAGEM_PADRAO,
        ativo: r.ativo !== false,
        atualizado_em: r.atualizado_em ? new Date(r.atualizado_em).toISOString() : new Date().toISOString(),
      };
    }
  } catch (err) {
    console.error('[notificacao] Erro ao obter config:', err);
  }
  return { telefone_destino: null, mensagem_modelo: MENSAGEM_PADRAO, ativo: true, atualizado_em: new Date().toISOString() };
}

export async function salvarConfigNotificacao(
  dados: { telefone_destino?: string | null; mensagem_modelo?: string; ativo?: boolean },
): Promise<ConfigNotificacao> {
  const atual = await obterConfigNotificacao();
  const telefoneDestino =
    dados.telefone_destino === undefined
      ? atual.telefone_destino
      : dados.telefone_destino
        ? normalizarTelefone(dados.telefone_destino)
        : null;
  const mensagem = dados.mensagem_modelo === undefined ? atual.mensagem_modelo : (dados.mensagem_modelo || MENSAGEM_PADRAO);
  const ativo = dados.ativo === undefined ? atual.ativo : dados.ativo === true;

  await pool.query(
    `INSERT INTO config_notificacao (id, telefone_destino, mensagem_modelo, ativo, atualizado_em)
     VALUES (1, $1, $2, $3, NOW())
     ON CONFLICT (id) DO UPDATE
       SET telefone_destino = EXCLUDED.telefone_destino,
           mensagem_modelo = EXCLUDED.mensagem_modelo,
           ativo = EXCLUDED.ativo,
           atualizado_em = NOW()`,
    [telefoneDestino, mensagem, ativo],
  );
  return obterConfigNotificacao();
}

async function registrarLog(log: Omit<LogNotificacao, 'id' | 'criado_em'>): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO log_notificacao (telefone_cliente, nome_cliente, telefone_destino, motivo, enviado, detalhe)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [log.telefone_cliente, log.nome_cliente, log.telefone_destino, log.motivo, log.enviado, log.detalhe],
    );
  } catch (err) {
    console.error('[notificacao] Erro ao registrar log:', err);
  }
}

export async function obterLogsNotificacao(limite = 50): Promise<LogNotificacao[]> {
  const n = Math.min(Math.max(Number(limite) || 50, 1), 500);
  try {
    const res = await pool.query(`SELECT * FROM log_notificacao ORDER BY criado_em DESC LIMIT $1`, [n]);
    return res.rows as LogNotificacao[];
  } catch (err) {
    console.error('[notificacao] Erro ao obter logs:', err);
    return [];
  }
}

function montarMensagem(modelo: string, dados: {
  nomeCliente: string;
  telefoneCliente: string;
  motivo: string;
}): string {
  const agora = new Date();
  const data = agora.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const hora = agora.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
  return (modelo || MENSAGEM_PADRAO)
    .split('#name_contact#').join(dados.nomeCliente || 'Não informado')
    .split('#phone_contact#').join(dados.telefoneCliente || 'Não informado')
    .split('#date#').join(data)
    .split('#time#').join(hora)
    .split('#motivo#').join(dados.motivo || 'Não informado');
}

/**
 * Dispara a notificacao de intervencao humana para o telefone de destino configurado.
 * Retorna { enviado, motivo }. Nao lanca excecao.
 */
export async function notificarIntervencaoHumana(params: {
  telefoneCliente: string;
  nomeCliente?: string;
  motivo?: string;
}): Promise<{ enviado: boolean; motivo?: string }> {
  const telefoneCliente = normalizarTelefone(params.telefoneCliente);
  const nomeCliente = (params.nomeCliente ?? '').trim();
  const motivo = (params.motivo ?? '').trim() || 'Solicitação de atendimento humano';

  const cfg = await obterConfigNotificacao();
  if (!cfg.ativo) {
    return { enviado: false, motivo: 'notificacao_desativada' };
  }

  const destino = normalizarTelefone(cfg.telefone_destino ?? '');
  if (!telefoneEhContatoValido(destino)) {
    await registrarLog({
      telefone_cliente: telefoneCliente,
      nome_cliente: nomeCliente || null,
      telefone_destino: destino || null,
      motivo,
      enviado: false,
      detalhe: 'telefone_destino_invalido',
    });
    return { enviado: false, motivo: 'telefone_destino_invalido' };
  }

  // Evita renotificar o mesmo cliente em curto intervalo
  const chaveDedupe = `${PREFIXO_DEDUPE}${telefoneCliente}`;
  try {
    const jaEnviado = await redis.get(chaveDedupe);
    if (jaEnviado) {
      return { enviado: false, motivo: 'ja_notificado_recentemente' };
    }
  } catch { /* segue mesmo sem dedupe */ }

  const texto = montarMensagem(cfg.mensagem_modelo, { nomeCliente, telefoneCliente, motivo });

  try {
    await enviarTextoAtivo(destino, texto);
    try { await redis.set(chaveDedupe, '1', 'EX', TTL_DEDUPE_SEG); } catch { /* ignore */ }
    console.log(`[notificacao] Intervencao humana notificada para ${destino} (cliente ${telefoneCliente})`);
    await registrarLog({
      telefone_cliente: telefoneCliente,
      nome_cliente: nomeCliente || null,
      telefone_destino: destino,
      motivo,
      enviado: true,
      detalhe: null,
    });
    return { enviado: true };
  } catch (err) {
    const detalhe = err instanceof Error ? err.message : String(err);
    console.error('[notificacao] Falha ao enviar notificacao:', detalhe);
    await registrarLog({
      telefone_cliente: telefoneCliente,
      nome_cliente: nomeCliente || null,
      telefone_destino: destino,
      motivo,
      enviado: false,
      detalhe,
    });
    return { enviado: false, motivo: detalhe };
  }
}
