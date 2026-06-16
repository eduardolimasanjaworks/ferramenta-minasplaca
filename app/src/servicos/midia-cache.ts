/**
 * Cache temporário de mídia no Redis (para ferramentas Directus).
 */
import { obterRedis } from '../lib/redis.js';

const redis = obterRedis();
const PREFIXO = 'midia:';
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const TTL_SEG = 900;

export interface MidiaCacheada {
  buffer: Buffer;
  mimetype: string;
  fileName: string;
  telefone?: string;
  /** id Redis — evita upload duplicado no Drive */
  midiaId?: string;
}

export async function salvarMidiaCache(
  buffer: Buffer,
  mimetype: string,
  fileName: string,
  telefone?: string,
): Promise<string> {
  if (buffer.length > MAX_BYTES) {
    throw new Error(`Arquivo muito grande (${buffer.length} bytes, máx ${MAX_BYTES})`);
  }
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const payload = JSON.stringify({
    b64: buffer.toString('base64'),
    mimetype,
    fileName,
    telefone,
  });
  await redis.set(`${PREFIXO}${id}`, payload, 'EX', TTL_SEG);
  return id;
}

export async function obterMidiaCache(id: string): Promise<MidiaCacheada | null> {
  const raw = await redis.get(`${PREFIXO}${id}`);
  if (!raw) return null;
  const dados = JSON.parse(raw) as {
    b64: string;
    mimetype: string;
    fileName: string;
    telefone?: string;
  };
  return {
    buffer: Buffer.from(dados.b64, 'base64'),
    mimetype: dados.mimetype,
    fileName: dados.fileName,
    telefone: dados.telefone,
  };
}
