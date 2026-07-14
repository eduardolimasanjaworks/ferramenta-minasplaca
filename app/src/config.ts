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
  buildId: 'minasplaca-uazapi-2026-07-14',

  // LLM
  openrouterToken: token('openrouter', 'OPENROUTER_TOKEN'),
  openrouterHabilitado: (process.env.OPENROUTER_HABILITADO ?? 'true') === 'true',
  modeloChat: process.env.MODELO_CHAT_OPENROUTER ?? 'openai/gpt-4o-mini',
  openaiApiKey: token('openai', 'OPENAI_API_KEY'),

  // WhatsApp — provider ativo (uazapi | evolution). Um por vez (evita conflito de sessao).
  whatsappProvider: (
    (process.env.WHATSAPP_PROVIDER ?? 'uazapi').toLowerCase() === 'evolution'
      ? 'evolution'
      : 'uazapi'
  ) as 'uazapi' | 'evolution',

  // UazAPI (docs.uazapi.com / uazapi.dev)
  uazapiBaseUrl: (process.env.UAZAPI_BASE_URL ?? 'https://integrador.uazapi.com').replace(/\/$/, ''),
  uazapiAdminToken: process.env.UAZAPI_ADMIN_TOKEN?.trim() || undefined,
  uazapiToken: process.env.UAZAPI_TOKEN?.trim() || undefined,
  uazapiInstanceName: process.env.UAZAPI_INSTANCE_NAME ?? 'minasplaca-iaminas',
  uazapiWebhookUrl:
    process.env.UAZAPI_WEBHOOK_URL?.trim()
    || 'https://iaminas.sanjaworks.com/webhook/uazapi',

  // Evolution (legado / fallback)
  evolutionUrl: process.env.EVOLUTION_URL ?? 'http://evolution-api:8080',
  evolutionApiKey: process.env.EVOLUTION_API_KEY ?? 'minasplaca-evolution-key-2026',
  evolutionInstance: process.env.EVOLUTION_INSTANCE ?? 'minasplaca-atendimento',

  /** Nome da linha usada em licenca IA / logs */
  get whatsappInstance(): string {
    return this.whatsappProvider === 'uazapi'
      ? this.uazapiInstanceName
      : this.evolutionInstance;
  },

  // Banco / cache / vetores
  databaseUrl: process.env.DATABASE_URL ?? 'postgresql://minasplaca:minasplaca_secret@postgres:5432/minasplaca',
  redisUrl: process.env.REDIS_URL ?? 'redis://redis:6379/0',
  qdrantUrl: process.env.QDRANT_URL ?? 'http://qdrant:6333',

  // Directus
  directusUrl: process.env.DIRECTUS_URL ?? 'http://minasplaca_directus:8055',
  directusToken: token('directus', 'DIRECTUS_TOKEN', 'VITE_DIRECTUS_TOKEN'),
  directusAdminEmail: process.env.IAMINASPLACA_ADMIN_EMAIL ?? 'admin@minasplaca.com',
  directusAdminPassword: process.env.IAMINASPLACA_ADMIN_PASSWORD ?? 'MinasPlaca2026!',

  // Admin / webhook Chatwoot
  adminKey:
    process.env.MINASPLACA_WEBHOOK_KEY
    ?? process.env.IAMINASPLACA_ADMIN_KEY
    ?? 'minasplaca-pausa-2026',
  adminEmail: process.env.IAMINASPLACA_ADMIN_EMAIL ?? 'admin@minasplaca.com',
  adminPassword: process.env.IAMINASPLACA_ADMIN_PASSWORD ?? 'MinasPlaca2026!',

  // Debounce
  debounceMs: Number(process.env.DEBOUNCE_MS ?? '2500'),

  // Follow-up (padrão 30 minutos)
  followupMs: Number(process.env.FOLLOWUP_MS ?? '1800000'),

  // n8n
  n8nUrl: process.env.N8N_URL ?? 'http://localhost:5678',

  // VhSys ERP
  vhsysAccessToken: process.env.VHSYS_ACCESS_TOKEN ?? 'MKOKBTBHXUNBZaPLADNbIWYHGeKQca',
  vhsysSecretAccessToken: process.env.VHSYS_SECRET_ACCESS_TOKEN ?? 'q0GcQ0kT0Vy0SNpWsytPiOZnhEOgFAa',

  // Disparos proativos
  rastreioWebhookUrl:
    process.env.RASTREIO_WEBHOOK_URL ?? 'https://integradorwebhook.sanjaworks.com/webhook/rastrear-encomenda',
  proativosTimezone: process.env.PROATIVOS_TIMEZONE ?? 'America/Sao_Paulo',
  proativosDryRun: (process.env.PROATIVOS_DRY_RUN ?? 'false') === 'true',
  proativosTelefoneTeste: process.env.PROATIVOS_TELEFONE_TESTE ?? '',

  // Chatwoot SSO (embed painel)
  chatwootUrl: process.env.CHATWOOT_URL ?? 'https://chat.sanjaworks.com',
  chatwootAccountId: process.env.CHATWOOT_ACCOUNT_ID ?? '13',
  chatwootSsoUserId: process.env.CHATWOOT_SSO_USER_ID ?? '49',
  chatwootPlatformToken: token('chatwoot platform', 'CHATWOOT_PLATFORM_TOKEN'),
  /** Secret do webhook Chatwoot (HMAC X-Chatwoot-Signature) — opcional. */
  chatwootWebhookSecret: process.env.CHATWOOT_WEBHOOK_SECRET?.trim() || undefined,
  /** Opcional — se vazio, obtido via Platform API do usuario SSO. */
  chatwootApiAccessToken: token('chatwoot api', 'CHATWOOT_API_ACCESS_TOKEN'),
};
