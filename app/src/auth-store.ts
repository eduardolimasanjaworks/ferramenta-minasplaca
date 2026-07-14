/**
 * Credenciais do painel — persistidas no Redis (permite troca de senha).
 */
import { config } from './config.js';
import { obterRedis } from './lib/redis.js';

const REDIS_KEY = 'painel:credenciais';

let emailAtual = (config.adminEmail ?? '').trim().toLowerCase();
let senhaAtual = config.adminPassword ?? '';

export function obterEmailPainel(): string {
  return emailAtual;
}

export function obterSenhaPainel(): string {
  return senhaAtual;
}

export async function inicializarCredenciais(): Promise<void> {
  const redis = obterRedis();
  const raw = await redis.get(REDIS_KEY);
  if (raw) {
    try {
      const dados = JSON.parse(raw) as { email?: string; password?: string };
      if (dados.email) emailAtual = dados.email.trim().toLowerCase();
      if (dados.password) senhaAtual = dados.password;
      return;
    } catch {
      /* seed abaixo */
    }
  }
  await redis.set(REDIS_KEY, JSON.stringify({ email: emailAtual, password: senhaAtual }));
}

export async function alterarSenhaPainel(novaSenha: string): Promise<void> {
  if (!novaSenha || novaSenha.length < 6) {
    throw new Error('A nova senha deve ter pelo menos 6 caracteres.');
  }
  senhaAtual = novaSenha;
  const redis = obterRedis();
  await redis.set(REDIS_KEY, JSON.stringify({ email: emailAtual, password: senhaAtual }));
}
