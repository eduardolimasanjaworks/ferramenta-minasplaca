/**
 * Webhook Evolution API — Minas Placa clean.
 */
import type { FastifyInstance } from 'fastify';
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
  data?: MensagemUpsertData;
  instance?: string;
}

function extrairTexto(message?: Record<string, unknown>): string {
  if (!message) return '';
  const conversation = (message.conversation as string) ?? '';
  const extended = (message.extendedTextMessage as { text?: string })?.text ?? '';
  const image = (message.imageMessage as { caption?: string })?.caption ?? '';
  const video = (message.videoMessage as { caption?: string })?.caption ?? '';
  return conversation || extended || image || video;
}

function detectarTipo(message?: Record<string, unknown>): ItemDebounce['tipo'] {
  if (!message) return 'texto';
  if (message.imageMessage) return 'imagem';
  if (message.videoMessage) return 'video';
  if (message.audioMessage) return 'audio';
  if (message.documentMessage) return 'documento';
  return 'texto';
}

export async function rotasWebhook(app: FastifyInstance): Promise<void> {
  app.post('/webhook/evolution', async (req, reply) => {
    const payload = req.body as WebhookEvolution;

    if ((payload.event ?? '').toLowerCase() !== 'messages_upsert') {
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
    const texto = extrairTexto(message);
    const tipo = detectarTipo(message);

    if (!texto && tipo === 'texto') {
      return reply.status(200).send({ ok: true, ignorado: 'sem_texto' });
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

    return reply.status(200).send({ ok: true });
  });
}
