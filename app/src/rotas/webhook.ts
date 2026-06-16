/**
 * Webhook da Evolution API — recebe MESSAGES_UPSERT e enfileira no debounce.
 */
import type { FastifyInstance } from 'fastify';
import type { WebhookEvolution, MensagemUpsertData } from '../tipos/evolution.js';
import { processarConteudo } from '../servicos/midia.js';
import { adicionarAoDebounce } from '../servicos/debounce.js';
import { iaPodeResponder } from '../servicos/pausa.js';
import { jidParaTelefone } from '../util/telefone.js';
import { logEvento } from '../util/log-eventos.js';
import { garantirDigitando } from '../servicos/digitando-sessao.js';
import {
  registrarEnfileiramento,
  vincularTraceEnfileirado,
} from '../servicos/trace-pipeline.js';

/** Eventos de mensagem recebida (Evolution v2 usa messages.upsert) */
function ehMensagemRecebida(evento: string | undefined): boolean {
  const e = (evento ?? '').toLowerCase().replace(/\./g, '_');
  return e === 'messages_upsert';
}

export async function rotasWebhook(app: FastifyInstance): Promise<void> {
  app.post('/webhook/evolution', async (req, reply) => {
    const payload = req.body as WebhookEvolution;

    if (!ehMensagemRecebida(payload.event)) {
      logEvento('webhook', 'Evento ignorado', { evento: payload.event }, 'debug');
      return reply.status(200).send({ ok: true, ignorado: payload.event });
    }

    const dados = payload.data as MensagemUpsertData;

    // Ignora mensagens enviadas pelo próprio bot
    if (dados.key?.fromMe) {
      return reply.status(200).send({ ok: true, ignorado: 'fromMe' });
    }

    const remoteJid =
      dados.key?.remoteJid ??
      (dados.key as { remoteJidAlt?: string } | undefined)?.remoteJidAlt;
    if (!remoteJid) {
      return reply.status(200).send({ ok: true, ignorado: 'sem remoteJid' });
    }

    // Processa conteúdo de forma assíncrona (STT/OCR podem demorar)
    setImmediate(async () => {
      try {
        const telefone = jidParaTelefone(remoteJid);
        if (!(await iaPodeResponder(telefone))) {
          logEvento('webhook', 'Contato pausado — ignorado', { telefone });
          return;
        }

        garantirDigitando(payload.instance, remoteJid);

        const { tipo, conteudo, midiaId, mimetype, fileName } = await processarConteudo(
          dados,
          payload.instance,
        );
        if (!conteudo.trim()) return;

        const traceId = await registrarEnfileiramento({
          telefone,
          remoteJid,
          entrada: conteudo.slice(0, 300),
          tipo,
        });
        await vincularTraceEnfileirado(remoteJid, traceId);

        await adicionarAoDebounce({
          remoteJid,
          pushName: dados.pushName ?? 'Cliente',
          tipo,
          conteudo,
          instance: payload.instance,
          timestamp: Date.now(),
          midiaId,
          mimetype,
          fileName,
          origem: 'evolution',
        });
        logEvento('webhook', 'Mensagem enfileirada no debounce', {
          tipo,
          remoteJid,
          telefone,
          midiaId,
        });
      } catch (err) {
        logEvento(
          'webhook',
          'Erro ao processar mensagem',
          { erro: err instanceof Error ? err.message : String(err) },
          'error',
        );
      }
    });

    return reply.status(200).send({ ok: true });
  });
}
