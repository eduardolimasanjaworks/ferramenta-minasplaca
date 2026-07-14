/**
 * Normalização de telefone WhatsApp / Chatwoot.
 */

/** Apenas dígitos (ex: 5511999999999) */
export function normalizarTelefone(valor: string): string {
  let d = valor.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  return d;
}

/**
 * Formato canônico BR para histórico/disparos (55 + DDD + 9 dígitos móvel).
 * Unifica variantes com/sem o 9 após o DDD (ex: 553172261284 ↔ 5531972261284).
 */
export function canonizarTelefoneBr(valor: string): string {
  let d = normalizarTelefone(valor);
  if (!d) return d;

  if (d.startsWith('55') && d.length === 13) {
    const ddd = d.slice(2, 4);
    const local = d.slice(4);
    if (local.length === 8 && /^[6-9]/.test(local)) {
      d = `55${ddd}9${local}`;
    }
  }

  if (!d.startsWith('55') && d.length >= 10 && d.length <= 11) {
    d = `55${d}`;
    if (d.length === 13) {
      const ddd = d.slice(2, 4);
      const local = d.slice(4);
      if (local.length === 8 && /^[6-9]/.test(local)) {
        d = `55${ddd}9${local}`;
      }
    }
  }

  return d;
}

/** Variantes do mesmo número (com e sem 9) para busca no histórico. */
export function variantesTelefoneBr(valor: string): string[] {
  const base = normalizarTelefone(valor);
  const canon = canonizarTelefoneBr(valor);
  const set = new Set<string>();
  if (base) set.add(base);
  if (canon) set.add(canon);

  if (canon.startsWith('55') && canon.length === 14) {
    const semNove = canon.slice(0, 4) + canon.slice(5);
    set.add(semNove);
  }
  if (base.startsWith('55') && base.length === 13) {
    const comNove = canonizarTelefoneBr(base);
    if (comNove) set.add(comNove);
  }

  return [...set].filter(Boolean);
}

/** Contato individual plausível para monitor/disparo */
export function telefoneEhContatoValido(valor: string): boolean {
  const telefone = normalizarTelefone(valor);
  return telefone.length >= 10 && telefone.length <= 15;
}

/** remoteJid a partir de telefone */
export function telefoneParaJid(telefone: string): string {
  const n = normalizarTelefone(telefone);
  return `${n}@s.whatsapp.net`;
}

/** Identifica grupo/lista/broadcast no WhatsApp. */
export function jidEhGrupoOuLista(remoteJid: string | undefined | null): boolean {
  const jid = String(remoteJid ?? '').toLowerCase().trim();
  return jid.endsWith('@g.us') || jid.endsWith('@broadcast') || jid.includes('@newsletter');
}

/** Telefone a partir de remoteJid */
export function jidParaTelefone(remoteJid: string): string {
  return normalizarTelefone(remoteJid.split('@')[0] ?? remoteJid);
}
