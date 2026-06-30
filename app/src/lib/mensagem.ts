/**
 * Utilitarios de mensagem — Minas Placa clean.
 */

export function dividirResposta(texto: string, maxCaracteres = 1500): string[] {
  if (texto.length <= maxCaracteres) return [texto];
  const partes: string[] = [];
  let atual = '';
  const frases = texto.split(/(?<=\.\s)|(?<=\n)/);
  for (const frase of frases) {
    if ((atual + frase).length > maxCaracteres) {
      if (atual) partes.push(atual.trim());
      atual = frase;
    } else {
      atual += frase;
    }
  }
  if (atual) partes.push(atual.trim());
  return partes;
}

export function normalizarRespostaWhatsapp(texto: string): string {
  return texto.trim().replace(/\s+/g, ' ');
}

export function jidEhGrupoOuLista(jid: string): boolean {
  return jid.includes('@g.us') || jid.includes('@broadcast') || jid.endsWith('@lid');
}
