/**
 * Rotas de administração: prompts e configurações editáveis.
 * Painel interno — leitura e gravação abertas (proteção via rede/nginx).
 */
import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { obterPromptMeta, salvarPrompt } from '../servicos/prompt.js';
import {
  obterConfigHumanizacao,
  salvarConfigHumanizacao,
  HUMANIZACAO_PADRAO,
} from '../servicos/config-humanizacao.js';
import {
  obterPromptOcrMeta,
  salvarPromptOcr,
  OCR_PADRAO,
} from '../servicos/config-ocr.js';
import {
  obterConfigTempo,
  salvarConfigTempo,
  TEMPO_PADRAO,
} from '../servicos/config-tempo.js';

export async function rotasAdmin(app: FastifyInstance): Promise<void> {
  app.get('/api/prompt', async () => obterPromptMeta());

  app.put<{ Body: { prompt?: string } }>('/api/prompt', async (req, reply) => {
    const { prompt } = req.body ?? {};
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 10) {
      return reply.status(400).send({ erro: 'Prompt deve ter pelo menos 10 caracteres.' });
    }
    const { qdrantOk } = await salvarPrompt(prompt.trim());
    return {
      ok: true,
      mensagem: qdrantOk
        ? 'Prompt salvo e indexado no Qdrant.'
        : 'Prompt salvo no banco, mas falhou indexar no Qdrant — RAG pode ficar desatualizado.',
      qdrantOk,
    };
  });

  app.get('/api/config/ocr', async () => {
    const meta = await obterPromptOcrMeta();
    return { ...meta, padrao: OCR_PADRAO };
  });

  app.put<{ Body: { prompt?: string } }>('/api/config/ocr', async (req, reply) => {
    const { prompt } = req.body ?? {};
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 20) {
      return reply.status(400).send({ erro: 'Prompt OCR deve ter pelo menos 20 caracteres.' });
    }
    const salvo = await salvarPromptOcr(prompt.trim());
    return { ok: true, prompt: salvo, mensagem: 'Prompt OCR salvo.' };
  });

  app.get('/api/config/envio', async () => {
    const cfg = await obterConfigHumanizacao();
    return { config: cfg, padrao: HUMANIZACAO_PADRAO };
  });

  app.put<{ Body: Partial<typeof HUMANIZACAO_PADRAO> }>('/api/config/envio', async (req, reply) => {
    const body = req.body ?? {};
    const nums = ['delayMinMs', 'delayMaxMs', 'digitandoMinMs', 'digitandoMaxMs'] as const;
    for (const k of nums) {
      if (body[k] !== undefined && (typeof body[k] !== 'number' || body[k] < 0)) {
        return reply.status(400).send({ erro: `${k} deve ser número >= 0` });
      }
    }
    const atual = await obterConfigHumanizacao();
    const salvo = await salvarConfigHumanizacao({ ...atual, ...body });
    return { ok: true, config: salvo };
  });

  app.get('/api/config/tempo', async () => {
    const cfg = await obterConfigTempo();
    return { config: cfg, padrao: TEMPO_PADRAO, build: config.buildId };
  });

  app.put<{ Body: Partial<typeof TEMPO_PADRAO> }>('/api/config/tempo', async (req, reply) => {
    const body = req.body ?? {};
    for (const k of ['debounceMs', 'debounceWorkerMs'] as const) {
      if (body[k] !== undefined && (typeof body[k] !== 'number' || body[k] < 0)) {
        return reply.status(400).send({ erro: `${k} deve ser número >= 0` });
      }
    }
    const salvo = await salvarConfigTempo(body);
    return { ok: true, config: salvo, mensagem: 'Tempos atualizados — efeito imediato.' };
  });

  app.post('/api/admin/reload-processo', async (_req, reply) => {
    void reply.send({ ok: true, mensagem: 'Reiniciando processo em 300ms', build: config.buildId });
    setTimeout(() => process.exit(0), 300);
  });
}
