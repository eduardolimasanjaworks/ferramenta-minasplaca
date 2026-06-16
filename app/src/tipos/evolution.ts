/**
 * Tipos TypeScript para payloads da Evolution API v2.
 */

/** Eventos de webhook suportados pela aplicação */
export type EventoEvolution =
  | 'MESSAGES_UPSERT'
  | 'CONNECTION_UPDATE'
  | 'QRCODE_UPDATED'
  | string;

/** Envelope padrão do webhook Evolution */
export interface WebhookEvolution {
  event: EventoEvolution;
  instance: string;
  data: MensagemUpsertData | Record<string, unknown>;
  destination?: string;
  date_time?: string;
  sender?: string;
  server_url?: string;
  apikey?: string;
}

/** Dados de mensagem recebida (MESSAGES_UPSERT) */
export interface MensagemUpsertData {
  key: {
    remoteJid: string;
    fromMe: boolean;
    id: string;
  };
  pushName?: string;
  message?: MensagemConteudo;
  messageType?: string;
  messageTimestamp?: number;
}

/** Conteúdo possível de uma mensagem WhatsApp */
export interface MensagemConteudo {
  conversation?: string;
  extendedTextMessage?: { text: string };
  imageMessage?: MidiaMensagem;
  audioMessage?: MidiaMensagem;
  videoMessage?: MidiaMensagem;
  documentMessage?: MidiaMensagem & { fileName?: string };
  locationMessage?: {
    degreesLatitude?: number;
    degreesLongitude?: number;
    name?: string;
    address?: string;
  };
}

/** Metadados de mídia em mensagem */
export interface MidiaMensagem {
  url?: string;
  mimetype?: string;
  caption?: string;
  fileSha256?: string;
  mediaKey?: string;
  directPath?: string;
}

/** Tipo normalizado de entrada do usuário */
export type TipoEntrada = 'texto' | 'audio' | 'imagem' | 'documento' | 'localizacao' | 'desconhecido';

/** Item acumulado no debounce antes do processamento */
export interface ItemDebounce {
  remoteJid: string;
  pushName: string;
  tipo: TipoEntrada;
  conteudo: string;
  instance: string;
  timestamp: number;
  origem?: 'evolution' | 'teste';
  midiaId?: string;
  mimetype?: string;
  fileName?: string;
}
