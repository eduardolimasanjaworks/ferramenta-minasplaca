/**
 * Configuração central da aplicação.
 * Lê tokens do .env do usuário com fallbacks; demais valores têm defaults internos.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** Carrega variáveis do arquivo .env na raiz do projeto. */
function carregarEnv(): void {
  const caminhos = [
    resolve(process.cwd(), '../.env'),
    resolve(process.cwd(), '.env'),
    '/app/.env',
  ];
  for (const caminho of caminhos) {
    if (!existsSync(caminho)) continue;
    const conteudo = readFileSync(caminho, 'utf-8');
    for (const linha of conteudo.split('\n')) {
      const limpa = linha.trim();
      if (!limpa || limpa.startsWith('#')) continue;
      const idx = limpa.indexOf('=');
      if (idx === -1) continue;
      const chave = limpa.slice(0, idx).trim();
      const valor = limpa.slice(idx + 1).trim();
      if (!process.env[chave]) process.env[chave] = valor;
    }
    break;
  }
}

carregarEnv();

function resolverArquivoGoogle(...caminhos: string[]): string {
  for (const c of caminhos) {
    if (existsSync(c)) return c;
  }
  return caminhos[0];
}

/** Resolve URL: Docker usa hostname `redis`; host local usa porta publicada no compose. */
function resolverRedisUrl(): string {
  const env = process.env.REDIS_URL?.trim();
  if (env) return env;
  if (existsSync('/.dockerenv')) return 'redis://redis:6379/0';
  return 'redis://127.0.0.1:6380/0';
}

/** Resolve token com fallbacks de nomenclatura */
function token(...chaves: string[]): string {
  for (const chave of chaves) {
    const valor = process.env[chave]?.trim();
    if (valor) return valor;
  }
  return '';
}

