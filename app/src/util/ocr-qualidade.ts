/**
 * Validação de qualidade do texto extraído por OCR/visão/PDF.
 */

const MARCADORES_FALHA = [
  'não foi possível analisar',
  'nao foi possivel analisar',
  'não foi possível transcrever',
  'falha ao baixar',
  'pouco ou nenhum texto',
  'recebido — falha',
];

const MARCADORES_RECUSA = [
  'não posso ajudar',
  'nao posso ajudar',
  'não posso fornecer',
  'nao posso fornecer',
  'não sou capaz',
  'nao sou capaz',
  'não consigo ajudar',
  'nao consigo ajudar',
  'sorry, i can',
  "i can't assist",
  'i cannot assist',
  'unable to help',
  'against my',
  'política de uso',
  'politica de uso',
  'como um modelo de linguagem',
  'as an ai',
];

/** Remove prefixos de pipeline de mídia. */
export function extrairCorpoOcr(conteudo: string): string {
  return conteudo
    .replace(/^\[(?:Imagem analisada|Imagem\/documento|PDF)[^\]]*\]:\s*/i, '')
    .replace(/\nLegenda:.*$/i, '')
    .trim();
}

/** Modelo recusou transcrever (ex.: "Desculpe, não posso ajudar"). */
export function ehRecusaOcr(conteudo: string | undefined): boolean {
  if (!conteudo?.trim()) return false;
  const corpo = extrairCorpoOcr(conteudo).toLowerCase();
  return MARCADORES_RECUSA.some((m) => corpo.includes(m));
}

export function textoOcrValido(conteudo: string | undefined): boolean {
  if (!conteudo?.trim()) return false;
  const t = conteudo.toLowerCase();
  if (MARCADORES_FALHA.some((m) => t.includes(m))) return false;
  if (ehRecusaOcr(conteudo)) return false;

  const corpo = extrairCorpoOcr(conteudo);
  if (corpo.length < 20) return false;

  const palavras = corpo.split(/\s+/).filter((p) => p.length >= 2);
  return palavras.length >= 4;
}

export type MotivoOcrInvalido = 'vazio' | 'falha_pipeline' | 'recusa_modelo' | 'curto';

export function motivoOcrInvalido(conteudo: string | undefined): MotivoOcrInvalido {
  if (!conteudo?.trim()) return 'vazio';
  const t = conteudo.toLowerCase();
  if (MARCADORES_FALHA.some((m) => t.includes(m))) return 'falha_pipeline';
  if (ehRecusaOcr(conteudo)) return 'recusa_modelo';
  const corpo = extrairCorpoOcr(conteudo);
  if (corpo.length < 20) return 'curto';
  const palavras = corpo.split(/\s+/).filter((p) => p.length >= 2);
  if (palavras.length < 4) return 'curto';
  return 'vazio';
}

export const MSG_OCR_ILEGIVEL =
  'Não consegui ler direito parceiro, manda outra foto com boa luz por favor';

export const MSG_OCR_ESCALONAR =
  'Não consegui ler o documento parceiro, vou passar pra equipe te ajudar com o cadastro, aguarda um pouco';
