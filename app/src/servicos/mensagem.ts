/**
 * Fragmentação de respostas para WhatsApp.
 * Divide por vírgula e remove pontos finais.
 */
import { config } from '../config.js';
import { sanitizarVazamentoPensamento } from './cadeia-pensamento.js';

/**
 * Normaliza texto do LLM para estilo WhatsApp (remove pontos, achata linhas).
 */
export function normalizarRespostaWhatsapp(texto: string): string {
  return sanitizarVazamentoPensamento(
    texto
      .replace(/\r\n/g, '\n')
      .replace(/\n+/g, ', ')
      .replace(/\.\s+/g, ', ')
      .replace(/\.\s*$/g, '')
      .replace(/\.(,|$)/g, '$1')
      .replace(/,{2,}/g, ',')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

/**
 * Divide texto em mensagens menores (uma por vírgula).
 * Remove pontos finais conforme estilo de chat WhatsApp.
 */
export function dividirResposta(texto: string): string[] {
  const limpo = texto
    .replace(/\r\n/g, '\n')
    .replace(/\n+/g, ', ')
    .replace(/\.\s*$/g, '')
    .replace(/\.(\s|,|$)/g, ',')
    .replace(/,{2,}/g, ',')
    .replace(/\s+/g, ' ')
    .trim();

  const partes = limpo
    .split(',')
    .map((p) => p.trim().replace(/\.$/, ''))
    .filter((p) => p.length > 0);

  if (partes.length === 0) return [limpo || 'Ok'];

  return partes;
}

/** Aguarda delay fixo (legado — preferir config-humanizacao) */
export function aguardarEntreMensagens(): Promise<void> {
  return new Promise((r) => setTimeout(r, config.delayEntreMensagens));
}
