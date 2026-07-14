/**
 * Usuarios do painel — Postgres + scrypt + permissoes por aba.
 */
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import pg from 'pg';
import { config } from './config.js';

const pool = new pg.Pool({ connectionString: config.databaseUrl });

export type RolePainel = 'admin' | 'agente';

export const ABAS_MINAS = ['assistente', 'prompt', 'conversas', 'proativos', 'precos', 'crm'] as const;
export const ABAS_TILIT = ['assistente', 'prompt', 'conversas', 'crm'] as const;

export type AbaPainel = string;

export interface UsuarioPainel {
  id: number;
  email: string;
  nome: string;
  role: RolePainel;
  abas: AbaPainel[];
  ativo: boolean;
  chatwoot_user_id: number | null;
  criado_em: string;
  atualizado_em: string;
}

export interface UsuarioPublico {
  id: number;
  email: string;
  nome: string;
  role: RolePainel;
  abas: AbaPainel[];
  ativo: boolean;
  chatwoot_user_id: number | null;
}

function hashSenha(senha: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(senha, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verificarSenha(senha: string, armazenado: string): boolean {
  const [salt, hash] = armazenado.split(':');
  if (!salt || !hash) return false;
  const calc = scryptSync(senha, salt, 64);
  const alvo = Buffer.from(hash, 'hex');
  return calc.length === alvo.length && timingSafeEqual(calc, alvo);
}

function normalizarAbas(abas: unknown, todas: readonly string[]): string[] {
  if (!Array.isArray(abas)) return [...todas];
  const set = new Set(todas);
  const out = abas.map((a) => String(a).trim().toLowerCase()).filter((a) => set.has(a));
  return out.length ? [...new Set(out)] : [...todas];
}

function rowParaUsuario(row: Record<string, unknown>): UsuarioPainel {
  const abasRaw = row.abas;
  let abas: string[] = [];
  if (Array.isArray(abasRaw)) abas = abasRaw.map(String);
  else if (typeof abasRaw === 'string') {
    try {
      abas = JSON.parse(abasRaw);
    } catch {
      abas = [];
    }
  }
  return {
    id: Number(row.id),
    email: String(row.email),
    nome: String(row.nome),
    role: row.role === 'admin' ? 'admin' : 'agente',
    abas,
    ativo: row.ativo !== false,
    chatwoot_user_id: row.chatwoot_user_id != null ? Number(row.chatwoot_user_id) : null,
    criado_em: String(row.criado_em ?? ''),
    atualizado_em: String(row.atualizado_em ?? ''),
  };
}

export function paraPublico(u: UsuarioPainel): UsuarioPublico {
  return {
    id: u.id,
    email: u.email,
    nome: u.nome,
    role: u.role,
    abas: u.abas,
    ativo: u.ativo,
    chatwoot_user_id: u.chatwoot_user_id,
  };
}

export function abasDisponiveisApp(): readonly string[] {
  const build = String(config.buildId || '');
  return build.startsWith('tilit') ? ABAS_TILIT : ABAS_MINAS;
}

export async function inicializarBancoUsuarios(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS painel_usuarios (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      nome TEXT NOT NULL,
      senha_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'agente',
      abas JSONB NOT NULL DEFAULT '[]'::jsonb,
      ativo BOOLEAN NOT NULL DEFAULT true,
      chatwoot_user_id INTEGER,
      criado_em TIMESTAMPTZ DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  const { rows } = await pool.query<{ n: string }>('SELECT COUNT(*)::text AS n FROM painel_usuarios');
  if (Number(rows[0]?.n || 0) > 0) return;

  const email = (config.adminEmail || 'admin@local').trim().toLowerCase();
  const senha = config.adminPassword || 'Admin123!';
  const todas = [...abasDisponiveisApp()];
  await pool.query(
    `INSERT INTO painel_usuarios (email, nome, senha_hash, role, abas, ativo)
     VALUES ($1, $2, $3, 'admin', $4::jsonb, true)`,
    [email, 'Administrador', hashSenha(senha), JSON.stringify(todas)],
  );
  console.log(`[usuarios] Admin seed criado: ${email}`);
}

export async function autenticarUsuario(
  email: string,
  senha: string,
): Promise<UsuarioPainel | null> {
  const e = email.trim().toLowerCase();
  const res = await pool.query('SELECT * FROM painel_usuarios WHERE email = $1 LIMIT 1', [e]);
  if (!res.rows[0]) return null;
  const u = rowParaUsuario(res.rows[0]);
  if (!u.ativo) return null;
  if (!verificarSenha(senha, String(res.rows[0].senha_hash))) return null;
  return u;
}

export async function obterUsuarioPorId(id: number): Promise<UsuarioPainel | null> {
  const res = await pool.query('SELECT * FROM painel_usuarios WHERE id = $1', [id]);
  if (!res.rows[0]) return null;
  return rowParaUsuario(res.rows[0]);
}

export async function listarUsuarios(): Promise<UsuarioPublico[]> {
  const res = await pool.query('SELECT * FROM painel_usuarios ORDER BY id ASC');
  return res.rows.map((r) => paraPublico(rowParaUsuario(r)));
}

export async function criarUsuario(dados: {
  email: string;
  nome: string;
  senha: string;
  role?: RolePainel;
  abas?: string[];
  chatwoot_user_id?: number | null;
}): Promise<UsuarioPublico> {
  const email = dados.email.trim().toLowerCase();
  const nome = dados.nome.trim();
  if (!email || !nome) throw new Error('Nome e e-mail obrigatorios');
  if (!dados.senha || dados.senha.length < 8) {
    throw new Error('Senha deve ter pelo menos 8 caracteres');
  }
  const role: RolePainel = dados.role === 'admin' ? 'admin' : 'agente';
  const todas = abasDisponiveisApp();
  const abas = role === 'admin' ? [...todas] : normalizarAbas(dados.abas, todas);

  try {
    const res = await pool.query(
      `INSERT INTO painel_usuarios (email, nome, senha_hash, role, abas, ativo, chatwoot_user_id)
       VALUES ($1, $2, $3, $4, $5::jsonb, true, $6)
       RETURNING *`,
      [
        email,
        nome,
        hashSenha(dados.senha),
        role,
        JSON.stringify(abas),
        dados.chatwoot_user_id ?? null,
      ],
    );
    return paraPublico(rowParaUsuario(res.rows[0]));
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === '23505') throw new Error('E-mail ja cadastrado');
    throw err;
  }
}

export async function atualizarUsuario(
  id: number,
  dados: {
    nome?: string;
    role?: RolePainel;
    abas?: string[];
    ativo?: boolean;
    senha?: string;
    chatwoot_user_id?: number | null;
  },
): Promise<UsuarioPublico> {
  const atual = await obterUsuarioPorId(id);
  if (!atual) throw new Error('Usuario nao encontrado');

  const todas = abasDisponiveisApp();
  const nome = dados.nome?.trim() || atual.nome;
  const role: RolePainel = dados.role === 'admin' || dados.role === 'agente' ? dados.role : atual.role;
  const abas = role === 'admin' ? [...todas] : normalizarAbas(dados.abas ?? atual.abas, todas);
  const ativo = typeof dados.ativo === 'boolean' ? dados.ativo : atual.ativo;
  const chatwoot =
    dados.chatwoot_user_id !== undefined ? dados.chatwoot_user_id : atual.chatwoot_user_id;

  let senhaHash: string | null = null;
  if (dados.senha) {
    if (dados.senha.length < 8) throw new Error('Senha deve ter pelo menos 8 caracteres');
    senhaHash = hashSenha(dados.senha);
  }

  const res = await pool.query(
    `UPDATE painel_usuarios SET
       nome = $2,
       role = $3,
       abas = $4::jsonb,
       ativo = $5,
       chatwoot_user_id = $6,
       senha_hash = COALESCE($7, senha_hash),
       atualizado_em = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, nome, role, JSON.stringify(abas), ativo, chatwoot, senhaHash],
  );
  return paraPublico(rowParaUsuario(res.rows[0]));
}

export async function alterarSenhaUsuario(
  id: number,
  senhaAtual: string,
  senhaNova: string,
): Promise<void> {
  const res = await pool.query('SELECT * FROM painel_usuarios WHERE id = $1', [id]);
  if (!res.rows[0]) throw new Error('Usuario nao encontrado');
  if (!verificarSenha(senhaAtual, String(res.rows[0].senha_hash))) {
    throw new Error('Senha atual incorreta');
  }
  if (senhaNova.length < 8) throw new Error('Nova senha deve ter pelo menos 8 caracteres');
  await pool.query(
    `UPDATE painel_usuarios SET senha_hash = $2, atualizado_em = NOW() WHERE id = $1`,
    [id, hashSenha(senhaNova)],
  );
}

export async function excluirUsuario(id: number, adminId: number): Promise<void> {
  if (id === adminId) throw new Error('Nao e possivel excluir a propria conta');
  const alvo = await obterUsuarioPorId(id);
  if (!alvo) throw new Error('Usuario nao encontrado');
  if (alvo.role === 'admin') {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM painel_usuarios WHERE role = 'admin' AND ativo = true`,
    );
    if (Number(rows[0]?.n || 0) <= 1) {
      throw new Error('Precisa haver ao menos um admin ativo');
    }
  }
  await pool.query('DELETE FROM painel_usuarios WHERE id = $1', [id]);
}

export function usuarioTemAba(u: UsuarioPainel | UsuarioPublico, aba: string): boolean {
  if (u.role === 'admin') return true;
  return u.abas.includes(aba);
}
