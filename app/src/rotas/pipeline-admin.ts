/**
 * API do pipeline visível — etapas de geração de resposta.
 */
import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import {
  listarTracesRecentes,
  obterTrace,
} from '../servicos/trace-pipeline.js';

function verificarAdmin(req: { headers: Record<string, unknown> }): boolean {
  if (!config.adminKey) return true;
  return req.headers['x-iagmx-key'] === config.adminKey;
}

export async function rotasPipelineAdmin(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { limite?: string } }>(
    '/api/pipeline/traces',
    async (req, reply) => {
      if (!verificarAdmin(req)) return reply.status(401).send({ erro: 'Não autorizado' });
      const limite = Math.min(50, parseInt(req.query.limite ?? '25', 10));
      const traces = await listarTracesRecentes(limite);
      return {
        build: config.buildId,
        total: traces.length,
        traces,
      };
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/pipeline/traces/:id',
    async (req, reply) => {
      if (!verificarAdmin(req)) return reply.status(401).send({ erro: 'Não autorizado' });
      const trace = await obterTrace(req.params.id);
      if (!trace) return reply.status(404).send({ erro: 'Trace não encontrado' });
      return trace;
    },
  );
}
