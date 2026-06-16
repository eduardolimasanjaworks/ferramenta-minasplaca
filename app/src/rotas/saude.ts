/**
 * Rota de health check — verifica dependências e tokens.
 */
import type { FastifyInstance } from 'fastify';
import { verificarRedis } from '../servicos/debounce.js';
import { verificarPostgres } from '../servicos/prompt.js';
import { verificarEvolution } from '../servicos/evolution.js';
import { validarTokens } from '../servicos/tokens.js';
import { verificarQdrant } from '../servicos/qdrant.js';
import { verificarDirectus, directusConfigurado, validarDirectusToken } from '../servicos/directus.js';
import { obterStatusPausa } from '../servicos/pausa.js';
import { config } from '../config.js';
import { statusFilaInferencia } from '../servicos/fila-inferencia.js';

export async function rotasSaude(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => {
    const [redis, postgres, evolution, qdrant, tokens] = await Promise.all([
      verificarRedis(),
      verificarPostgres(),
      verificarEvolution(),
      verificarQdrant(),
      validarTokens(),
    ]);
    const ok = redis && postgres;
    const pausa = await obterStatusPausa();
    const directusTokenOk = directusConfigurado() ? await validarDirectusToken() : false;
    return {
      status: ok ? 'ok' : 'degradado',
      build: config.buildId,
      servicos: {
        redis,
        postgres,
        evolution,
        qdrant,
        claude: tokens.claude,
        openai: tokens.openai,
        groq: tokens.groq,
        provedorAtivo: tokens.provedorAtivo,
        openaiUtilidades: tokens.openaiUtilidades,
        directus: directusConfigurado() ? await verificarDirectus() : false,
        directusToken: directusTokenOk,
      },
      pausa,
      filaInferencia: statusFilaInferencia(),
      instancia: config.evolutionInstance,
    };
  });

  /** Valida tokens explicitamente */
  app.get('/api/tokens', async () => {
    const tokens = await validarTokens();
    return {
      claude: tokens.claude,
      openai: tokens.openai,
      groq: tokens.groq,
      provedorAtivo: tokens.provedorAtivo,
      openaiUtilidades: tokens.openaiUtilidades,
      claudeConfigurado: Boolean(config.anthropicToken),
      openaiConfigurado: Boolean(config.openaiToken),
      groqConfigurado: Boolean(config.groqToken),
    };
  });
}
