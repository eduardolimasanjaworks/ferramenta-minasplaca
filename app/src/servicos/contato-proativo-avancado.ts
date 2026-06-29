/**
 * Sistema avançado de contato proativo com configuração granular por motorista
 */
import { pool } from './prompt.js';

export interface ConfigContatoProativoMotorista {
  motorista_id: number;
  habilitado: boolean;
  frequencia_horas: number | null;
  frequencia_dias: number | null;
  horario_inicio: string | null;
  horario_fim: string | null;
  dias_semana: number[] | null;
  max_contatos_dia: number | null;
  condicao_resposta: boolean;
  condicao_localizacao: boolean;
  mensagem_custom: string | null;
  prioridade: number;
  criado_em: string;
  atualizado_em: string;
}

export interface HistoricoRespostaContato {
  id: number;
  motorista_id: number;
  data_contato: string;
  respondeu: boolean;
  tipo_resposta: string | null;
  tempo_resposta_segundos: number | null;
  informacao_obtida: string | null;
  criado_em: string;
}

export interface RegraEngajamento {
  id: number;
  nome: string;
  condicao: Record<string, unknown>;
  acao: string;
  ativa: boolean;
  criado_em: string;
  atualizado_em: string;
}

export async function inicializarContatoProativoAvancado(): Promise<void> {
  // Tabela de configuração por motorista
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contato_proativo_config_motorista (
      motorista_id INTEGER PRIMARY KEY,
      habilitado BOOLEAN NOT NULL DEFAULT false,
      frequencia_horas NUMERIC(10,2),
      frequencia_dias INTEGER,
      horario_inicio TIME,
      horario_fim TIME,
      dias_semana INTEGER[],
      max_contatos_dia INTEGER,
      condicao_resposta BOOLEAN NOT NULL DEFAULT false,
      condicao_localizacao BOOLEAN NOT NULL DEFAULT true,
      mensagem_custom TEXT,
      prioridade INTEGER NOT NULL DEFAULT 0,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Tabela de histórico de respostas
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contato_proativo_historico_resposta (
      id SERIAL PRIMARY KEY,
      motorista_id INTEGER NOT NULL,
      data_contato TIMESTAMPTZ NOT NULL,
      respondeu BOOLEAN NOT NULL DEFAULT false,
      tipo_resposta TEXT,
      tempo_resposta_segundos INTEGER,
      informacao_obtida TEXT,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Índices para histórico
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_historico_resposta_motorista
    ON contato_proativo_historico_resposta (motorista_id, data_contato DESC)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_historico_resposta_data
    ON contato_proativo_historico_resposta (data_contato DESC)
  `);

  // Tabela de regras de engajamento
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contato_proativo_regras (
      id SERIAL PRIMARY KEY,
      nome TEXT NOT NULL,
      condicao JSONB NOT NULL,
      acao TEXT NOT NULL,
      ativa BOOLEAN NOT NULL DEFAULT true,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Tabela de agenda dinâmica
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contato_proativo_agenda (
      id SERIAL PRIMARY KEY,
      motorista_id INTEGER NOT NULL,
      data_agendada TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'agendado',
      mensagem TEXT,
      prioridade INTEGER NOT NULL DEFAULT 0,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Índices para agenda
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_agenda_data_status
    ON contato_proativo_agenda (data_agendada, status)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_agenda_motorista
    ON contato_proativo_agenda (motorista_id, data_agendada DESC)
  `);
}

export async function criarConfigMotorista(
  motoristaId: number,
  config: Partial<Omit<ConfigContatoProativoMotorista, 'motorista_id' | 'criado_em' | 'atualizado_em'>>,
): Promise<ConfigContatoProativoMotorista> {
  await inicializarContatoProativoAvancado();
  const res = await pool.query<ConfigContatoProativoMotorista>(
    `INSERT INTO contato_proativo_config_motorista ({
      motorista_id, habilitado, frequencia_horas, frequencia_dias,
      horario_inicio, horario_fim, dias_semana, max_contatos_dia,
      condicao_resposta, condicao_localizacao, mensagem_custom, prioridade
    }) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    ON CONFLICT (motorista_id) DO UPDATE SET
      habilitado = COALESCE($2, habilitado),
      frequencia_horas = COALESCE($3, frequencia_horas),
      frequencia_dias = COALESCE($4, frequencia_dias),
      horario_inicio = COALESCE($5, horario_inicio),
      horario_fim = COALESCE($6, horario_fim),
      dias_semana = COALESCE($7, dias_semana),
      max_contatos_dia = COALESCE($8, max_contatos_dia),
      condicao_resposta = COALESCE($9, condicao_resposta),
      condicao_localizacao = COALESCE($10, condicao_localizacao),
      mensagem_custom = COALESCE($11, mensagem_custom),
      prioridade = COALESCE($12, prioridade),
      atualizado_em = NOW()
    RETURNING *`,
    [
      motoristaId,
      config.habilitado ?? false,
      config.frequencia_horas ?? null,
      config.frequencia_dias ?? null,
      config.horario_inicio ?? null,
      config.horario_fim ?? null,
      config.dias_semana ?? null,
      config.max_contatos_dia ?? null,
      config.condicao_resposta ?? false,
      config.condicao_localizacao ?? true,
      config.mensagem_custom ?? null,
      config.prioridade ?? 0,
    ],
  );
  return res.rows[0];
}

export async function obterConfigMotorista(motoristaId: number): Promise<ConfigContatoProativoMotorista | null> {
  await inicializarContatoProativoAvancado();
  const res = await pool.query<ConfigContatoProativoMotorista>(
    'SELECT * FROM contato_proativo_config_motorista WHERE motorista_id = $1',
    [motoristaId],
  );
  return res.rows[0] || null;
}

export async function listarConfigsMotoristas(opts?: {
  habilitado?: boolean;
  limit?: number;
  offset?: number;
}): Promise<ConfigContatoProativoMotorista[]> {
  await inicializarContatoProativoAvancado();
  const conditions = [];
  const params = [];
  let paramIndex = 1;

  if (opts?.habilitado !== undefined) {
    conditions.push(`habilitado = $${paramIndex}`);
    params.push(opts.habilitado);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = opts?.limit ?? 100;
  const offset = opts?.offset ?? 0;

  const res = await pool.query<ConfigContatoProativoMotorista>(
    `SELECT * FROM contato_proativo_config_motorista ${whereClause} ORDER BY prioridade DESC, motorista_id LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, limit, offset],
  );
  return res.rows;
}

export async function deletarConfigMotorista(motoristaId: number): Promise<void> {
  await inicializarContatoProativoAvancado();
  await pool.query('DELETE FROM contato_proativo_config_motorista WHERE motorista_id = $1', [motoristaId]);
}

export async function registrarRespostaContato(
  motoristaId: number,
  dataContato: Date,
  resposta: {
    respondeu: boolean;
    tipo_resposta?: string;
    tempo_resposta_segundos?: number;
    informacao_obtida?: string;
  },
): Promise<HistoricoRespostaContato> {
  await inicializarContatoProativoAvancado();
  const res = await pool.query<HistoricoRespostaContato>(
    `INSERT INTO contato_proativo_historico_resposta (
      motorista_id, data_contato, respondeu, tipo_resposta,
      tempo_resposta_segundos, informacao_obtida
    ) VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *`,
    [
      motoristaId,
      dataContato,
      resposta.respondeu,
      resposta.tipo_resposta ?? null,
      resposta.tempo_resposta_segundos ?? null,
      resposta.informacao_obtida ?? null,
    ],
  );
  return res.rows[0];
}

export async function obterHistoricoRespostas(
  motoristaId: number,
  limit = 50,
): Promise<HistoricoRespostaContato[]> {
  await inicializarContatoProativoAvancado();
  const res = await pool.query<HistoricoRespostaContato>(
    `SELECT * FROM contato_proativo_historico_resposta
     WHERE motorista_id = $1
     ORDER BY data_contato DESC
     LIMIT $2`,
    [motoristaId, limit],
  );
  return res.rows;
}

export async function criarRegraEngajamento(
  nome: string,
  condicao: Record<string, unknown>,
  acao: string,
): Promise<RegraEngajamento> {
  await inicializarContatoProativoAvancado();
  const res = await pool.query<RegraEngajamento>(
    `INSERT INTO contato_proativo_regras (nome, condicao, acao)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [nome, JSON.stringify(condicao), acao],
  );
  return res.rows[0];
}

export async function listarRegrasEngajamento(ativasOnly = true): Promise<RegraEngajamento[]> {
  await inicializarContatoProativoAvancado();
  const res = await pool.query<RegraEngajamento>(
    `SELECT * FROM contato_proativo_regras
     WHERE $1 = false OR ativa = true
     ORDER BY id`,
    [ativasOnly],
  );
  return res.rows;
}

export async function agendarContatoMotorista(
  motoristaId: number,
  dataAgendada: Date,
  mensagem?: string,
  prioridade = 0,
): Promise<{ id: number }> {
  await inicializarContatoProativoAvancado();
  const res = await pool.query<{ id: number }>(
    `INSERT INTO contato_proativo_agenda (motorista_id, data_agendada, mensagem, prioridade)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [motoristaId, dataAgendada, mensagem ?? null, prioridade],
  );
  return res.rows[0];
}

export async function obterAgendaDia(data: Date): Promise<Array<{ id: number; motorista_id: number; data_agendada: string; mensagem: string | null; prioridade: number }>> {
  await inicializarContatoProativoAvancado();
  const inicioDia = new Date(data);
  inicioDia.setHours(0, 0, 0, 0);
  const fimDia = new Date(data);
  fimDia.setHours(23, 59, 59, 999);

  const res = await pool.query(
    `SELECT id, motorista_id, data_agendada, mensagem, prioridade
     FROM contato_proativo_agenda
     WHERE data_agendada >= $1 AND data_agendada <= $2
       AND status = 'agendado'
     ORDER BY prioridade DESC, data_agendada ASC`,
    [inicioDia, fimDia],
  );
  return res.rows;
}

export async function atualizarStatusAgenda(
  agendaId: number,
  status: 'enviado' | 'cancelado' | 'falhou',
): Promise<void> {
  await inicializarContatoProativoAvancado();
  await pool.query(
    `UPDATE contato_proativo_agenda
     SET status = $1, atualizado_em = NOW()
     WHERE id = $2`,
    [status, agendaId],
  );
}
