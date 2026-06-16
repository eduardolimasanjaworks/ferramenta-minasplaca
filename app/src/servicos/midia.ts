/**
 * Classificação e extração de conteúdo de mensagens WhatsApp.
 */
import type {
  MensagemUpsertData,
  MensagemConteudo,
  TipoEntrada,
} from '../tipos/evolution.js';
import { baixarMidia } from './evolution.js';
import { transcreverAudio, extrairTextoImagem } from './openai.js';
import { extrairTextoPdf } from './pdf.js';
import { salvarMidiaCache } from './midia-cache.js';
import { jidParaTelefone } from '../util/telefone.js';
import { buscarMotoristaPorTelefone, garantirMotorista } from './motorista-gmx.js';
import { espelharMidiaWhatsappNoDrive } from './google-drive-motorista.js';

function inferirTipoDocumentoMidia(fileName: string, legenda = ''): string {
  const t = `${fileName} ${legenda}`.toLowerCase();
  if (/\bcnh\b/.test(t)) return 'cnh';
  if (/\bcrlv\b/.test(t)) return 'crlv';
  if (/\bantt\b/.test(t)) return 'antt';
  if (/comprovante|endere[cç]o/.test(t)) return 'endereco';
  if (/canhoto|entrega/.test(t)) return 'comprovante_entrega';
  if (/caminh[aã]o|cavalo/.test(t)) return 'foto';
  if (/carreta/.test(t)) return 'carreta_1';
  return 'entrada';
}

async function espelharMidiaRecebida(
  telefone: string,
  midiaId: string,
  buffer: Buffer,
  mimetype: string,
  fileName: string,
  legenda = '',
): Promise<void> {
  try {
    const motorista =
      (await buscarMotoristaPorTelefone(telefone)) ??
      (await garantirMotorista(telefone).catch(() => null));
    if (!motorista) return;

    await espelharMidiaWhatsappNoDrive({
      motorista,
      midia: { buffer, mimetype, fileName, telefone, midiaId },
      tipoDocumento: inferirTipoDocumentoMidia(fileName, legenda),
    });
  } catch (err) {
    console.error('[midia] Erro ao espelhar mídia (não crítico):', err);
  }
}

export interface ConteudoProcessado {
  tipo: TipoEntrada;
  conteudo: string;
  midiaId?: string;
  mimetype?: string;
  fileName?: string;
}

/** Identifica o tipo de entrada da mensagem */
export function classificarMensagem(msg: MensagemConteudo): TipoEntrada {
  if (msg.conversation || msg.extendedTextMessage?.text) return 'texto';
  if (msg.audioMessage) return 'audio';
  if (msg.imageMessage) return 'imagem';
  if (msg.documentMessage) return 'documento';
  if (msg.locationMessage) return 'localizacao';
  return 'desconhecido';
}

/** Extrai texto simples de mensagem de texto */
export function extrairTexto(msg: MensagemConteudo): string {
  return (
    msg.conversation ??
    msg.extendedTextMessage?.text ??
    msg.imageMessage?.caption ??
    msg.documentMessage?.caption ??
    ''
  );
}

function ehPdf(mimetype: string, fileName?: string): boolean {
  return mimetype.includes('pdf') || (fileName?.toLowerCase().endsWith('.pdf') ?? false);
}

function ehImagem(mimetype: string, fileName?: string): boolean {
  if (mimetype.startsWith('image/')) return true;
  const n = fileName?.toLowerCase() ?? '';
  return /\.(jpe?g|png|webp|gif|bmp)$/.test(n);
}

/**
 * Processa mensagem recebida e retorna conteúdo normalizado em texto.
 * Áudio → Whisper | Imagem/PDF → análise | Texto → direto
 */
