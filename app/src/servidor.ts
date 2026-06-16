/**
 * Servidor Fastify — monta rotas, arquivos estáticos e plugins.
 */
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { rotasSaude } from './rotas/saude.js';
import { rotasAdmin } from './rotas/admin.js';
import { rotasWebhook } from './rotas/webhook.js';
import { rotasPausa } from './rotas/pausa.js';
import { rotasDispararOferta } from './rotas/disparar-oferta.js';
import { rotasDebounceAdmin } from './rotas/debounce-admin.js';
import { rotasWhatsapp } from './rotas/whatsapp.js';
import { rotasDiagnostico } from './rotas/diagnostico.js';
import { rotasAtendimento } from './rotas/atendimento.js';
import { rotasPipelineAdmin } from './rotas/pipeline-admin.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function criarServidor() {
  const app = Fastify({ logger: true });

  await app.register(fastifyStatic, {
    root: resolve(__dirname, '../public'),
    prefix: '/',
  });

  await app.register(rotasSaude);
  await app.register(rotasAdmin);
  await app.register(rotasWebhook);
  await app.register(rotasPausa);
  await app.register(rotasDispararOferta);
  await app.register(rotasDebounceAdmin);
  await app.register(rotasWhatsapp);
  await app.register(rotasDiagnostico);
  await app.register(rotasAtendimento);
  await app.register(rotasPipelineAdmin);

  /** Atalho /whatsapp → página de QR */
  app.get('/whatsapp', async (_req, reply) => {
    return reply.redirect('/whatsapp.html');
  });

  app.get('/pipeline', async (_req, reply) => {
    return reply.redirect('/pipeline.html');
  });

  return app;
}

export async function iniciarServidor() {
  const app = await criarServidor();
  await app.listen({ port: config.porta, host: '0.0.0.0' });
  console.log(`[servidor] Rodando na porta ${config.porta}`);
  return app;
}
