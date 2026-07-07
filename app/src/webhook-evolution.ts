/**
 * Webhook Evolution API — Minas Placa clean.
 */
import type { FastifyInstance } from 'fastify';
import { config } from './config.js';
import { adicionarAoDebounce } from './debounce-minasplaca.js';
import { jidParaTelefone } from './util/telefone.js';
import type { ItemDebounce } from './lib/tipos.js';

interface MensagemUpsertData {
  key?: { remoteJid?: string; fromMe?: boolean };
  message?: Record<string, unknown>;
  pushName?: string;
}

interface WebhookEvolution {
  event?: string;
  data?: MensagemUpsertData | null;
  instance?: string;
}

function normalizarEvento(evento?: string): string {
  return (evento ?? '').toLowerCase().replace(/\./g, '_');
}

function obterMensagemReal(message: any): any {
  if (!message) return {};
  if (message.ephemeralMessage?.message) {
    return obterMensagemReal(message.ephemeralMessage.message);
  }
  if (message.viewOnceMessage?.message) {
    return obterMensagemReal(message.viewOnceMessage.message);
  }
  if (message.viewOnceMessageV2?.message) {
    return obterMensagemReal(message.viewOnceMessageV2.message);
  }
  if (message.documentWithCaptionMessage?.message) {
    return obterMensagemReal(message.documentWithCaptionMessage.message);
  }
  return message;
}

async function baixarEEnviarParaDirectus(
  dados: any,
  instance: string
): Promise<string | null> {
  const messageId = dados.key?.id;
  if (!messageId) return null;

  try {
    const url = `${config.evolutionUrl}/chat/getBase64FromMediaMessage/${instance}`;
    console.log(`[webhook] Tentando baixar media do Evolution API para ID: ${messageId}`);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: config.evolutionApiKey,
      },
      body: JSON.stringify({
        message: {
          key: dados.key,
          message: dados.message
        }
      }),
    });

    if (!res.ok) {
      console.error(`[webhook] Erro ao buscar base64 da midia (${res.status}):`, await res.text());
      return null;
    }

    const json = await res.json() as { base64?: string; mimeType?: string };
    let base64Data = json.base64;
    if (!base64Data) {
      console.error(`[webhook] Nao foi retornado base64 do endpoint`);
      return null;
    }

    // Identificar e extrair extensao do mimetype ou default
    let ext = 'jpg';
    let mimeType = 'image/jpeg';
    if (json.mimeType) {
      mimeType = json.mimeType;
      const parts = json.mimeType.split('/');
      if (parts.length === 2) ext = parts[1];
    } else if (base64Data.startsWith('data:')) {
      const match = base64Data.match(/data:([^;]+);/);
      if (match) {
        mimeType = match[1];
        const parts = match[1].split('/');
        if (parts.length === 2) ext = parts[1];
      }
    }
    
    if (ext === 'jpeg') ext = 'jpg';
    
    // Remover prefixo data:...base64,
    if (base64Data.includes(';base64,')) {
      base64Data = base64Data.split(';base64,')[1];
    }

    const buffer = Buffer.from(base64Data, 'base64');
    
    // Criar FormData do Node 20 para envio ao Directus
    const formData = new FormData();
    formData.append('file', new Blob([buffer], { type: mimeType }), `${messageId}.${ext}`);
    
    console.log(`[webhook] Enviando arquivo para o Directus em: ${config.directusUrl}/files`);
    const uploadRes = await fetch(`${config.directusUrl}/files`, {
      method: 'POST',
      headers: config.directusToken ? {
        Authorization: `Bearer ${config.directusToken}`,
      } : {},
      body: formData,
    });

    if (!uploadRes.ok) {
      console.error(`[webhook] Erro ao enviar arquivo para o Directus (${uploadRes.status}):`, await uploadRes.text());
      return null;
    }

    const uploadJson = await uploadRes.json() as { data?: { id?: string } };
    const fileId = uploadJson.data?.id;
    if (!fileId) {
      console.error(`[webhook] Directus nao retornou o ID do arquivo`);
      return null;
    }

    const publicUrl = `${config.directusUrl}/assets/${fileId}`;
    console.log(`[webhook] Arquivo salvo no Directus com ID ${fileId}. URL: ${publicUrl}`);
    return publicUrl;
  } catch (err) {
    console.error(`[webhook] Erro no fluxo Directus:`, err);
    return null;
  }
}

function extrairTexto(rawMessage?: Record<string, unknown>, urlSobrescrita?: string): string {
  const message = obterMensagemReal(rawMessage);
  if (!message) return '';
  const conversation = (message.conversation as string) ?? '';
  const extended = (message.extendedTextMessage as { text?: string })?.text ?? '';
  
  const parentUrl = (message.mediaUrl as string) ?? (message.url as string) ?? '';
  
  const imageMsg = message.imageMessage as { caption?: string; url?: string; mediaUrl?: string } | undefined;
  const imageCaption = imageMsg?.caption ?? '';
  const imageUrl = urlSobrescrita || imageMsg?.mediaUrl || imageMsg?.url || parentUrl;
  const imageText = imageUrl ? `[Imagem: ${imageUrl}] ${imageCaption}`.trim() : imageCaption;
  
  const videoMsg = message.videoMessage as { caption?: string; url?: string; mediaUrl?: string } | undefined;
  const videoCaption = videoMsg?.caption ?? '';
  const videoUrl = urlSobrescrita || videoMsg?.mediaUrl || videoMsg?.url || parentUrl;
  const videoText = videoUrl ? `[Vídeo: ${videoUrl}] ${videoCaption}`.trim() : videoCaption;

  // Documentos (imagens/logos enviados como arquivo pelo WhatsApp)
  const docMsg = message.documentMessage as { fileName?: string; caption?: string; url?: string; mediaUrl?: string; mimetype?: string } | undefined;
  const docCaption = docMsg?.caption || docMsg?.fileName || '';
  const docUrl = urlSobrescrita || docMsg?.mediaUrl || docMsg?.url || parentUrl;
  const docText = docUrl ? `[Arquivo: ${docUrl}] ${docCaption}`.trim() : docCaption;
  
  return conversation || extended || imageText || videoText || docText;
}