export async function processarConteudo(
  dados: MensagemUpsertData,
  instance: string,
): Promise<ConteudoProcessado> {
  const msg = dados.message;
  if (!msg) return { tipo: 'desconhecido', conteudo: '' };

  const tipo = classificarMensagem(msg);
  const telefone = jidParaTelefone(dados.key.remoteJid);

  if (tipo === 'texto') {
    return { tipo, conteudo: extrairTexto(msg) };
  }

  if (tipo === 'audio' && msg.audioMessage) {
    try {
      const { buffer, mimetype } = await baixarMidia(
        instance,
        dados.key.id,
        dados.key.remoteJid,
      );
      const midiaId = await salvarMidiaCache(buffer, mimetype, 'audio.ogg', telefone);
      const transcricao = await transcreverAudio(buffer, mimetype);
      return {
        tipo,
        conteudo: `[Áudio transcrito]: ${transcricao}`,
        midiaId,
        mimetype,
        fileName: 'audio.ogg',
      };
    } catch (err) {
      console.error('[midia] Erro ao transcrever áudio:', err);
      return { tipo, conteudo: '[Áudio recebido - não foi possível transcrever]' };
    }
  }

  if (tipo === 'imagem' && msg.imageMessage) {
    try {
      const { buffer, mimetype } = await baixarMidia(
        instance,
        dados.key.id,
        dados.key.remoteJid,
      );
      const fileName = 'imagem.jpg';
      const midiaId = await salvarMidiaCache(buffer, mimetype, fileName, telefone);
      const ocr = await extrairTextoImagem(buffer, mimetype);
      const legenda = msg.imageMessage.caption ? `\nLegenda: ${msg.imageMessage.caption}` : '';
      void espelharMidiaRecebida(
        telefone,
        midiaId,
        buffer,
        mimetype,
        fileName,
        msg.imageMessage.caption ?? '',
      );
      return {
        tipo,
        conteudo: `[Imagem analisada]: ${ocr}${legenda}`,
        midiaId,
        mimetype,
        fileName,
      };
    } catch (err) {
      console.error('[midia] Erro no OCR da imagem:', err);
      return { tipo, conteudo: '[Imagem recebida - não foi possível analisar]' };
    }
  }

  if (tipo === 'documento' && msg.documentMessage) {
    const fileName = msg.documentMessage.fileName ?? 'documento';
    const mimetype = msg.documentMessage.mimetype ?? 'application/octet-stream';
    const legenda = msg.documentMessage.caption ?? '';

    try {
      const { buffer, mimetype: mimeReal } = await baixarMidia(
        instance,
        dados.key.id,
        dados.key.remoteJid,
      );
      const mime = mimeReal || mimetype;
      const midiaId = await salvarMidiaCache(buffer, mime, fileName, telefone);

      if (ehPdf(mime, fileName)) {
        const textoPdf = await extrairTextoPdf(buffer);
        void espelharMidiaRecebida(telefone, midiaId, buffer, mime, fileName, legenda);
        return {
          tipo,
          conteudo: `[PDF — ${fileName}]: ${textoPdf}${legenda ? `\nLegenda: ${legenda}` : ''}`,
          midiaId,
          mimetype: mime,
          fileName,
        };
      }

      if (ehImagem(mime, fileName)) {
        const ocr = await extrairTextoImagem(buffer, mime);
        void espelharMidiaRecebida(telefone, midiaId, buffer, mime, fileName, legenda);
        return {
          tipo: 'imagem',
          conteudo: `[Imagem/documento — ${fileName}]: ${ocr}${legenda ? `\nLegenda: ${legenda}` : ''}`,
          midiaId,
          mimetype: mime,
          fileName,
        };
      }

      void espelharMidiaRecebida(telefone, midiaId, buffer, mime, fileName, legenda);
      return {
        tipo,
        conteudo: `[Documento: ${fileName}] tipo ${mime} — enviado ao sistema${legenda ? ` (${legenda})` : ''}`,
        midiaId,
        mimetype: mime,
        fileName,
      };
    } catch (err) {
      console.error('[midia] Erro ao processar documento:', err);
      return {
        tipo,
        conteudo: `[Documento: ${fileName}] recebido — falha ao baixar/analisar`,
      };
    }
  }

  const loc = msg.locationMessage;
  if (tipo === 'localizacao' && loc) {
    const lat = loc.degreesLatitude ?? 0;
    const lng = loc.degreesLongitude ?? 0;
    const nome = loc.name ?? loc.address ?? '';
    return {
      tipo,
      conteudo: `[Localização GPS: lat ${lat}, lng ${lng}${nome ? `, ${nome}` : ''}]`,
    };
  }

  return { tipo: 'desconhecido', conteudo: '' };
}
