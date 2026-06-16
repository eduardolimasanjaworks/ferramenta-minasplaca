/**
 * Normalização de telefone WhatsApp / Chatwoot.
 */

/** Apenas dígitos (ex: 5511999999999) */
export function normalizarTelefone(valor: string): string {
  let d = valor.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  return d;
}

/** remoteJid a partir de telefone */
export function telefoneParaJid(telefone: string): string {
  const n = normalizarTelefone(telefone);
  return `${n}@s.whatsapp.net`;
}

/** Telefone a partir de remoteJid */
export function jidParaTelefone(remoteJid: string): string {
  return normalizarTelefone(remoteJid.split('@')[0] ?? remoteJid);
}
