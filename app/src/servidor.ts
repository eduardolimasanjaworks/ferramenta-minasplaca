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

  return app;
}

export async function iniciarServidor() {
  const app = await criarServidor();
  await app.listen({ port: config.porta, host: '0.0.0.0' });
  console.log(`[servidor] Rodando na porta ${config.porta}`);
  return app;
}