function detectarTipo(rawMessage?: Record<string, unknown>): ItemDebounce['tipo'] {
  const message = obterMensagemReal(rawMessage);
  if (!message) return 'texto';
  if (message.imageMessage) return 'imagem';
  if (message.videoMessage) return 'video';
  if (message.audioMessage) return 'audio';
  if (message.documentMessage) return 'documento';
  return 'texto';
}

async function transcreverAudio(dados: any, instance: string): Promise<string | null> {
  if (!config.openaiApiKey) {
    console.warn('[webhook] OPENAI_API_KEY nao configurada no .env. Ignorando transcricao de audio.');
    return null;
  }

  const messageId = dados.key?.id;
  if (!messageId) return null;

  try {
    const url = `${config.evolutionUrl}/chat/getBase64FromMediaMessage/${instance}`;
    console.log(`[webhook] Baixando audio do Evolution API para transcrição. ID: ${messageId}`);
    
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: config.evolutionApiKey,
      },
      body: JSON.stringify({
        message: {
          key: dados.key,
          message: dados.message
        }
      }),
    });

    if (!res.ok) {
      console.error(`[webhook] Erro ao buscar base64 do audio (${res.status}):`, await res.text());
      return null;
    }

    const json = await res.json() as { base64?: string; mimeType?: string };
    let base64Data = json.base64;
    if (!base64Data) {
      console.error(`[webhook] Nao foi retornado base64 do endpoint de audio`);
      return null;
    }

    if (base64Data.includes(';base64,')) {
      base64Data = base64Data.split(';base64,')[1];
    }

    let mimeType = 'audio/ogg';
    let ext = 'ogg';
    if (json.mimeType) {
      mimeType = json.mimeType;
      const parts = json.mimeType.split('/');
      if (parts.length === 2) {
        ext = parts[1].split(';')[0];
      }
    }

    const buffer = Buffer.from(base64Data, 'base64');
    const blob = new Blob([buffer], { type: mimeType });

    const formData = new FormData();
    formData.append('file', blob, `${messageId}.${ext}`);
    formData.append('model', 'whisper-1');

    console.log(`[webhook] Enviando audio para o OpenAI Whisper...`);
    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.openaiApiKey}`,
      },
      body: formData,
    });

    if (!whisperRes.ok) {
      console.error(`[webhook] Erro na API do Whisper (${whisperRes.status}):`, await whisperRes.text());
      return null;
    }

    const whisperJson = await whisperRes.json() as { text?: string };
    const textoTranscrito = whisperJson.text?.trim();
    if (textoTranscrito) {
      console.log(`[webhook] Audio transcrito com sucesso: "${textoTranscrito}"`);
      return textoTranscrito;
    }

    return null;
  } catch (err) {
    console.error(`[webhook] Erro ao transcrever audio:`, err);
    return null;
  }
}

export async function rotasWebhook(app: FastifyInstance): Promise<void> {
  app.post('/webhook/evolution', async (req, reply) => {
    const payload = req.body as WebhookEvolution;

    if (normalizarEvento(payload.event) !== 'messages_upsert') {
      return reply.status(200).send({ ok: true, ignorado: payload.event });
    }

    const dados = payload.data ?? {};
    if (dados.key?.fromMe) {
      return reply.status(200).send({ ok: true, ignorado: 'fromMe' });
    }

    const remoteJid = dados.key?.remoteJid ?? '';
    if (!remoteJid) {
      return reply.status(200).send({ ok: true, ignorado: 'sem_remoteJid' });
    }

    const telefone = jidParaTelefone(remoteJid);
    const message = dados.message ?? {};
    
    // Log do payload completo para debug de estrutura do Evolution API
    console.log(`[webhook] DEBUG dados recebidos para ${telefone}:`, JSON.stringify(dados, null, 2));

    const tipo = detectarTipo(message);
    
    let urlSobrescrita: string | undefined;
    if (tipo === 'imagem' || tipo === 'documento') {
      const publicUrl = await baixarEEnviarParaDirectus(dados, payload.instance ?? 'minasplaca-atendimento');
      if (publicUrl) {
        urlSobrescrita = publicUrl;
      }
    }

    let texto = extrairTexto(message, urlSobrescrita);

    if (tipo === 'audio') {
      const transcrito = await transcreverAudio(dados, payload.instance ?? 'minasplaca-atendimento');
      if (transcrito) {
        texto = `[Áudio]: ${transcrito}`;
      }
    }

    if (!texto) {
      if (tipo === 'texto') {
        return reply.status(200).send({ ok: true, ignorado: 'sem_texto' });
      } else {
        const labels: Record<string, string> = {
          imagem: '[Imagem]',
          video: '[Vídeo]',
          audio: '[Áudio]',
          documento: '[Arquivo]'
        };
        texto = labels[tipo] || `[${tipo}]`;
      }
    }

    await adicionarAoDebounce({
      remoteJid,
      telefone,
      conteudo: texto,
      tipo,
      pushName: dados.pushName,
      instance: payload.instance ?? 'minasplaca-atendimento',
      recebidoEm: Date.now(),
    });

    return reply.status(200).send({ ok: true, processado: true });
  });
}
