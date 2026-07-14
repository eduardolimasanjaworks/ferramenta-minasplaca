/**
 * Persistencia CRM (Kanban, contatos e entidades aninhadas) no Postgres.
 */
import { randomUUID } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Readable } from 'node:stream';
import pg from 'pg';
import { config } from './config.js';

const pool = new pg.Pool({ connectionString: config.databaseUrl });

const CRM_UPLOAD_ROOT = resolve(process.cwd(), 'data', 'crm-arquivos');

function garantirDirUpload(contatoId: string): string {
  const dir = join(CRM_UPLOAD_ROOT, contatoId);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function urlArquivo(contatoId: string, arquivoId: string): string {
  return `/api/crm/contatos/${encodeURIComponent(contatoId)}/arquivos/${encodeURIComponent(arquivoId)}/download`;
}

function nomeSeguro(nome: string): string {
  return nome.replace(/[^\w.\-()+ ]+/g, '_').slice(0, 180) || 'arquivo';
}

export type CrmColuna = {
  id: string;
  titulo: string;
  cor: string;
  ordem: number;
};

export type CrmContatoArquivo = {
  id: string;
  nome: string;
  criadoEm: string;
  mime: string;
  tamanho: number;
  url: string;
};
export type CrmContatoTarefa = {
  id: string;
  titulo: string;
  vencimento: string;
  status: 'pendente' | 'em_andamento' | 'concluida';
  descricao: string;
  responsavel: string;
};
export type CrmContatoNota = {
  id: string;
  texto: string;
  autor: string;
  email: string;
  criadoEm: string;
};
export type CrmContatoInteracao = {
  id: string;
  descricao: string;
  data: string;
  hora: string;
  responsavel: string;
};
export type CrmTimelineItem = {
  id: string;
  tipo: string;
  titulo: string;
  detalhe: string;
  em: string;
};

export type CrmContato = {
  id: string;
  nome: string;
  email: string;
  telefone: string;
  ddi: string;
  origem: string;
  dataNascimento: string;
  valorOportunidade: string;
  anotacoes: string;
  camposPersonalizados: Record<string, string>;
  tags: string[];
  arquivos: CrmContatoArquivo[];
  automacaoAtiva: boolean;
  tarefas: CrmContatoTarefa[];
  notas: CrmContatoNota[];
  interacoes: CrmContatoInteracao[];
  timeline: CrmTimelineItem[];
  colunaId: string;
  criadoEm: string;
  chatwootContactId: string | null;
};

export type CrmCampoCatalogo = {
  id: string;
  nome: string;
  descricao: string;
  ativo: boolean;
  tipo: 'texto' | 'numero' | 'data' | 'lista' | 'booleano';
  opcoes: string[];
};

export type CrmConfigCadastros = {
  responsaveis: string[];
  calendarios: string[];
  autorNotas: { nome: string; email: string };
};

function uid(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

const COLUNAS_PADRAO: CrmColuna[] = [
  { id: 'col-novos', titulo: 'Novos Leads', cor: 'rgb(59, 130, 246)', ordem: 0 },
  { id: 'col-negociacao', titulo: 'Em Negociação', cor: 'rgb(139, 92, 246)', ordem: 1 },
  { id: 'col-fechamento', titulo: 'Fechamento', cor: 'rgb(16, 185, 129)', ordem: 2 },
];

export async function inicializarBancoCrm(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS crm_colunas (
      id TEXT PRIMARY KEY,
      titulo TEXT NOT NULL,
      cor TEXT NOT NULL DEFAULT 'rgb(59, 130, 246)',
      ordem INTEGER NOT NULL DEFAULT 0,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS crm_contatos (
      id TEXT PRIMARY KEY,
      coluna_id TEXT NOT NULL REFERENCES crm_colunas(id) ON DELETE CASCADE,
      nome TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      telefone TEXT NOT NULL DEFAULT '',
      ddi TEXT NOT NULL DEFAULT '+55',
      origem TEXT NOT NULL DEFAULT '',
      data_nascimento TEXT NOT NULL DEFAULT '',
      valor_oportunidade TEXT NOT NULL DEFAULT '',
      anotacoes TEXT NOT NULL DEFAULT '',
      automacao_ativa BOOLEAN NOT NULL DEFAULT TRUE,
      multichat_status TEXT NOT NULL DEFAULT 'aguardando',
      responsavel_multichat TEXT NOT NULL DEFAULT '',
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_crm_contatos_coluna ON crm_contatos(coluna_id);

    CREATE TABLE IF NOT EXISTS crm_contato_tags (
      contato_id TEXT NOT NULL REFERENCES crm_contatos(id) ON DELETE CASCADE,
      tag TEXT NOT NULL,
      PRIMARY KEY (contato_id, tag)
    );

    CREATE TABLE IF NOT EXISTS crm_contato_arquivos (
      id TEXT PRIMARY KEY,
      contato_id TEXT NOT NULL REFERENCES crm_contatos(id) ON DELETE CASCADE,
      nome TEXT NOT NULL,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      caminho TEXT NOT NULL DEFAULT '',
      mime TEXT NOT NULL DEFAULT 'application/octet-stream',
      tamanho INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS crm_contato_tarefas (
      id TEXT PRIMARY KEY,
      contato_id TEXT NOT NULL REFERENCES crm_contatos(id) ON DELETE CASCADE,
      titulo TEXT NOT NULL DEFAULT '',
      vencimento TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pendente',
      descricao TEXT NOT NULL DEFAULT '',
      responsavel TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS crm_contato_notas (
      id TEXT PRIMARY KEY,
      contato_id TEXT NOT NULL REFERENCES crm_contatos(id) ON DELETE CASCADE,
      texto TEXT NOT NULL DEFAULT '',
      autor TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS crm_contato_eventos (
      id TEXT PRIMARY KEY,
      contato_id TEXT NOT NULL REFERENCES crm_contatos(id) ON DELETE CASCADE,
      titulo TEXT NOT NULL DEFAULT '',
      descricao TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '',
      inicio_data TEXT NOT NULL DEFAULT '',
      inicio_hora TEXT NOT NULL DEFAULT '',
      fim_data TEXT NOT NULL DEFAULT '',
      fim_hora TEXT NOT NULL DEFAULT '',
      calendario TEXT NOT NULL DEFAULT '',
      notificacao BOOLEAN NOT NULL DEFAULT FALSE
    );

    CREATE TABLE IF NOT EXISTS crm_contato_interacoes (
      id TEXT PRIMARY KEY,
      contato_id TEXT NOT NULL REFERENCES crm_contatos(id) ON DELETE CASCADE,
      descricao TEXT NOT NULL DEFAULT '',
      data TEXT NOT NULL DEFAULT '',
      hora TEXT NOT NULL DEFAULT '',
      responsavel TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS crm_contato_timeline (
      id TEXT PRIMARY KEY,
      contato_id TEXT NOT NULL REFERENCES crm_contatos(id) ON DELETE CASCADE,
      tipo TEXT NOT NULL DEFAULT 'lead',
      titulo TEXT NOT NULL DEFAULT '',
      detalhe TEXT NOT NULL DEFAULT '',
      em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_crm_timeline_contato ON crm_contato_timeline(contato_id);

    CREATE TABLE IF NOT EXISTS crm_contato_campos (
      contato_id TEXT NOT NULL REFERENCES crm_contatos(id) ON DELETE CASCADE,
      chave TEXT NOT NULL,
      valor TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (contato_id, chave)
    );

    CREATE TABLE IF NOT EXISTS crm_tarefas (
      id TEXT PRIMARY KEY,
      titulo TEXT NOT NULL DEFAULT '',
      descricao TEXT NOT NULL DEFAULT '',
      vencimento TEXT NOT NULL DEFAULT '',
      hora TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pendente',
      responsavel TEXT NOT NULL DEFAULT '',
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS crm_campos_catalogo (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL DEFAULT '',
      descricao TEXT NOT NULL DEFAULT '',
      ativo BOOLEAN NOT NULL DEFAULT TRUE,
      tipo TEXT NOT NULL DEFAULT 'texto',
      opcoes TEXT[] NOT NULL DEFAULT '{}',
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS crm_config (
      chave TEXT PRIMARY KEY,
      valor JSONB NOT NULL DEFAULT '{}'::jsonb,
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE crm_contato_arquivos ADD COLUMN IF NOT EXISTS caminho TEXT NOT NULL DEFAULT '';
    ALTER TABLE crm_contato_arquivos ADD COLUMN IF NOT EXISTS mime TEXT NOT NULL DEFAULT 'application/octet-stream';
    ALTER TABLE crm_contato_arquivos ADD COLUMN IF NOT EXISTS tamanho INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE crm_contatos ADD COLUMN IF NOT EXISTS chatwoot_contact_id TEXT;
    ALTER TABLE crm_campos_catalogo ADD COLUMN IF NOT EXISTS opcoes TEXT[] NOT NULL DEFAULT '{}';
    CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_contatos_chatwoot
      ON crm_contatos (chatwoot_contact_id)
      WHERE chatwoot_contact_id IS NOT NULL AND chatwoot_contact_id <> '';
    CREATE INDEX IF NOT EXISTS idx_crm_contatos_telefone ON crm_contatos (telefone);

    UPDATE crm_contatos
       SET origem = 'Atendimento'
     WHERE LOWER(TRIM(origem)) = 'chatwoot';
    UPDATE crm_contatos
       SET nome = regexp_replace(nome, 'Chatwoot', 'Atendimento', 'gi')
     WHERE nome ILIKE '%chatwoot%';
    UPDATE crm_contato_timeline
       SET titulo = regexp_replace(titulo, 'Chatwoot', 'Atendimento', 'gi'),
           detalhe = regexp_replace(detalhe, 'Chatwoot', 'Atendimento', 'gi')
     WHERE titulo ILIKE '%chatwoot%' OR detalhe ILIKE '%chatwoot%';
  `);

  try {
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_contatos_telefone_norm
        ON crm_contatos (regexp_replace(telefone, '\\D', '', 'g'))
        WHERE telefone IS NOT NULL AND telefone <> ''
    `);
  } catch (err) {
    console.warn('[crm] indice telefone unico nao aplicado:', err);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS crm_tags_catalogo (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL UNIQUE,
      ativo BOOLEAN NOT NULL DEFAULT TRUE,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const cadPadrao: CrmConfigCadastros = {
    responsaveis: ['Eduardo Lima', 'Victor Feliciano', 'Você'],
    calendarios: ['Padrão', 'Comercial', 'Suporte'],
    autorNotas: { nome: 'Você', email: '' },
  };
  await pool.query(
    `INSERT INTO crm_config (chave, valor) VALUES ('cadastros', $1::jsonb)
     ON CONFLICT (chave) DO NOTHING`,
    [JSON.stringify(cadPadrao)],
  );

  const { rows } = await pool.query<{ c: string }>('SELECT COUNT(*)::text AS c FROM crm_colunas');
  if (Number(rows[0]?.c || 0) === 0) {
    for (const c of COLUNAS_PADRAO) {
      await pool.query(
        `INSERT INTO crm_colunas (id, titulo, cor, ordem) VALUES ($1, $2, $3, $4)`,
        [c.id, c.titulo, c.cor, c.ordem],
      );
    }
  }
}

async function montarContato(row: Record<string, unknown>): Promise<CrmContato> {
  const id = String(row.id);
  const [tags, arquivos, tarefas, notas, interacoes, timeline, campos] =
    await Promise.all([
      pool.query<{ tag: string }>(
        `SELECT tag FROM crm_contato_tags WHERE contato_id = $1 ORDER BY tag`,
        [id],
      ),
      pool.query(
        `SELECT id, nome, criado_em AS "criadoEm",
                caminho, mime, tamanho
         FROM crm_contato_arquivos WHERE contato_id = $1 ORDER BY criado_em`,
        [id],
      ),
      pool.query(
        `SELECT id, titulo, vencimento, status, descricao, responsavel
         FROM crm_contato_tarefas WHERE contato_id = $1 ORDER BY titulo`,
        [id],
      ),
      pool.query(
        `SELECT id, texto, autor, email, criado_em AS "criadoEm"
         FROM crm_contato_notas WHERE contato_id = $1 ORDER BY criado_em DESC`,
        [id],
      ),
      pool.query(
        `SELECT id, descricao, data, hora, responsavel
         FROM crm_contato_interacoes WHERE contato_id = $1`,
        [id],
      ),
      pool.query(
        `SELECT id, tipo, titulo, detalhe, em
         FROM crm_contato_timeline WHERE contato_id = $1 ORDER BY em ASC`,
        [id],
      ),
      pool.query<{ chave: string; valor: string }>(
        `SELECT chave, valor FROM crm_contato_campos WHERE contato_id = $1`,
        [id],
      ),
    ]);

  const camposPersonalizados: Record<string, string> = {};
  for (const c of campos.rows) camposPersonalizados[c.chave] = c.valor;

  return {
    id,
    nome: String(row.nome ?? '').replace(/Chatwoot/gi, 'Atendimento'),
    email: String(row.email ?? ''),
    telefone: String(row.telefone ?? ''),
    ddi: String(row.ddi ?? '+55'),
    origem: (() => {
      const o = String(row.origem ?? '');
      return /^chatwoot$/i.test(o.trim()) ? 'Atendimento' : o.replace(/Chatwoot/gi, 'Atendimento');
    })(),
    dataNascimento: String(row.data_nascimento ?? ''),
    valorOportunidade: String(row.valor_oportunidade ?? ''),
    anotacoes: String(row.anotacoes ?? ''),
    camposPersonalizados,
    tags: tags.rows.map((t) => t.tag),
    arquivos: arquivos.rows.map((a) => ({
      id: String(a.id),
      nome: String(a.nome),
      criadoEm: new Date(a.criadoEm as string).toISOString(),
      mime: String(a.mime || 'application/octet-stream'),
      tamanho: Number(a.tamanho || 0),
      url: urlArquivo(id, String(a.id)),
    })),
    automacaoAtiva: Boolean(row.automacao_ativa ?? true),
    tarefas: tarefas.rows as CrmContatoTarefa[],
    notas: notas.rows.map((n) => ({
      id: String(n.id),
      texto: String(n.texto),
      autor: String(n.autor),
      email: String(n.email),
      criadoEm: new Date(n.criadoEm as string).toISOString(),
    })),
    interacoes: interacoes.rows as CrmContatoInteracao[],
    timeline: timeline.rows.map((t) => ({
      id: String(t.id),
      tipo: String(t.tipo),
      titulo: String(t.titulo).replace(/Chatwoot/gi, 'Atendimento'),
      detalhe: String(t.detalhe).replace(/Chatwoot/gi, 'Atendimento'),
      em: new Date(t.em as string).toISOString(),
    })),
    colunaId: String(row.coluna_id),
    criadoEm: new Date(row.criado_em as string).toISOString(),
    chatwootContactId: row.chatwoot_contact_id
      ? String(row.chatwoot_contact_id)
      : null,
  };
}

export async function obterBoard(): Promise<{ colunas: CrmColuna[]; contatos: CrmContato[] }> {
  const colunas = await pool.query<CrmColuna>(
    `SELECT id, titulo, cor, ordem FROM crm_colunas ORDER BY ordem ASC, titulo ASC`,
  );
  const base = await pool.query(`SELECT * FROM crm_contatos ORDER BY criado_em ASC`);
  const contatos: CrmContato[] = [];
  for (const row of base.rows) contatos.push(await montarContato(row));
  return { colunas: colunas.rows, contatos };
}

export async function listarColunas(): Promise<CrmColuna[]> {
  const r = await pool.query<CrmColuna>(
    `SELECT id, titulo, cor, ordem FROM crm_colunas ORDER BY ordem ASC`,
  );
  return r.rows;
}

export async function criarColuna(dados: { titulo?: string; cor?: string }): Promise<CrmColuna> {
  const { rows } = await pool.query<{ m: number }>(
    `SELECT COALESCE(MAX(ordem), -1) + 1 AS m FROM crm_colunas`,
  );
  const ordem = Number(rows[0]?.m ?? 0);
  const cores = [
    'rgb(59, 130, 246)',
    'rgb(139, 92, 246)',
    'rgb(16, 185, 129)',
    'rgb(245, 158, 11)',
    'rgb(239, 68, 68)',
  ];
  const col: CrmColuna = {
    id: uid('col'),
    titulo: (dados.titulo || 'Nova Coluna').trim() || 'Nova Coluna',
    cor: dados.cor || cores[ordem % cores.length],
    ordem,
  };
  await pool.query(
    `INSERT INTO crm_colunas (id, titulo, cor, ordem) VALUES ($1, $2, $3, $4)`,
    [col.id, col.titulo, col.cor, col.ordem],
  );
  return col;
}

export async function atualizarColuna(
  id: string,
  patch: { titulo?: string; cor?: string; ordem?: number },
): Promise<CrmColuna | null> {
  const atual = await pool.query(`SELECT * FROM crm_colunas WHERE id = $1`, [id]);
  if (!atual.rows[0]) return null;
  const titulo = patch.titulo ?? atual.rows[0].titulo;
  const cor = patch.cor ?? atual.rows[0].cor;
  const ordem = patch.ordem ?? atual.rows[0].ordem;
  await pool.query(`UPDATE crm_colunas SET titulo=$2, cor=$3, ordem=$4 WHERE id=$1`, [
    id,
    titulo,
    cor,
    ordem,
  ]);
  return { id, titulo, cor, ordem };
}

export async function removerColuna(
  id: string,
  opts: { moverParaId?: string } = {},
): Promise<boolean> {
  const cols = await listarColunas();
  if (!cols.some((c) => c.id === id)) return false;
  if (opts.moverParaId) {
    if (opts.moverParaId === id) return false;
    if (!cols.some((c) => c.id === opts.moverParaId)) return false;
    await pool.query(`UPDATE crm_contatos SET coluna_id = $2 WHERE coluna_id = $1`, [
      id,
      opts.moverParaId,
    ]);
  }
  const r = await pool.query(`DELETE FROM crm_colunas WHERE id = $1`, [id]);
  return (r.rowCount ?? 0) > 0;
}

export async function reordenarColunas(origemId: string, destinoId: string): Promise<CrmColuna[]> {
  const cols = await listarColunas();
  const from = cols.findIndex((c) => c.id === origemId);
  const to = cols.findIndex((c) => c.id === destinoId);
  if (from < 0 || to < 0 || from === to) return cols;
  const [moved] = cols.splice(from, 1);
  cols.splice(to, 0, moved);
  for (let i = 0; i < cols.length; i++) {
    cols[i].ordem = i;
    await pool.query(`UPDATE crm_colunas SET ordem = $2 WHERE id = $1`, [cols[i].id, i]);
  }
  return cols;
}

async function salvarAninhados(contatoId: string, c: Partial<CrmContato>): Promise<void> {
  if (c.tags) {
    await pool.query(`DELETE FROM crm_contato_tags WHERE contato_id = $1`, [contatoId]);
    for (const tag of c.tags) {
      if (!tag.trim()) continue;
      await pool.query(
        `INSERT INTO crm_contato_tags (contato_id, tag) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [contatoId, tag.trim()],
      );
    }
  }
  if (c.tarefas) {
    await pool.query(`DELETE FROM crm_contato_tarefas WHERE contato_id = $1`, [contatoId]);
    for (const t of c.tarefas) {
      await pool.query(
        `INSERT INTO crm_contato_tarefas (id, contato_id, titulo, vencimento, status, descricao, responsavel)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          t.id || uid('ct'),
          contatoId,
          t.titulo || '',
          t.vencimento || '',
          t.status || 'pendente',
          t.descricao || '',
          t.responsavel || '',
        ],
      );
    }
  }
  if (c.notas) {
    await pool.query(`DELETE FROM crm_contato_notas WHERE contato_id = $1`, [contatoId]);
    for (const n of c.notas) {
      await pool.query(
        `INSERT INTO crm_contato_notas (id, contato_id, texto, autor, email, criado_em)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          n.id || uid('nota'),
          contatoId,
          n.texto || '',
          n.autor || '',
          n.email || '',
          n.criadoEm || new Date().toISOString(),
        ],
      );
    }
  }
  if (c.interacoes) {
    await pool.query(`DELETE FROM crm_contato_interacoes WHERE contato_id = $1`, [contatoId]);
    for (const i of c.interacoes) {
      await pool.query(
        `INSERT INTO crm_contato_interacoes (id, contato_id, descricao, data, hora, responsavel)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          i.id || uid('int'),
          contatoId,
          i.descricao || '',
          i.data || '',
          i.hora || '',
          i.responsavel || '',
        ],
      );
    }
  }
  if (c.timeline) {
    await pool.query(`DELETE FROM crm_contato_timeline WHERE contato_id = $1`, [contatoId]);
    for (const t of c.timeline) {
      await pool.query(
        `INSERT INTO crm_contato_timeline (id, contato_id, tipo, titulo, detalhe, em)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          t.id || uid('tl'),
          contatoId,
          t.tipo || 'lead',
          t.titulo || '',
          t.detalhe || '',
          t.em || new Date().toISOString(),
        ],
      );
    }
  }
  if (c.camposPersonalizados) {
    await pool.query(`DELETE FROM crm_contato_campos WHERE contato_id = $1`, [contatoId]);
    for (const [chave, valor] of Object.entries(c.camposPersonalizados)) {
      await pool.query(
        `INSERT INTO crm_contato_campos (contato_id, chave, valor) VALUES ($1,$2,$3)`,
        [contatoId, chave, valor ?? ''],
      );
    }
  }
}

export class CrmTelefoneDuplicadoError extends Error {
  contatoExistenteId: string;
  constructor(contatoExistenteId: string) {
    super('telefone_duplicado');
    this.contatoExistenteId = contatoExistenteId;
  }
}

export class CrmTelefoneObrigatorioError extends Error {
  constructor() {
    super('telefone_obrigatorio');
  }
}

export function normalizarDigitosTelefone(telefone: string): string {
  return String(telefone || '').replace(/\D/g, '');
}

export async function definirChatwootContactId(
  id: string,
  chatwootContactId: string,
): Promise<CrmContato | null> {
  await pool.query(
    `UPDATE crm_contatos SET chatwoot_contact_id = $2, atualizado_em = NOW() WHERE id = $1`,
    [id, chatwootContactId],
  );
  return obterContato(id);
}

export async function criarContato(dados: {
  colunaId: string;
  nome: string;
  telefone: string;
  ddi?: string;
  email?: string;
  automacaoAtiva?: boolean;
}): Promise<CrmContato> {
  const nome = dados.nome.trim() || 'Novo contato';
  const telefone = normalizarDigitosTelefone(dados.telefone);
  if (telefone.length < 8) throw new CrmTelefoneObrigatorioError();
  const ddi = (dados.ddi || '+55').trim() || '+55';
  const automacaoAtiva = dados.automacaoAtiva !== false;

  const dup = await obterContatoPorTelefone(telefone);
  if (dup) throw new CrmTelefoneDuplicadoError(dup.id);

  const id = uid('ct');
  const agora = new Date().toISOString();
  await pool.query(
    `INSERT INTO crm_contatos
      (id, coluna_id, nome, telefone, ddi, email, automacao_ativa, criado_em, atualizado_em)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)`,
    [id, dados.colunaId, nome, telefone, ddi, dados.email || '', automacaoAtiva, agora],
  );
  await pool.query(
    `INSERT INTO crm_contato_timeline (id, contato_id, tipo, titulo, detalhe, em)
     VALUES ($1, $2, 'lead', 'Lead Criado', 'Contato criado no sistema', $3)`,
    [uid('tl'), id, agora],
  );
  const r = await pool.query(`SELECT * FROM crm_contatos WHERE id = $1`, [id]);
  return montarContato(r.rows[0]);
}

export async function obterContato(id: string): Promise<CrmContato | null> {
  const r = await pool.query(`SELECT * FROM crm_contatos WHERE id = $1`, [id]);
  if (!r.rows[0]) return null;
  return montarContato(r.rows[0]);
}

export async function obterContatoPorChatwootId(
  chatwootContactId: string,
): Promise<CrmContato | null> {
  const r = await pool.query(`SELECT * FROM crm_contatos WHERE chatwoot_contact_id = $1`, [
    String(chatwootContactId),
  ]);
  if (!r.rows[0]) return null;
  return montarContato(r.rows[0]);
}

export async function obterContatoPorTelefone(telefone: string): Promise<CrmContato | null> {
  const digits = telefone.replace(/\D/g, '');
  if (digits.length < 8) return null;
  const r = await pool.query(
    `SELECT * FROM crm_contatos
     WHERE regexp_replace(telefone, '\\D', '', 'g') = $1
        OR regexp_replace(ddi || telefone, '\\D', '', 'g') = $1
        OR regexp_replace(telefone, '\\D', '', 'g') = $2
     LIMIT 1`,
    [digits, digits.slice(-11)],
  );
  if (!r.rows[0]) return null;
  return montarContato(r.rows[0]);
}

/** Cria ou atualiza card CRM a partir de um contato Chatwoot (não move de coluna). */
export async function upsertContatoFromChatwoot(dados: {
  chatwootContactId: string;
  nome: string;
  email?: string;
  telefone?: string;
  ddi?: string;
}): Promise<{ contato: CrmContato; criado: boolean }> {
  const cwId = String(dados.chatwootContactId);
  const nome = (dados.nome || '').trim() || `Atendimento #${cwId}`;
  const email = (dados.email || '').trim();
  const telefone = (dados.telefone || '').replace(/\D/g, '');
  const ddi = (dados.ddi || '+55').trim() || '+55';

  let existente =
    (await obterContatoPorChatwootId(cwId)) ||
    (telefone ? await obterContatoPorTelefone(telefone) : null);

  if (existente) {
    const origemAtual = (existente.origem || '').trim();
    const origemLimpa =
      !origemAtual || /^chatwoot$/i.test(origemAtual) ? 'Atendimento' : origemAtual;
    const patch: Partial<CrmContato> = {
      chatwootContactId: cwId,
      nome: nome || existente.nome,
      origem: origemLimpa,
    };
    if (email) patch.email = email;
    if (telefone) {
      patch.telefone = telefone;
      patch.ddi = ddi;
    }
    await pool.query(
      `UPDATE crm_contatos SET
        chatwoot_contact_id = $2,
        nome = $3,
        email = CASE WHEN $4 <> '' THEN $4 ELSE email END,
        telefone = CASE WHEN $5 <> '' THEN $5 ELSE telefone END,
        ddi = CASE WHEN $5 <> '' THEN $6 ELSE ddi END,
        origem = CASE
          WHEN origem IS NULL OR origem = '' OR LOWER(origem) = 'chatwoot' THEN 'Atendimento'
          ELSE origem
        END,
        atualizado_em = NOW()
       WHERE id = $1`,
      [existente.id, cwId, patch.nome, email, telefone, ddi],
    );
    const atualizado = await obterContato(existente.id);
    return { contato: atualizado!, criado: false };
  }

  const cols = await listarColunas();
  const colunaId = cols[0]?.id || COLUNAS_PADRAO[0].id;
  const id = uid('ct');
  const agora = new Date().toISOString();
  await pool.query(
    `INSERT INTO crm_contatos
      (id, coluna_id, nome, email, telefone, ddi, origem, chatwoot_contact_id, criado_em, atualizado_em)
     VALUES ($1,$2,$3,$4,$5,$6,'Atendimento',$7,$8,$8)`,
    [id, colunaId, nome, email, telefone, ddi, cwId, agora],
  );
  await pool.query(
    `INSERT INTO crm_contato_timeline (id, contato_id, tipo, titulo, detalhe, em)
     VALUES ($1,$2,'lead','Lead Atendimento','Sincronizado do Atendimento',$3)`,
    [uid('tl'), id, agora],
  );
  const criado = await obterContato(id);
  return { contato: criado!, criado: true };
}

export async function atualizarContato(
  id: string,
  patch: Partial<CrmContato>,
): Promise<CrmContato | null> {
  const atual = await obterContato(id);
  if (!atual) return null;

  const merged: CrmContato = { ...atual, ...patch, id };

  if (patch.telefone !== undefined) {
    const tel = normalizarDigitosTelefone(merged.telefone);
    if (tel.length < 8) throw new CrmTelefoneObrigatorioError();
    merged.telefone = tel;
    const dup = await obterContatoPorTelefone(tel);
    if (dup && dup.id !== id) throw new CrmTelefoneDuplicadoError(dup.id);
  } else if (normalizarDigitosTelefone(merged.telefone).length < 8) {
    // Contatos antigos sem telefone: só bloqueia se o patch tentar persistir vazio
    // ao editar outros campos mantém; se veio de create novo sempre tem phone
  }

  await pool.query(
    `UPDATE crm_contatos SET
      coluna_id = $2, nome = $3, email = $4, telefone = $5, ddi = $6, origem = $7,
      data_nascimento = $8, valor_oportunidade = $9, anotacoes = $10,
      automacao_ativa = $11,
      atualizado_em = NOW()
     WHERE id = $1`,
    [
      id,
      merged.colunaId,
      merged.nome,
      merged.email ?? '',
      merged.telefone ?? '',
      merged.ddi ?? '+55',
      merged.origem ?? '',
      merged.dataNascimento ?? '',
      merged.valorOportunidade ?? '',
      merged.anotacoes ?? '',
      merged.automacaoAtiva ?? true,
    ],
  );

  const aninhados: Partial<CrmContato> = {};
  if (patch.tags !== undefined) aninhados.tags = patch.tags;
  if (patch.tarefas !== undefined) aninhados.tarefas = patch.tarefas;
  if (patch.notas !== undefined) aninhados.notas = patch.notas;
  if (patch.interacoes !== undefined) aninhados.interacoes = patch.interacoes;
  if (patch.timeline !== undefined) aninhados.timeline = patch.timeline;
  if (patch.camposPersonalizados !== undefined) {
    aninhados.camposPersonalizados = patch.camposPersonalizados;
  }
  if (Object.keys(aninhados).length > 0) {
    await salvarAninhados(id, aninhados);
  }

  return obterContato(id);
}

export async function moverContato(
  id: string,
  colunaDestinoId: string,
): Promise<CrmContato | null> {
  const atual = await obterContato(id);
  if (!atual) return null;
  if (atual.colunaId === colunaDestinoId) return atual;

  const colDest = await pool.query<{ titulo: string }>(
    `SELECT titulo FROM crm_colunas WHERE id = $1`,
    [colunaDestinoId],
  );
  const tituloCol = colDest.rows[0]?.titulo || colunaDestinoId;
  const agora = new Date().toISOString();
  const timeline = [
    ...atual.timeline,
    {
      id: uid('tl'),
      tipo: 'kanban',
      titulo: 'Movido no Kanban',
      detalhe: `Para a coluna "${tituloCol}"`,
      em: agora,
    },
  ];
  return atualizarContato(id, { colunaId: colunaDestinoId, timeline });
}

export async function removerContato(id: string): Promise<boolean> {
  const arquivos = await pool.query<{ caminho: string }>(
    `SELECT caminho FROM crm_contato_arquivos WHERE contato_id = $1`,
    [id],
  );
  for (const a of arquivos.rows) {
    if (a.caminho && existsSync(a.caminho)) {
      try {
        unlinkSync(a.caminho);
      } catch {
        /* ignore */
      }
    }
  }
  const r = await pool.query(`DELETE FROM crm_contatos WHERE id = $1`, [id]);
  return (r.rowCount ?? 0) > 0;
}

export async function uploadArquivoContato(
  contatoId: string,
  dados: { nome: string; mime: string; buffer: Buffer },
): Promise<CrmContatoArquivo | null> {
  const contato = await obterContato(contatoId);
  if (!contato) return null;

  const id = uid('arq');
  const agora = new Date().toISOString();
  const dir = garantirDirUpload(contatoId);
  const caminho = join(dir, `${id}-${nomeSeguro(dados.nome)}`);
  writeFileSync(caminho, dados.buffer);

  await pool.query(
    `INSERT INTO crm_contato_arquivos (id, contato_id, nome, criado_em, caminho, mime, tamanho)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      id,
      contatoId,
      dados.nome || 'arquivo',
      agora,
      caminho,
      dados.mime || 'application/octet-stream',
      dados.buffer.length,
    ],
  );

  return {
    id,
    nome: dados.nome || 'arquivo',
    criadoEm: agora,
    mime: dados.mime || 'application/octet-stream',
    tamanho: dados.buffer.length,
    url: urlArquivo(contatoId, id),
  };
}

export async function removerArquivoContato(
  contatoId: string,
  arquivoId: string,
): Promise<boolean> {
  const r = await pool.query<{ caminho: string }>(
    `SELECT caminho FROM crm_contato_arquivos WHERE id = $1 AND contato_id = $2`,
    [arquivoId, contatoId],
  );
  if (!r.rows[0]) return false;
  const caminho = r.rows[0].caminho;
  if (caminho && existsSync(caminho)) {
    try {
      unlinkSync(caminho);
    } catch {
      /* ignore */
    }
  }
  await pool.query(`DELETE FROM crm_contato_arquivos WHERE id = $1 AND contato_id = $2`, [
    arquivoId,
    contatoId,
  ]);
  return true;
}

export async function abrirArquivoContato(
  contatoId: string,
  arquivoId: string,
): Promise<{ stream: Readable; mime: string; nome: string; tamanho: number } | null> {
  const r = await pool.query<{
    caminho: string;
    mime: string;
    nome: string;
    tamanho: number;
  }>(
    `SELECT caminho, mime, nome, tamanho FROM crm_contato_arquivos
     WHERE id = $1 AND contato_id = $2`,
    [arquivoId, contatoId],
  );
  const row = r.rows[0];
  if (!row?.caminho || !existsSync(row.caminho)) return null;
  return {
    stream: createReadStream(row.caminho),
    mime: row.mime || 'application/octet-stream',
    nome: row.nome,
    tamanho: Number(row.tamanho || 0),
  };
}

/* —— Catálogo de campos —— */
function mapCampoRow(row: Record<string, unknown>): CrmCampoCatalogo {
  const opcoesRaw = row.opcoes;
  const opcoes = Array.isArray(opcoesRaw)
    ? opcoesRaw.map((o) => String(o)).filter(Boolean)
    : [];
  return {
    id: String(row.id),
    nome: String(row.nome ?? ''),
    descricao: String(row.descricao ?? ''),
    ativo: Boolean(row.ativo ?? true),
    tipo: (String(row.tipo || 'texto') as CrmCampoCatalogo['tipo']),
    opcoes,
  };
}

export async function listarCamposCatalogo(): Promise<CrmCampoCatalogo[]> {
  const r = await pool.query(
    `SELECT id, nome, descricao, ativo, tipo, opcoes FROM crm_campos_catalogo ORDER BY nome ASC`,
  );
  return r.rows.map((row) => mapCampoRow(row));
}

export async function criarCampoCatalogo(
  dados: Omit<CrmCampoCatalogo, 'id'>,
): Promise<CrmCampoCatalogo> {
  const id = uid('campo');
  const opcoes = Array.isArray(dados.opcoes) ? dados.opcoes.map(String).filter(Boolean) : [];
  await pool.query(
    `INSERT INTO crm_campos_catalogo (id, nome, descricao, ativo, tipo, opcoes)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      id,
      dados.nome || '',
      dados.descricao || '',
      dados.ativo !== false,
      dados.tipo || 'texto',
      opcoes,
    ],
  );
  return {
    id,
    nome: dados.nome || '',
    descricao: dados.descricao || '',
    ativo: dados.ativo !== false,
    tipo: dados.tipo || 'texto',
    opcoes,
  };
}

export async function atualizarCampoCatalogo(
  id: string,
  patch: Partial<CrmCampoCatalogo>,
): Promise<CrmCampoCatalogo | null> {
  const list = await listarCamposCatalogo();
  const atual = list.find((c) => c.id === id);
  if (!atual) return null;
  const m = { ...atual, ...patch, id };
  const opcoes = Array.isArray(m.opcoes) ? m.opcoes.map(String).filter(Boolean) : [];
  await pool.query(
    `UPDATE crm_campos_catalogo SET nome=$2, descricao=$3, ativo=$4, tipo=$5, opcoes=$6 WHERE id=$1`,
    [id, m.nome, m.descricao, m.ativo, m.tipo, opcoes],
  );

  // Renomear: migra chave nos contatos
  if (patch.nome !== undefined && patch.nome.trim() && patch.nome.trim() !== atual.nome) {
    await migrarChaveCampoPersonalizado(atual.nome, patch.nome.trim());
  }
  // Desativar: apaga valores do campo nos contatos
  if (patch.ativo === false && atual.ativo) {
    await apagarChaveCampoPersonalizado(m.nome);
  }

  return { ...m, opcoes };
}

async function migrarChaveCampoPersonalizado(de: string, para: string): Promise<void> {
  if (!de || !para || de === para) return;
  const r = await pool.query<{ contato_id: string; chave: string; valor: string }>(
    `SELECT contato_id, chave, valor FROM crm_contato_campos WHERE chave = $1`,
    [de],
  );
  for (const row of r.rows) {
    await pool.query(
      `INSERT INTO crm_contato_campos (contato_id, chave, valor) VALUES ($1,$2,$3)
       ON CONFLICT (contato_id, chave) DO UPDATE SET valor = EXCLUDED.valor`,
      [row.contato_id, para, row.valor],
    );
    await pool.query(
      `DELETE FROM crm_contato_campos WHERE contato_id = $1 AND chave = $2`,
      [row.contato_id, de],
    );
  }
}

async function apagarChaveCampoPersonalizado(chave: string): Promise<void> {
  if (!chave) return;
  await pool.query(`DELETE FROM crm_contato_campos WHERE chave = $1`, [chave]);
}

export async function removerCampoCatalogo(id: string): Promise<boolean> {
  const list = await listarCamposCatalogo();
  const atual = list.find((c) => c.id === id);
  if (atual) await apagarChaveCampoPersonalizado(atual.nome);
  const r = await pool.query(`DELETE FROM crm_campos_catalogo WHERE id = $1`, [id]);
  return (r.rowCount ?? 0) > 0;
}

/* —— Catálogo de tags —— */
export type CrmTagCatalogo = {
  id: string;
  nome: string;
  ativo: boolean;
};

export async function listarTagsCatalogo(): Promise<CrmTagCatalogo[]> {
  const r = await pool.query(
    `SELECT id, nome, ativo FROM crm_tags_catalogo ORDER BY nome ASC`,
  );
  return r.rows.map((row) => ({
    id: String(row.id),
    nome: String(row.nome ?? ''),
    ativo: Boolean(row.ativo ?? true),
  }));
}

export async function criarTagCatalogo(nome: string): Promise<CrmTagCatalogo> {
  const limpo = nome.trim();
  if (!limpo) throw new Error('nome_obrigatorio');
  const existente = await pool.query(
    `SELECT id, nome, ativo FROM crm_tags_catalogo WHERE lower(nome) = lower($1)`,
    [limpo],
  );
  if (existente.rows[0]) {
    return {
      id: String(existente.rows[0].id),
      nome: String(existente.rows[0].nome),
      ativo: Boolean(existente.rows[0].ativo),
    };
  }
  const id = uid('tag');
  await pool.query(
    `INSERT INTO crm_tags_catalogo (id, nome, ativo) VALUES ($1,$2,TRUE)`,
    [id, limpo],
  );
  return { id, nome: limpo, ativo: true };
}

export async function atualizarTagCatalogo(
  id: string,
  patch: Partial<CrmTagCatalogo>,
): Promise<CrmTagCatalogo | null> {
  const list = await listarTagsCatalogo();
  const atual = list.find((t) => t.id === id);
  if (!atual) return null;
  const m = { ...atual, ...patch, id };
  await pool.query(`UPDATE crm_tags_catalogo SET nome=$2, ativo=$3 WHERE id=$1`, [
    id,
    m.nome.trim(),
    m.ativo,
  ]);
  if (patch.nome && patch.nome.trim() !== atual.nome) {
    await pool.query(
      `UPDATE crm_contato_tags SET tag = $2 WHERE tag = $1`,
      [atual.nome, patch.nome.trim()],
    );
  }
  return m;
}

export async function removerTagCatalogo(id: string): Promise<boolean> {
  const list = await listarTagsCatalogo();
  const atual = list.find((t) => t.id === id);
  if (atual) {
    await pool.query(`DELETE FROM crm_contato_tags WHERE tag = $1`, [atual.nome]);
  }
  const r = await pool.query(`DELETE FROM crm_tags_catalogo WHERE id = $1`, [id]);
  return (r.rowCount ?? 0) > 0;
}

/* —— Cadastros (responsáveis, calendários, autor) —— */
const CADASTROS_PADRAO: CrmConfigCadastros = {
  responsaveis: ['Eduardo Lima', 'Victor Feliciano', 'Você'],
  calendarios: ['Padrão', 'Comercial', 'Suporte'],
  autorNotas: { nome: 'Você', email: '' },
};

export async function obterCadastros(): Promise<CrmConfigCadastros> {
  const r = await pool.query<{ valor: CrmConfigCadastros }>(
    `SELECT valor FROM crm_config WHERE chave = 'cadastros'`,
  );
  const v = r.rows[0]?.valor;
  if (!v || typeof v !== 'object') return { ...CADASTROS_PADRAO };
  return {
    responsaveis: Array.isArray(v.responsaveis)
      ? v.responsaveis.map(String).filter(Boolean)
      : [...CADASTROS_PADRAO.responsaveis],
    calendarios: Array.isArray(v.calendarios)
      ? v.calendarios.map(String).filter(Boolean)
      : [...CADASTROS_PADRAO.calendarios],
    autorNotas: {
      nome: String(v.autorNotas?.nome || CADASTROS_PADRAO.autorNotas.nome),
      email: String(v.autorNotas?.email || ''),
    },
  };
}

export async function salvarCadastros(
  dados: Partial<CrmConfigCadastros>,
): Promise<CrmConfigCadastros> {
  const atual = await obterCadastros();
  const next: CrmConfigCadastros = {
    responsaveis:
      dados.responsaveis !== undefined
        ? dados.responsaveis.map((s) => s.trim()).filter(Boolean)
        : atual.responsaveis,
    calendarios:
      dados.calendarios !== undefined
        ? dados.calendarios.map((s) => s.trim()).filter(Boolean)
        : atual.calendarios,
    autorNotas: {
      nome: (dados.autorNotas?.nome ?? atual.autorNotas.nome).trim() || 'Você',
      email: (dados.autorNotas?.email ?? atual.autorNotas.email).trim(),
    },
  };
  await pool.query(
    `INSERT INTO crm_config (chave, valor, atualizado_em) VALUES ('cadastros', $1::jsonb, NOW())
     ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = NOW()`,
    [JSON.stringify(next)],
  );
  return next;
}

/** Espelha pausa Redis → CRM (automacao_ativa). */
export async function espelharAutomacaoPorTelefone(
  telefone: string,
  iaAtiva: boolean,
): Promise<number> {
  const digits = String(telefone || '').replace(/\D/g, '');
  if (digits.length < 8) return 0;
  const sufixo = digits.slice(-11);
  const r = await pool.query(
    `UPDATE crm_contatos
     SET automacao_ativa = $3, atualizado_em = NOW()
     WHERE regexp_replace(COALESCE(telefone, ''), '[^0-9]', '', 'g') = $1
        OR regexp_replace(COALESCE(telefone, ''), '[^0-9]', '', 'g') = $2
        OR right(regexp_replace(COALESCE(telefone, ''), '[^0-9]', '', 'g'), 11) = $2`,
    [digits, sufixo, iaAtiva],
  );
  return r.rowCount ?? 0;
}
