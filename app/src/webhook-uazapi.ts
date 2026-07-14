/**
 * Webhook UazAPI → debounce do iaminas.
 * Aceita EventType=messages; ignora fromMe; dedupe por messageid.
 */
import type { FastifyInstance } from 'fastify';
import { config } from './config.js';
import { adicionarAoDebounce } from './debounce-minasplaca.js';
import { iaEstaPausada } from './pausa-minasplaca.js';
import { linhaTemLicencaIa } from './licenca-ia.js';
import { jidParaTelefone } from './util/telefone.js';
import { marcarMensagemNova } from './lib/msg-dedupe.js';
import { uazDownloadMensagem } from './lib/uazapi.js';
import type { ItemDebounce } from './lib/tipos.js';

type MsgUaz = {
  fromMe?: boolean;
  isGroup?: boolean;
  chatid?: string;
  messageid?: string;
  id?: string;
  text?: string;
  mediaType?: string;
  messageType?: string;
  type?: string;
  senderName?: string;
  content?: unknown;
};

type PayloadUaz = {
  EventType?: string;
  event?: string;
  message?: MsgUaz;
  chat?: { phone?: string; wa_chatid?: string; name?: string };
  token?: string;
};

function eventoDe(p: PayloadUaz): string {
  return String(p.EventType ?? p.event ?? '').toLowerCase();
}

function tipoDe(msg: MsgUaz): ItemDebounce['tipo'] {
  const m = String(msg.mediaType || msg.messageType || msg.type || '').toLowerCase();
  if (m.includes('image')) return 'imagem';
  if (m.includes('video')) return 'video';
  if (m.includes('audio') || m === 'ptt') return 'audio';
  if (m.includes('document')) return 'documento';
  return 'texto';
}

async function salvarNoDirectus(base64: string, mime: string, id: string): Promise<string | null> {
  let data = base64.includes(';base64,') ? base64.split(';base64,')[1] : base64;
  let ext = 'bin';
  if (mime.includes('jpeg') || mime.includes('jpg')) ext = 'jpg';
  else if (mime.includes('png')) ext = 'png';
  else if (mime.includes('pdf')) ext = 'pdf';
  else if (mime.includes('ogg') || mime.includes('opus')) ext = 'ogg';
  else if (mime.includes('mp4')) ext = 'mp4';

  const buf = Buffer.from(data, 'base64');
  const form = new FormData();
  form.append('file', new Blob([buf], { type: mime || 'application/octet-stream' }), `${id}.${ext}`);
  const res = await fetch(`${config.directusUrl}/files`, {
    method: 'POST',
    headers: config.directusToken ? { Authorization: `Bearer ${config.directusToken}` } : {},
    body: form,
  });
  if (!res.ok) return null;
  const json = await res.json() as { data?: { id?: string } };
  const fileId = json.data?.id;
  return fileId ? `${config.directusUrl}/assets/${fileId}` : null;
}

async function montarConteudo(msg: MsgUaz, tipo: ItemDebounce['tipo']): Promise<string> {
  const texto = String(msg.text ?? '').trim();
  const mid = msg.messageid || msg.id;
  if (tipo === 'texto') return texto;

  if (tipo === 'audio' && mid) {
    try {
      const dl = await uazDownloadMensagem(mid, { transcribe: true, return_base64: false });
      if (dl.transcription) return `[Áudio]: ${dl.transcription}`;
    } catch (err) {
      console.error('[webhook-uazapi] transcricao:', err);
    }
    return texto || '[Áudio]';
  }

  if ((tipo === 'imagem' || tipo === 'documento' || tipo === 'video') && mid) {
    try {
      const dl = await uazDownloadMensagem(mid, { return_base64: true, return_link: true });
      let url = dl.url;
      if (dl.base64) {
        const mime =
          tipo === 'imagem' ? 'image/jpeg'
            : tipo === 'video' ? 'video/mp4'
              : 'application/octet-stream';
        url = (await salvarNoDirectus(dl.base64, mime, mid)) ?? url;
      }
      if (url) {
        const label = tipo === 'imagem' ? 'Imagem' : tipo === 'video' ? 'Vídeo' : 'Arquivo';
        return `[${label}: ${url}] ${texto}`.trim();
      }
    } catch (err) {
      console.error('[webhook-uazapi] midia:', err);
    }
  }

  const labels: Record<string, string> = {
    imagem: '[Imagem]', video: '[Vídeo]', audio: '[Áudio]', documento: '[Arquivo]',
  };
  return texto || labels[tipo] || `[${tipo}]`;
}

export async function rotasWebhookUazapi(app: FastifyInstance): Promise<void> {
  app.post('/webhook/uazapi', async (req, reply) => {
    const payload = req.body as PayloadUaz;
    const evento = eventoDe(payload);

    if (evento && evento !== 'messages' && !evento.includes('message')) {
      return reply.status(200).send({ ok: true, ignorado: evento });
    }

    const msg = payload.message;
    if (!msg) return reply.status(200).send({ ok: true, ignorado: 'sem_message' });
    if (msg.fromMe) return reply.status(200).send({ ok: true, ignorado: 'fromMe' });
    if (msg.isGroup) return reply.status(200).send({ ok: true, ignorado: 'grupo' });

    const messageId = msg.messageid || msg.id;
    if (!(await marcarMensagemNova(messageId))) {
      return reply.status(200).send({ ok: true, ignorado: 'duplicada', messageId });
    }

    const remoteJid = msg.chatid || payload.chat?.wa_chatid || '';
    const telefone =
      jidParaTelefone(remoteJid)
      || String(payload.chat?.phone ?? '').replace(/\D/g, '');
    if (!telefone) return reply.status(200).send({ ok: true, ignorado: 'sem_telefone' });

    const instance = config.whatsappInstance;
    if (!(await linhaTemLicencaIa(instance))) {
      return reply.status(200).send({ ok: true, ignorado: 'sem_licenca_ia', instance });
    }
    if (await iaEstaPausada(telefone)) {
      return reply.status(200).send({ ok: true, ignorado: 'ia_pausada', telefone });
    }

    const tipo = tipoDe(msg);
    const conteudo = await montarConteudo(msg, tipo);
    if (!conteudo) return reply.status(200).send({ ok: true, ignorado: 'sem_conteudo' });

    await adicionarAoDebounce({
      remoteJid: remoteJid || `${telefone}@s.whatsapp.net`,
      telefone,
      conteudo,
      tipo,
      pushName: msg.senderName || payload.chat?.name,
      instance,
      midiaId: messageId,
      recebidoEm: Date.now(),
    });

    return reply.status(200).send({ ok: true, processado: true, provider: 'uazapi' });
  });
}
