/**
 * Normalização de telefone WhatsApp / Chatwoot.
 */
/** Apenas dígitos (ex: 5511999999999) */
export declare function normalizarTelefone(valor: string): string;
/** Contato individual plausível para monitor/disparo */
export declare function telefoneEhContatoValido(valor: string): boolean;
/** remoteJid a partir de telefone */
export declare function telefoneParaJid(telefone: string): string;
/** Identifica grupo/lista/broadcast no WhatsApp. */
export declare function jidEhGrupoOuLista(remoteJid: string | undefined | null): boolean;
/** Telefone a partir de remoteJid */
export declare function jidParaTelefone(remoteJid: string): string;
