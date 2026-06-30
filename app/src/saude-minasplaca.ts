/**
 * Health check — Minas Placa clean.
 */
import type { FastifyInstance } from 'fastify';
import { obterRedis } from './lib/redis.js';
import { QdrantClient } from '@qdrant/js-client-rest';
import pg from 'pg';
import { config } from './config.js';

const redis = obterRedis();

async function verificarRedis(): Promise<boolean> {
  try {
    await redis.ping();
    return true;
  } catch {
    return false;
  }
}

async function verificarPostgres(): Promise<boolean> {
  try {
    const pool = new pg.Pool({ connectionString: config.databaseUrl });
    await pool.query('SELECT 1');
    await pool.end();
    return true;
  } catch {
    return false;
  }
}

async function verificarQdrant(): Promise<boolean> {
  try {
    const cliente = new QdrantClient({ url: config.qdrantUrl });
    await cliente.getCollections();
    return true;
  } catch {
    return false;
  }
}

async function verificarOpenRouter(): Promise<boolean> {
  if (!config.openrouterToken) return false;
  try {
    const res = await fetch('https://openrouter.ai/api/v1/auth/key', {
      headers: { Authorization: `Bearer ${config.openrouterToken}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function verificarEvolution(): Promise<boolean> {
  try {
    const res = await fetch(`${config.evolutionUrl}/instance/fetchInstances`, {
      headers: { 'Content-Type': 'application/json', apikey: config.evolutionApiKey },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function rotasSaude(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => {
    const [redisOk, postgresOk, qdrantOk, openrouterOk, evolutionOk] = await Promise.all([
      verificarRedis(),
      verificarPostgres(),
      verificarQdrant(),
      verificarOpenRouter(),
      verificarEvolution(),
    ]);

    return {
      status: redisOk && postgresOk ? 'ok' : 'degradado',
      build: config.buildId,
      servicos: {
        redis: redisOk,
        postgres: postgresOk,
        qdrant: qdrantOk,
        openrouter: openrouterOk,
        evolution: evolutionOk,
      },
    };
  });
}
