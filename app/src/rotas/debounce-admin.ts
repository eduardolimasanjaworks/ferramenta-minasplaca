/**
 * Rotas de debug: debounce, fila de respostas, motorista GMX.
 */
import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import {
  statusDebounce,
  simularDebounce,
  processarDebounceExpirado,
} from '../servicos/debounce.js';
import { listarRespostasPendentes, contarPendentes, limparTodaFila } from '../servicos/fila-respostas.js';
import { buscarMotoristaPorTelefone, obterContextoMotoristaCompleto } from '../servicos/motorista-gmx.js';
import { obterContextoHorarioBrasilia } from '../util/horario-brasilia.js';
import { validarDirectusToken } from '../servicos/directus.js';

function verificarAdmin(req: { headers: Record<string, unknown> }): boolean {
  if (!config.adminKey) return true;
  return req.headers['x-iagmx-key'] === config.adminKey;
}

/** Apenas números de teste podem usar /api/debounce/test (evita disparo acidental). */
const PREFIXOS_TESTE = ['551199988', '5511000000', '551188877', '5511999999'];

function telefonePermitidoParaTeste(telefone: string): boolean {
  const n = telefone.replace(/\D/g, '');
  return PREFIXOS_TESTE.some((p) => n.startsWith(p));
}

export async function rotasDebounceAdmin(app: FastifyInstance): Promise<void> {
  app.get('/api/debounce/status', async (req, reply) => {
    if (!verificarAdmin(req)) return reply.status(401).send({ erro: 'Não autorizado' });
    const filas = await statusDebounce();
    const pendentes = await contarPendentes();
    return {
      debounceMs: config.debounceMs,
      filasAtivas: filas,
      respostasPendentes: pendentes,
    };
  });

  app.post<{ Body: { telefone?: string; mensagens?: string[] } }>(
    '/api/debounce/test',
    async (req, reply) => {
      if (!verificarAdmin(req)) return reply.status(401).send({ erro: 'Não autorizado' });
      const telefone = req.body?.telefone?.replace(/\D/g, '');
      const mensagens = req.body?.mensagens;
      if (!telefone || !mensagens?.length) {
        return reply.status(400).send({ erro: 'telefone e mensagens[] obrigatórios' });
      }
      if (!telefonePermitidoParaTeste(telefone)) {
        return reply.status(403).send({
          erro: 'Telefone não autorizado para teste. Use prefixo de teste (ex: 551199988xxxx).',
        });
      }
      const r = await simularDebounce(telefone, mensagens);
      return {
        ok: true,
        ...r,
        aviso: `Aguarde ${config.debounceMs}ms após a última msg. GET /api/debounce/status ou /api/fila-respostas`,
      };
    },
  );

  app.post('/api/debounce/processar-agora', async (req, reply) => {
    if (!verificarAdmin(req)) return reply.status(401).send({ erro: 'Não autorizado' });
    await processarDebounceExpirado();
    return { ok: true };
  });

  app.get('/api/fila-respostas', async (req, reply) => {
    if (!verificarAdmin(req)) return reply.status(401).send({ erro: 'Não autorizado' });
    const itens = await listarRespostasPendentes(50);
    return { total: itens.length, itens };
  });

  app.delete('/api/fila-respostas', async (req, reply) => {
    if (!verificarAdmin(req)) return reply.status(401).send({ erro: 'Não autorizado' });
    const removidos = await limparTodaFila();
    return { ok: true, removidos };
  });

  app.get<{ Querystring: { telefone?: string } }>('/api/motorista', async (req, reply) => {
    if (!verificarAdmin(req)) return reply.status(401).send({ erro: 'Não autorizado' });
    const telefone = req.query.telefone;
    if (!telefone) return reply.status(400).send({ erro: 'telefone obrigatório' });
    const motorista = await buscarMotoristaPorTelefone(telefone).catch(() => null);
    const contexto = await obterContextoMotoristaCompleto(telefone);
    const horario = obterContextoHorarioBrasilia();
    return { motorista, contexto, horario };
  });

  app.get('/api/gmx/status', async (req, reply) => {
    if (!verificarAdmin(req)) return reply.status(401).send({ erro: 'Não autorizado' });
    const tokenOk = await validarDirectusToken();
    return {
      directusUrl: config.directusUrl,
      tokenConfigurado: Boolean(config.directusToken),
      tokenValido: tokenOk,
    };
  });
}
