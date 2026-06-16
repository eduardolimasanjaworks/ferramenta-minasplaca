/**
 * Estado de atendimento IA no ERP — consulta e flags para o portal GMX.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { normalizarTelefone } from '../util/telefone.js';
import {
  contatoPausado,
  pausarContato,
  despausarContato,
} from '../servicos/pausa.js';
import {
  limparPrecisaAtendimentoErp,
  marcarPrecisaAtendimentoErp,
  obterEstadoAtendimentoErp,
} from '../servicos/erp-atendimento-motorista.js';

function verificarAdmin(req: FastifyRequest): boolean {
  if (!config.adminKey) return true;
  return req.headers['x-iagmx-key'] === config.adminKey;
}

export async function rotasAtendimento(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { telefone: string } }>(
    '/api/atendimento/contato/:telefone',
    async (req, reply) => {
      if (!verificarAdmin(req)) {
        return reply.status(401).send({ erro: 'Não autorizado' });
      }
      const telefone = normalizarTelefone(req.params.telefone);
      const erp = await obterEstadoAtendimentoErp(telefone);
      const pausadoRedis = await contatoPausado(telefone);
      return {
        telefone,
        motorista_id: erp.motoristaId,
        ia_pausada: pausadoRedis || Boolean(erp.estado.ia_pausada),
        ia_pausa_motivo: erp.estado.ia_pausa_motivo,
        precisa_atendimento: Boolean(erp.estado.precisa_atendimento),
        precisa_atendimento_motivo: erp.estado.precisa_atendimento_motivo,
        ultima_intencao_whatsapp: erp.estado.ultima_intencao_whatsapp,
        ultima_intencao_em: erp.estado.ultima_intencao_em,
      };
    },
  );

  app.post<{ Params: { telefone: string }; Body: { motivo?: string } }>(
    '/api/atendimento/contato/:telefone/pausar',
    async (req, reply) => {
      if (!verificarAdmin(req)) {
        return reply.status(401).send({ erro: 'Não autorizado' });
      }
      const telefone = normalizarTelefone(req.params.telefone);
      const motivo = req.body?.motivo ?? 'pausado_pelo_erp';
      await pausarContato(telefone, motivo);
      return { ok: true, telefone, ia_pausada: true };
    },
  );

  app.delete<{ Params: { telefone: string } }>(
    '/api/atendimento/contato/:telefone/pausar',
    async (req, reply) => {
      if (!verificarAdmin(req)) {
        return reply.status(401).send({ erro: 'Não autorizado' });
      }
      const telefone = normalizarTelefone(req.params.telefone);
      await despausarContato(telefone);
      return { ok: true, telefone, ia_pausada: false };
    },
  );

  app.post<{ Params: { telefone: string }; Body: { motivo?: string } }>(
    '/api/atendimento/contato/:telefone/precisa',
    async (req, reply) => {
      if (!verificarAdmin(req)) {
        return reply.status(401).send({ erro: 'Não autorizado' });
      }
      const telefone = normalizarTelefone(req.params.telefone);
      const motivo = req.body?.motivo ?? 'solicitado_pelo_erp';
      await marcarPrecisaAtendimentoErp(telefone, motivo);
      return { ok: true, telefone, precisa_atendimento: true };
    },
  );

  app.delete<{ Params: { telefone: string } }>(
    '/api/atendimento/contato/:telefone/precisa',
    async (req, reply) => {
      if (!verificarAdmin(req)) {
        return reply.status(401).send({ erro: 'Não autorizado' });
      }
      const telefone = normalizarTelefone(req.params.telefone);
      await limparPrecisaAtendimentoErp(telefone);
      return { ok: true, telefone, precisa_atendimento: false };
    },
  );
}
