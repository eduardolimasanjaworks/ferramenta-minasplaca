/**
 * Utilitarios de mensagem — Minas Placa clean.
 */

export function dividirResposta(texto: string, maxCaracteres = 1500): string[] {
  if (texto.length <= maxCaracteres) return [texto];
  const partes: string[] = [];
  let restante = texto.trim();
  while (restante.length > maxCaracteres) {
    let corte = restante.lastIndexOf('\n', maxCaracteres);
    if (corte <= 0) corte = restante.lastIndexOf('.', maxCaracteres);
    if (corte <= 0) corte = restante.lastIndexOf(' ', maxCaracteres);
    if (corte <= 0) corte = maxCaracteres;
    partes.push(restante.substring(0, corte).trim());
    restante = restante.substring(corte).trim();
  }
  if (restante) partes.push(restante);
  return partes;
}

export function normalizarRespostaWhatsapp(texto: string): string {
  return texto
    .split(/\r?\n/)
    .map(linha => linha.trim().replace(/[ \t]+/g, ' '))
    .join('\n')
    .trim();
}

export function jidEhGrupoOuLista(jid: string): boolean {
  return jid.includes('@g.us') || jid.includes('@broadcast') || jid.endsWith('@lid');
}
