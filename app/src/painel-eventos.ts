/**
 * Eventos em tempo real para o painel (SSE via Redis pub/sub).
 */
import type { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { config } from './config.js';
import { estaAutenticado } from './auth-minasplaca.js';
import { obterRedis } from './lib/redis.js';

export const CANAL_PAINEL_EVENTOS = 'painel:eventos';

export type EventoPainel =
  | { tipo: 'pausa_contato'; telefone: string; pausada: boolean; origem?: string; atualizado_em: string }
  | { tipo: 'pausa_global'; pausada: boolean; atualizado_em: string }
  | { tipo: 'proativos_toggle'; habilitado: boolean; atualizado_em: string };

export async function publicarEventoPainel(evento: EventoPainel): Promise<void> {
  try {
    const redis = obterRedis();
    await redis.publish(CANAL_PAINEL_EVENTOS, JSON.stringify(evento));
  } catch (err) {
    console.error('[painel-eventos] falha ao publicar:', err);
  }
}

export async function rotasPainelEventos(app: FastifyInstance): Promise<void> {
  app.get('/api/ia/painel/eventos', async (req, reply) => {
    if (!estaAutenticado(req)) {
      return reply.status(401).send({ ok: false, erro: 'Nao autenticado' });
    }

    reply.hijack();
    const origin = req.headers.origin;
    if (origin) {
      reply.raw.setHeader('Access-Control-Allow-Origin', origin);
      reply.raw.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    reply.raw.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('X-Accel-Buffering', 'no');
    reply.raw.flushHeaders?.();

    const subscriber = new Redis(config.redisUrl);
    let fechado = false;

    const ping = setInterval(() => {
      if (!fechado) reply.raw.write(': ping\n\n');
    }, 25000);

    const encerrar = async () => {
      if (fechado) return;
      fechado = true;
      clearInterval(ping);
      try {
        await subscriber.unsubscribe(CANAL_PAINEL_EVENTOS);
        subscriber.disconnect();
      } catch {
        /* ignore */
      }
      if (!reply.raw.writableEnded) reply.raw.end();
    };

    req.raw.on('close', () => {
      void encerrar();
    });

    try {
      await subscriber.subscribe(CANAL_PAINEL_EVENTOS);
      reply.raw.write(`event: ready\ndata: ${JSON.stringify({ ok: true })}\n\n`);

      subscriber.on('message', (_canal: string, mensagem: string) => {
        if (fechado) return;
        reply.raw.write(`event: painel\ndata: ${mensagem}\n\n`);
      });
    } catch (err) {
      await encerrar();
      console.error('[painel-eventos] erro SSE:', err);
    }
  });
}
