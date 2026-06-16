/**
 * Re-leitura OCR a partir de mídia em cache (quando a primeira passada recusou ou falhou).
 */
import { extrairTextoImagem } from './openai.js';
import { obterMidiaCache } from './midia-cache.js';
import { ehRecusaOcr, textoOcrValido } from '../util/ocr-qualidade.js';

export async function reextrairTextoMidia(midiaId: string): Promise<string | null> {
  const midia = await obterMidiaCache(midiaId);
  if (!midia) return null;

  try {
    const texto = await extrairTextoImagem(midia.buffer, midia.mimetype);
    if (!textoOcrValido(texto) || ehRecusaOcr(texto)) {
      console.warn('[ocr] Reextração ainda inválida para', midiaId, texto.slice(0, 80));
      return null;
    }
    return texto;
  } catch (err) {
    console.error('[ocr] Erro na reextração:', err);
    return null;
  }
}

export function formatarConteudoOcr(texto: string): string {
  return `[Imagem analisada]: ${texto}`;
}
