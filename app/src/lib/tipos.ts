/**
 * Tipos basicos — Minas Placa clean.
 */

export interface MensagemRecebida {
  telefone: string;
  remoteJid: string;
  texto: string;
  midiaId?: string;
  fileName?: string;
  tipo: 'texto' | 'imagem' | 'audio' | 'documento' | 'video';
  pushName?: string;
  instance: string;
}

export interface ItemDebounce {
  remoteJid: string;
  telefone: string;
  conteudo: string;
  tipo: 'texto' | 'imagem' | 'audio' | 'documento' | 'video';
  midiaId?: string;
  fileName?: string;
  pushName?: string;
  instance: string;
  recebidoEm: number;
}

export interface RespostaAgente {
  texto: string;
  precisaCalculadora?: boolean;
  calculo?: {
    produtos: Array<{ nome: string; quantidade: number; precoUnitario: number; total: number }>;
    total: number;
  };
}

export interface RegistroHistorico {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}
