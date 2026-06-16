/**
 * Extração de texto de PDF.
 */
export async function extrairTextoPdf(buffer: Buffer): Promise<string> {
  const mod = await import('pdf-parse');
  const pdfParse = mod.default ?? mod;
  const resultado = await pdfParse(buffer);
  const texto = (resultado.text ?? '').replace(/\s+/g, ' ').trim();
  if (texto.length >= 20) return texto;
  return texto || '[PDF recebido — pouco ou nenhum texto extraível automaticamente]';
}
