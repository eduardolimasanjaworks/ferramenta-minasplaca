/**
 * Autenticacao do painel — multi-usuario (cookie HMAC com userId).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { config } from './config.js';
import {
  autenticarUsuario,
  obterUsuarioPorId,
  type UsuarioPainel,
} from './usuarios-store.js';

const COOKIE = 'mp_session';
const TTL_PADRAO_MS = 12 * 60 * 60 * 1000;
const TTL_LEMBRAR_MS = 30 * 24 * 60 * 60 * 1000;

function segredo(): string {
  return `${config.adminKey}:${config.adminPassword}:minasplaca-painel-v2`;
}

function assinar(payload: string): string {
  return createHmac('sha256', segredo()).update(payload).digest('hex');
}

export function ttlSessao(lembrar: boolean): number {
  return lembrar ? TTL_LEMBRAR_MS : TTL_PADRAO_MS;
}

/** Token: userId.exp.sig */
export function criarToken(userId: number, ttlMs: number = TTL_PADRAO_MS): string {
  const exp = String(Date.now() + ttlMs);
  const base = `${userId}.${exp}`;
  return `${base}.${assinar(base)}`;
}

export function parseToken(token: string | undefined): { userId: number; exp: number } | null {
  if (!token) return null;
  const partes = token.split('.');
  if (partes.length !== 3) return null;
  const [userIdStr, exp, sig] = partes;
  const userId = Number(userIdStr);
  if (!userId || !exp || !sig) return null;
  if (Number(exp) < Date.now()) return null;
  const esperado = assinar(`${userIdStr}.${exp}`);
  try {
    const a = Buffer.from(sig, 'hex');
    const b = Buffer.from(esperado, 'hex');
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  return { userId, exp: Number(exp) };
}

export function tokenValido(token: string | undefined): boolean {
  return parseToken(token) !== null;
}

function lerCookie(req: FastifyRequest, nome: string): string | undefined {
  const raw = req.headers.cookie;
  if (!raw) return undefined;
  for (const parte of raw.split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === nome) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

export function definirCookieSessao(reply: FastifyReply, token: string, ttlMs: number = TTL_PADRAO_MS): void {
  const maxAge = Math.floor(ttlMs / 1000);
  reply.header(
    'Set-Cookie',
    `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax; Secure`,
  );
}

export function limparCookieSessao(reply: FastifyReply): void {
  reply.header('Set-Cookie', `${COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax; Secure`);
}

export function estaAutenticado(req: FastifyRequest): boolean {
  return tokenValido(lerCookie(req, COOKIE));
}

export async function obterUsuarioDaSessao(req: FastifyRequest): Promise<UsuarioPainel | null> {
  const parsed = parseToken(lerCookie(req, COOKIE));
  if (!parsed) return null;
  const u = await obterUsuarioPorId(parsed.userId);
  if (!u || !u.ativo) return null;
  return u;
}

export async function loginComCredenciais(
  email: string,
  senha: string,
): Promise<UsuarioPainel | null> {
  return autenticarUsuario(email, senha);
}

/** Compat: ainda usado em alguns pontos legados — prefira obterUsuarioDaSessao. */
export function credenciaisCorretas(_email: string, _senha: string): boolean {
  return false;
}

const PUBLICOS: Array<string | RegExp> = [
  '/login',
  '/logout',
  '/health',
  '/webhook/evolution',
  '/webhook/uazapi',
  '/webhook/chatwoot',
  '/favicon.ico',
  '/termos.html',
];

export function ehCaminhoPublico(url: string): boolean {
  const caminho = url.split('?')[0];
  return PUBLICOS.some((p) => (typeof p === 'string' ? caminho === p : p.test(caminho)));
}
