/**
 * Configuracao central — Minas Placa (clean).
 */

function token(
  nome: string,
  varPrincipal: string,
  varAlternativa?: string,
): string | undefined {
  const v = process.env[varPrincipal] ?? (varAlternativa ? process.env[varAlternativa] : undefined);
  if (v && v.trim().length > 0) return v.trim();
  console.warn(`[config] ${nome} nao configurado (${varPrincipal})`);
  return undefined;
}

export const config = {
  porta: Number(process.env.PORT ?? '8095'),
  buildId: 'minasplaca-clean-2026-06-30',

  // LLM
  openrouterToken: token('openrouter', 'OPENROUTER_TOKEN'),
  openrouterHabilitado: (process.env.OPENROUTER_HABILITADO ?? 'true') === 'true',
  modeloChat: process.env.MODELO_CHAT_OPENROUTER ?? 'openai/gpt-4o-mini',

  // WhatsApp / Evolution
  evolutionUrl: process.env.EVOLUTION_URL ?? 'http://evolution-api:8080',
  evolutionApiKey: process.env.EVOLUTION_API_KEY ?? 'minasplaca-evolution-key-2026',
  evolutionInstance: process.env.EVOLUTION_INSTANCE ?? 'minasplaca-atendimento',

  // Banco / cache / vetores
  databaseUrl: process.env.DATABASE_URL ?? 'postgresql://minasplaca:minasplaca_secret@postgres:5432/minasplaca',
  redisUrl: process.env.REDIS_URL ?? 'redis://redis:6379/0',
  qdrantUrl: process.env.QDRANT_URL ?? 'http://qdrant:6333',

  // Directus
  directusUrl: process.env.DIRECTUS_URL ?? 'http://minasplaca_directus:8055',
  directusToken: token('directus', 'DIRECTUS_TOKEN', 'VITE_DIRECTUS_TOKEN'),

  // Admin
  adminKey: process.env.IAMINASPLACA_ADMIN_KEY ?? 'minasplaca-pausa-2026',
  adminEmail: process.env.IAMINASPLACA_ADMIN_EMAIL ?? 'admin@minasplaca.com',
  adminPassword: process.env.IAMINASPLACA_ADMIN_PASSWORD ?? 'MinasPlaca2026!',

  // Prompt
  promptPadrao: process.env.PROMPT_PADRAO ?? '',
  promptArquivoInicial: [
    '/app/prompt-inicial.txt',
    '/app/prompt-cliente.txt',
  ],

  // Debounce
  debounceMs: Number(process.env.DEBOUNCE_MS ?? '2500'),
};