export const config = {
  porta: 8095,

  /** Token OpenAI — embeddings, Whisper e fallback de chat/vision */
  openaiToken: token('openaitoken', 'tokenopenai', 'OPENAI_API_KEY'),

  /** Token Anthropic (Claude) — chat primário e OCR */
  anthropicToken: token('claudetoken', 'CLAUDETOKEN', 'ANTHROPIC_API_KEY'),

  /** Token Groq — fallback de chat quando Claude/OpenAI falharem */
  groqToken: token('groqtoken', 'GROQ_API_KEY'),

  evolutionUrl: process.env.EVOLUTION_URL ?? 'http://evolution-api:8080',
  evolutionApiKey: process.env.EVOLUTION_API_KEY ?? 'iagmx-evolution-key-2026',
  evolutionInstance: process.env.EVOLUTION_INSTANCE ?? 'gmx-atendimento',

  redisUrl: resolverRedisUrl(),
  databaseUrl:
    process.env.DATABASE_URL ??
    'postgresql://iagmx:iagmx_secret@postgres:5432/iagmx',

  /** URL do Qdrant (vetorização do prompt) */
  qdrantUrl: process.env.QDRANT_URL ?? 'http://qdrant:6333',
  qdrantColecao: 'prompt_gmx',
  qdrantColecaoLinguagem: 'linguagem_motorista_gmx',

  debounceMs: parseInt(process.env.DEBOUNCE_MS ?? '800', 10),
  debounceWorkerMs: 300,

  buildId: process.env.IAGMX_BUILD_ID ?? '2026-06-15c-pipeline',

  modeloChat: (process.env.MODELO_CHAT ?? 'gpt-4o') as string,
  modeloChatClaude: (process.env.MODELO_CHAT_CLAUDE ?? 'claude-sonnet-4-20250514') as string,
  modeloChatGroq: (process.env.MODELO_CHAT_GROQ ?? 'llama-3.3-70b-versatile') as string,
  modeloVisaoClaude: (process.env.MODELO_VISAO_CLAUDE ?? 'claude-sonnet-4-20250514') as string,
  modeloVisaoOpenAI: (process.env.MODELO_VISAO_OPENAI ?? 'gpt-4o') as string,
  modeloStt: 'whisper-1' as const,
  modeloEmbedding: 'text-embedding-3-large' as const,

  /** Limite de caracteres para usar RAG em vez do prompt inteiro */
  limitePromptRag: 6000,

  /** Quantidade de chunks recuperados do Qdrant */
  chunksRag: 6,

  /** Mensagens de histórico enviadas ao modelo */
  historicoMaxMensagens: 20,

  /** Delay entre mensagens fragmentadas no WhatsApp (ms) */
  delayEntreMensagens: 900,

  /** Inferências LLM simultâneas (resto aguarda na fila interna) */
  inferenciaConcorrenciaMax: Math.min(
    5,
    Math.max(1, parseInt(process.env.INFERENCIA_CONCORRENCIA_MAX ?? '4', 10)),
  ),

  /** Caminho do arquivo de prompt inicial (host e container) */
  promptArquivoInicial: [
    resolve(process.cwd(), '../prompt inicial para avaliarmos dificuldade'),
    resolve(process.cwd(), 'prompt inicial para avaliarmos dificuldade'),
    '/app/prompt-inicial.txt',
  ],

  promptPadrao: `Você é a assistente virtual de atendimento da GMX.
Responda sempre em português brasileiro, de forma clara, profissional e objetiva.`,

  /** Instrução de formatação WhatsApp injetada em toda resposta */
  instrucaoFormatacao: `
FORMATAÇÃO WHATSAPP:
- Uma linha só, sem enter/parágrafo
- Máximo 3 vírgulas (4 mensagens no máximo)
- NUNCA ponto final (.)
- Cada trecho entre vírgulas = uma bolha separada no celular
- Tom de conversa entre parceiros de estrada, direto e leve`,

  /** Directus GMX — ferramentas (OCR, disponibilidade, etc.) */
  directusUrl: (process.env.DIRECTUS_URL ?? 'http://91.99.137.101:8057').replace(/\/$/, ''),
  directusToken: token('directustoken', 'DIRECTUS_TOKEN', 'VITE_DIRECTUS_TOKEN'),

  /** Chave opcional para endpoints /api/pausa */
  adminKey: token('iagmxadminkey', 'IAGMX_ADMIN_KEY'),

  /** Idade máxima para drenar resposta enfileirada (evita disparo tardio sem contexto) */
  filaRespostaMaxIdadeMs: Math.max(
    60_000,
    parseInt(process.env.FILA_RESPOSTA_MAX_IDADE_MS ?? String(15 * 60 * 1000), 10),
  ),

  /** TTL Redis de itens na fila de respostas */
  filaRespostaTtlSegundos: Math.max(
    300,
    parseInt(process.env.FILA_RESPOSTA_TTL_SEGUNDOS ?? String(30 * 60), 10),
  ),

  /** Reconciliação ERP ↔ conversas WhatsApp (disponibilidade/localização) */
  reconciliacaoIntervaloMs: Math.max(
    5 * 60_000,
    parseInt(process.env.RECONCILIACAO_INTERVALO_MS ?? String(30 * 60 * 1000), 10),
  ),
  reconciliacaoJanelaHoras: Math.max(
    1,
    parseInt(process.env.RECONCILIACAO_JANELA_HORAS ?? '48', 10),
  ),
  reconciliacaoMaxMensagens: Math.max(
    10,
    parseInt(process.env.RECONCILIACAO_MAX_MENSAGENS ?? '40', 10),
  ),
  reconciliacaoMaxIaPorCiclo: Math.max(
    1,
    parseInt(process.env.RECONCILIACAO_MAX_IA_POR_CICLO ?? '25', 10),
  ),
  /** Tempo máximo de um ciclo de reconciliação (ms) */
  reconciliacaoTimeoutMs: Math.max(
    30_000,
    parseInt(process.env.RECONCILIACAO_TIMEOUT_MS ?? String(2 * 60 * 1000), 10),
  ),
  /** Máximo de chaves Redis inspecionadas por ciclo (scan) */
  reconciliacaoMaxChavesScan: Math.max(
    20,
    parseInt(process.env.RECONCILIACAO_MAX_CHAVES_SCAN ?? '300', 10),
  ),
  /** Mensagens finais lidas por chave no pré-filtro do scan */
  reconciliacaoPrefetchMensagens: Math.max(
    4,
    parseInt(process.env.RECONCILIACAO_PREFETCH_MSG ?? '12', 10),
  ),

  /** Google Drive — espelho de arquivos WhatsApp (credenciais do ERP gmx) */
  googleDriveRootFolderId:
    process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID ?? '1WSKCajrztXNyQ1Yy8dJkeN8-LeDzE_vk',
  googleOAuthClientFile: resolverArquivoGoogle(
    process.env.GOOGLE_OAUTH_CLIENT_FILE ?? '/app/secrets/google-oauth-client.json',
    resolve(process.cwd(), '../gmx/google-oauth-client.json'),
    '/root/gmx/google-oauth-client.json',
  ),
  googleTokenFile: resolverArquivoGoogle(
    process.env.GOOGLE_TOKEN_FILE ?? '/app/secrets/.google-token.json',
    resolve(process.cwd(), '../gmx/.google-token.json'),
    '/root/gmx/.google-token.json',
  ),
};
