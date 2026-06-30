/**
 * Servidor Fastify — Minas Placa clean.
 */
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { rotasWebhook } from './webhook-evolution.js';
import { rotasSaude } from './saude-minasplaca.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ORIGENS_CORS = new Set(['https://iaminas.sanjaworks.com', 'http://iaminas.sanjaworks.com']);

export async function criarServidor() {
  const app = Fastify({ logger: true });

  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body: string, done) => {
    if (!body || body.trim() === '') {
      done(null, {});
    } else {
      try {
        done(null, JSON.parse(body));
      } catch (err) {
        done(err as Error);
      }
    }
  });

  app.addHook('onRequest', async (req, reply) => {
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : null;
    if (origin && ORIGENS_CORS.has(origin)) {
      reply.header('Access-Control-Allow-Origin', origin);
      reply.header('Vary', 'Origin');
      reply.header('Access-Control-Allow-Credentials', 'true');
      reply.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      reply.header('Access-Control-Allow-Headers', 'Content-Type, x-minasplaca-key, Authorization');
      if (req.method === 'OPTIONS') {
        return reply.code(204).send();
      }
    }
  });

  await app.register(fastifyStatic, {
    root: resolve(__dirname, '../public'),
    prefix: '/',
  });

  await app.register(rotasSaude);
  await app.register(rotasWebhook);

  app.get('/whatsapp', async (_req, reply) => reply.redirect('/phone.html?painel=whatsapp'));
  app.get('/phone', async (_req, reply) => reply.redirect('/phone.html'));

  app.get('/api/whatsapp/status', async (_req, reply) => {
    try {
      const res = await fetch(`${config.evolutionUrl}/instance/connectionState/${config.evolutionInstance}`, {
        headers: { apikey: config.evolutionApiKey },
      });
      const data = await res.json() as { state?: string; status?: { state?: string }; instance?: { state?: string } };
      const state = data.instance?.state ?? data.state ?? data.status?.state ?? 'UNKNOWN';
      return { connected: state.toUpperCase() === 'CONNECTED', state };
    } catch (err) {
      return reply.status(502).send({ error: String(err) });
    }
  });

  app.get('/api/whatsapp/qr', async (_req, reply) => {
    try {
      const state = await fetch(`${config.evolutionUrl}/instance/connectionState/${config.evolutionInstance}`, {
        headers: { apikey: config.evolutionApiKey },
      });
      const stateData = await state.json() as { state?: string };
      if ((stateData.state ?? '').toUpperCase() === 'CONNECTED') {
        return { connected: true };
      }
      const res = await fetch(`${config.evolutionUrl}/instance/connect/${config.evolutionInstance}`, {
        headers: { apikey: config.evolutionApiKey },
      });
      const data = await res.json() as { code?: string; qrcode?: string; pairingCode?: string | null };
      return { code: data.code ?? data.qrcode, pairingCode: data.pairingCode };
    } catch (err) {
      return reply.status(502).send({ error: String(err) });
    }
  });

  return app;
}

export async function iniciarServidor() {
  const app = await criarServidor();
  await app.listen({ port: config.porta, host: '0.0.0.0' });
  console.log(`[servidor] Rodando na porta ${config.porta}`);
  return app;
}
