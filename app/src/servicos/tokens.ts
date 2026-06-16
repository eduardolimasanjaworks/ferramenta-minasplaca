/**
 * Validação dos tokens de API (Claude, OpenAI, Groq).
 */
import OpenAI from 'openai';
import { config } from '../config.js';

export type ProvedorAtivo = 'claude' | 'openai' | 'groq' | 'nenhum';

export interface StatusTokens {
  claude: boolean;
  openai: boolean;
  groq: boolean;
  /** Provedor usado para chat/inferência */
  provedorAtivo: ProvedorAtivo;
  /** OpenAI necessário para embeddings e Whisper mesmo com Claude no chat */
  openaiUtilidades: boolean;
}

/** Testa token Anthropic (Claude) */
export async function validarClaude(): Promise<boolean> {
  if (!config.anthropicToken) return false;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.anthropicToken,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.modeloChatClaude,
        max_tokens: 16,
        messages: [{ role: 'user', content: 'ok' }],
      }),
      signal: AbortSignal.timeout(15000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Testa token OpenAI */
export async function validarOpenAI(): Promise<boolean> {
  if (!config.openaiToken) return false;
  try {
    const cliente = new OpenAI({ apiKey: config.openaiToken });
    await cliente.models.list();
    return true;
  } catch {
    return false;
  }
}

/** Testa token Groq (API compatível com OpenAI) */
export async function validarGroq(): Promise<boolean> {
  if (!config.groqToken) return false;
  try {
    const cliente = new OpenAI({
      apiKey: config.groqToken,
      baseURL: 'https://api.groq.com/openai/v1',
    });
    await cliente.models.list();
    return true;
  } catch {
    return false;
  }
}

/** Valida todos os tokens e indica qual provedor de chat está ativo */
export async function validarTokens(): Promise<StatusTokens> {
  const [claude, openai, groq] = await Promise.all([
    validarClaude(),
    validarOpenAI(),
    validarGroq(),
  ]);
  const provedorAtivo: ProvedorAtivo = claude
    ? 'claude'
    : openai
      ? 'openai'
      : groq
        ? 'groq'
        : 'nenhum';
  return {
    claude,
    openai,
    groq,
    provedorAtivo,
    openaiUtilidades: openai,
  };
}
