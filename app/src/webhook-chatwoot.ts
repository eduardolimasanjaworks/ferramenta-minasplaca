/**
 * Webhook Chatwoot — pausa/despausa a IA por telefone conforme status da conversa.
 *
 * Aceita:
 *  1) Payload nativo do Chatwoot (conversation_status_changed, conversation_updated, etc.)
 *  2) JSON simples: { "telefone": "5511999999999", "status": "open" | "resolved" | ... }
 *  3) JSON explicito: { "telefone": "5511999999999", "pausar": true | false }
 *  4) Custom attribute Chatwoot: status_ia (ia_desligada / ia_ligada) no contato
 *  5) Legado: ia_desligada boolean
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { config } from './config.js';
import { cancelarFollowup } from './followup-minasplaca.js';
import { obterRedis } from './lib/redis.js';
import { normalizarTelefone } from './util/telefone.js';
import {
  definirPausa,
  definirPausaGlobal,
  IaBloqueadaPorWhatsappError,
  listarPausasAtivas,
  obterEstadoPausa,
  obterEstadoPausaGlobal,
  obterLogsPausa,
  pausarContatosEmLote,
  pausarTodasConversasIniciadas,
  statusImplicaPausa,
  validarTelefone,
  whatsappConectadoParaIa,
} from './pausa-minasplaca.js';
import {
  obterConfigNotificacao,
  salvarConfigNotificacao,
  obterLogsNotificacao,
  notificarIntervencaoHumana,
} from './notificacao-minasplaca.js';
import { obterConfigFollowup, salvarConfigFollowup } from './followup-config.js';
import { obterConfigProativos, salvarConfigProativos, alternarDisparosProativos } from './proativos-config.js';
import { listarLogsDisparos } from './proativos-store.js';
import { dispararJobTeste, dispararJobAgora, type JobSlug } from './proativos-minasplaca.js';
import { publicarEventoPainel } from './painel-eventos.js';
import { obterConfigDelay, salvarConfigDelay } from './delay-config.js';
import { obterPromptBruto, salvarPrompt } from './prompt-minasplaca.js';
import {
  aprovarPatch,
  criarPatchPrompt,
  listarBlocosPromptAtual,
  listarPatches,
  rejeitarPatch,
  simularPatchPrompt,
  type PatchTreinadorEntrada,
} from './modo-treinador.js';
import { listarConversasIniciadas } from './historico-minasplaca.js';
import {
  atualizarPrecoCelula,
  atualizarPrecoExtra,
  listarCategoriasPrecosPainel,
  listarExtrasPainel,
  resetarPrecosPadrao,
  salvarLotePrecos,
} from './precos-produtos-store.js';
import {
  extrairPausaDoPayloadChatwoot,
  extrairTelefoneDoPayloadChatwoot,
  reconciliarSincroniaPausas,
  sincronizarStatusIaChatwoot,
  sincronizarTelefoneRapido,
  statusIaParaPausa,
} from './chatwoot-sync.js';
import { upsertContatoDoPayloadChatwoot } from './crm-chatwoot-sync.js';

const PREFIXO_LISTA = 'debounce:lista:';
const PREFIXO_TIMER = 'debounce:timer:';

async function chamarOrquestradorTreinador(
  historico: Array<{ role: string; content: string }>,
): Promise<string> {
  if (!config.openrouterToken) {
    throw new Error('OpenRouter não configurado.');
  }
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.openrouterToken}`,
      'HTTP-Referer': 'https://iaminas.sanjaworks.com',
      'X-Title': 'Minas Placa IA',
    },
    body: JSON.stringify({
      model: config.modeloChat,
      messages: historico,
      max_tokens: 1800,
      temperature: 0.2,
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`OpenRouter erro ${res.status}: ${txt}`);
  }
  const json = (await res.json()) as any;
  return json.choices?.[0]?.message?.content?.trim() || '';
}

function autenticado(req: FastifyRequest): boolean {
  const header = req.headers['x-minasplaca-key'];
  const query = (req.query as { key?: string })?.key;
  const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  const chave = String(header ?? query ?? bearer ?? '');
  return chave.length > 0 && chave === config.adminKey;
}

function extrairTelefone(payload: Record<string, unknown>): string | null {
  return extrairTelefoneDoPayloadChatwoot(payload);
}

function extrairStatus(payload: Record<string, unknown>): string | null {
  const status = payload.status ?? payload.conversation_status;
  if (typeof status === 'string' && status.trim()) return status.toLowerCase().trim();

  const conversation = payload.conversation as Record<string, unknown> | undefined;
  if (typeof conversation?.status === 'string') {
    return conversation.status.toLowerCase().trim();
  }

  return null;
}

async function limparFilaDebounce(telefone: string): Promise<void> {
  const redis = obterRedis();
  await redis.del(`${PREFIXO_LISTA}${telefone}`, `${PREFIXO_TIMER}${telefone}`);
}

export async function rotasWebhookChatwoot(app: FastifyInstance): Promise<void> {
  /** Webhook principal — configure no Chatwoot apontando para esta URL. */
  app.post('/webhook/chatwoot', async (req, reply) => {
    if (!autenticado(req)) {
      return reply.status(401).send({
        ok: false,
        erro: 'Chave invalida (use ?key= na URL do webhook ou header x-minasplaca-key)',
      });
    }

    const payload = (req.body ?? {}) as Record<string, unknown>;
    const evento = String(payload.event ?? payload.tipo ?? 'manual').toLowerCase();

    // Espelha contato Chatwoot → card CRM (não bloqueia o fluxo de pausa)
    void upsertContatoDoPayloadChatwoot(payload).catch((err) => {
      console.error('[webhook-chatwoot] sync CRM falhou:', err);
    });

    let telefone = extrairTelefone(payload);
    let status = extrairStatus(payload);
    let pausar: boolean | null = null;
    let origemStatusIa = false;

    if (typeof payload.pausar === 'boolean') {
      pausar = payload.pausar;
      if (!telefone && typeof payload.telefone === 'string') {
        telefone = normalizarTelefone(payload.telefone);
      }
    } else {
      const pausaAttr = extrairPausaDoPayloadChatwoot(payload, evento);
      if (pausaAttr !== null) {
        pausar = pausaAttr;
        origemStatusIa = true;
      } else if (status) {
        pausar = statusImplicaPausa(status);
      }
    }

    if (!telefone) {
      return reply.status(200).send({
        ok: true,
        ignorado: true,
        motivo: 'telefone_ausente',
        evento,
        crm_sync: true,
      });
    }

    try {
      validarTelefone(telefone);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ ok: false, erro: msg });
    }

    if (pausar === null) {
      return reply.status(200).send({
        ok: true,
        ignorado: true,
        motivo: 'evento_sem_acao_pausa',
        telefone,
        evento,
        status: status ?? null,
      });
    }

    const motivoPausa = origemStatusIa
      ? (pausar ? 'status_ia=ia_desligada no Atendimento' : 'status_ia=ia_ligada no Atendimento')
      : (pausar ? 'Atendimento humano ativo' : 'Conversa encerrada no Atendimento');

    const estado = await definirPausa(telefone, pausar, {
      status: status ?? undefined,
      motivo: motivoPausa,
      origem: `chatwoot:${evento}`,
    });

    // Responde rápido; tarefas secundárias em background
    if (pausar) {
      void cancelarFollowup(telefone).catch(() => {});
      void limparFilaDebounce(telefone);
    }

    if (!origemStatusIa) {
      void sincronizarStatusIaChatwoot(telefone, pausar).catch((err) => {
        console.error('[webhook-chatwoot] Falha sync status_ia:', err);
      });
    }

    return reply.status(200).send({
      ok: true,
      acao: pausar ? 'pausada' : 'religada',
      telefone,
      status: status ?? null,
      evento,
      estado,
    });
  });

  /** API manual para pausar/religar (testes, n8n, scripts). */
  app.post('/api/ia/pausa', async (req, reply) => {
    if (!autenticado(req)) {
      return reply.status(401).send({ ok: false, erro: 'Chave invalida' });
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const telefoneRaw = String(body.telefone ?? body.phone ?? '');
    let pausar: boolean | null = null;

    if (typeof body.pausar === 'boolean') {
      pausar = body.pausar;
    } else if (body.ia_desligada !== undefined) {
      pausar = body.ia_desligada === true || body.ia_desligada === 'true' || body.ia_desligada === 1;
    } else if (typeof body.status_ia === 'string') {
      pausar = statusIaParaPausa(body.status_ia);
    } else if (typeof body.status === 'string') {
      pausar = statusImplicaPausa(body.status);
    }

    if (!telefoneRaw) {
      return reply.status(400).send({ ok: false, erro: 'Campo telefone obrigatorio' });
    }
    if (pausar === null) {
      return reply.status(400).send({
        ok: false,
        erro: 'Informe pausar (true/false) ou status (open/resolved/...)',
      });
    }

    try {
      const telefone = validarTelefone(telefoneRaw);
      const estado = await definirPausa(telefone, pausar, {
        status: typeof body.status === 'string' ? body.status : undefined,
        origem: 'api',
      });
      if (pausar) {
        await cancelarFollowup(telefone).catch(() => {});
        await limparFilaDebounce(telefone);
      }
      sincronizarStatusIaChatwoot(telefone, pausar).catch((err) => {
        console.error('[api/ia/pausa] Falha sync status_ia:', err);
      });
      return { ok: true, acao: pausar ? 'pausada' : 'religada', telefone, estado };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ ok: false, erro: msg });
    }
  });

  /** Consulta se a IA esta pausada para um telefone. */
  app.get('/api/ia/pausa/:telefone', async (req, reply) => {
    if (!autenticado(req)) {
      return reply.status(401).send({ ok: false, erro: 'Chave invalida' });
    }
    const { telefone } = req.params as { telefone: string };
    try {
      const estado = await obterEstadoPausa(telefone);
      return { ok: true, estado };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ ok: false, erro: msg });
    }
  });

  /** Estado da pausa global (leitura publica para o painel exibir). */
  app.get('/api/ia/pausa-global', async () => {
    const estado = await obterEstadoPausaGlobal();
    const whatsappConectado = await whatsappConectadoParaIa();
    return {
      ok: true,
      estado,
      whatsapp_conectado: whatsappConectado,
      ia_efetiva_ativa: whatsappConectado && estado.pausada !== true,
    };
  });

  /** Ativa/desativa a pausa global (pausa a IA para TODOS os contatos). Usado pelo painel. */
  app.post('/api/ia/pausa-global', async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (typeof body.pausar !== 'boolean') {
      return reply.status(400).send({ ok: false, erro: 'Campo pausar (true/false) obrigatorio' });
    }
    try {
      const estado = await definirPausaGlobal(body.pausar, {
        motivo: typeof body.motivo === 'string' ? body.motivo : 'Alterado pelo painel',
        origem: 'painel',
      });
      return { ok: true, acao: body.pausar ? 'pausada' : 'religada', estado };
    } catch (err) {
      if (err instanceof IaBloqueadaPorWhatsappError) {
        return reply.status(409).send({ ok: false, erro: err.message });
      }
      throw err;
    }
  });

  /** Pausa/religa a IA para um contato especifico. Usado pelo painel. */
  app.post('/api/ia/pausa-contato', async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const telefoneRaw = String(body.telefone ?? body.phone ?? '');
    if (!telefoneRaw) {
      return reply.status(400).send({ ok: false, erro: 'Campo telefone obrigatorio' });
    }
    if (typeof body.pausar !== 'boolean') {
      return reply.status(400).send({ ok: false, erro: 'Campo pausar (true/false) obrigatorio' });
    }
    try {
      const telefone = validarTelefone(telefoneRaw);
      const estado = await definirPausa(telefone, body.pausar, {
        motivo: typeof body.motivo === 'string' ? body.motivo : 'Alterado pelo painel',
        origem: 'painel',
      });
      if (body.pausar) {
        await cancelarFollowup(telefone).catch(() => {});
        await limparFilaDebounce(telefone);
      }
      const sync = await sincronizarStatusIaChatwoot(telefone, body.pausar);
      return { ok: true, acao: body.pausar ? 'pausada' : 'religada', telefone, estado, chatwoot: sync };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const code = err instanceof IaBloqueadaPorWhatsappError ? 409 : 400;
      return reply.status(code).send({ ok: false, erro: msg });
    }
  });

  /** Consulta pausa de um contato (painel). */
  app.get('/api/ia/pausa-contato/:telefone', async (req, reply) => {
    const { telefone } = req.params as { telefone: string };
    try {
      const estado = await obterEstadoPausa(telefone);
      return { ok: true, estado };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ ok: false, erro: msg });
    }
  });

  /** Sync rápido Chatwoot → Redis para um telefone (painel, <300ms). */
  app.get('/api/ia/pausa-sync/:telefone', async (req, reply) => {
    const { telefone } = req.params as { telefone: string };
    try {
      const resultado = await sincronizarTelefoneRapido(telefone);
      return resultado;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ ok: false, erro: msg });
    }
  });

  /** Lista contatos com pausa ativa. Usado pelo painel. */
  app.get('/api/ia/pausas-ativas', async () => {
    const pausas = await listarPausasAtivas();
    return { ok: true, total: pausas.length, pausas };
  });

  /** Lista conversas com histórico recente e estado de pausa por contato. */
  app.get('/api/ia/conversas-iniciadas', async (req) => {
    const q = (req.query ?? {}) as { dias?: string };
    const dias = Math.min(365, Math.max(1, Number(q.dias ?? 90)));
    const conversas = await listarConversasIniciadas(dias);
    const pausadas = conversas.filter((c) => c.pausada).length;
    return { ok: true, total: conversas.length, pausadas, ativas: conversas.length - pausadas, conversas };
  });

  /** Pausa ou religa vários contatos (sem pausa global). */
  app.post('/api/ia/pausa-contato/lote', async (req, reply) => {
    const body = (req.body ?? {}) as { telefones?: string[]; pausar?: boolean };
    if (typeof body.pausar !== 'boolean') {
      return reply.status(400).send({ ok: false, erro: 'Campo pausar (boolean) obrigatório.' });
    }
    const telefones = Array.isArray(body.telefones) ? body.telefones : [];
    if (!telefones.length) {
      return reply.status(400).send({ ok: false, erro: 'Informe ao menos um telefone.' });
    }
    const resultado = await pausarContatosEmLote(telefones, body.pausar, { origem: 'painel-lote' });
    for (const est of resultado.resultados) {
      if (body.pausar) {
        void cancelarFollowup(est.telefone).catch(() => {});
        void limparFilaDebounce(est.telefone);
      }
      void sincronizarStatusIaChatwoot(est.telefone, body.pausar).catch(() => {});
    }
    return resultado;
  });

  /** Pausa todas as conversas com histórico recente (sem pausa global). */
  app.post('/api/ia/pausa-contato/pausar-todas', async (_req) => {
    const body = (_req.body ?? {}) as { dias?: number };
    const dias = body.dias ?? 90;
    const resultado = await pausarTodasConversasIniciadas(dias);
    for (const est of resultado.resultados) {
      void cancelarFollowup(est.telefone).catch(() => {});
      void limparFilaDebounce(est.telefone);
      void sincronizarStatusIaChatwoot(est.telefone, true).catch(() => {});
    }
    return resultado;
  });

  /** Reconcilia pausas Redis <-> status_ia Chatwoot (retroativo). */
  app.post('/api/ia/sincronizar-pausas', async (req) => {
    const body = (req.body ?? {}) as { telefone?: string; telefones?: string[] };
    const extras: string[] = [];
    if (typeof body.telefone === 'string' && body.telefone.trim()) {
      extras.push(body.telefone.trim());
    }
    if (Array.isArray(body.telefones)) {
      for (const t of body.telefones) {
        if (typeof t === 'string' && t.trim()) extras.push(t.trim());
      }
    }
    const resultado = await reconciliarSincroniaPausas(extras);
    return { ...resultado, sincronizado_em: new Date().toISOString() };
  });

  app.get('/api/ia/sincronizar-pausas', async (req) => {
    const q = (req.query as { telefone?: string }) ?? {};
    const extras = q.telefone ? [q.telefone] : [];
    const resultado = await reconciliarSincroniaPausas(extras);
    return { ...resultado, sincronizado_em: new Date().toISOString() };
  });

  /** Historico de eventos de pausa (auditoria). Usado pelo painel. */
  app.get('/api/ia/logs', async (req, reply) => {
    const q = (req.query as { limite?: string; telefone?: string }) ?? {};
    const logs = await obterLogsPausa(q.limite ? Number(q.limite) : 100, q.telefone);
    return { ok: true, total: logs.length, logs };
  });

  // -------------------------------------------------------------------------
  // Notificacao de intervencao humana (config + logs). Usado pelo painel.
  // -------------------------------------------------------------------------

  /** Le a configuracao atual (telefone destino, mensagem modelo, ativo). */
  app.get('/api/ia/notificacao', async () => {
    const config = await obterConfigNotificacao();
    return { ok: true, config };
  });

  /** Salva a configuracao da notificacao de intervencao humana. */
  app.post('/api/ia/notificacao', async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const dados: { telefone_destino?: string | null; mensagem_modelo?: string; ativo?: boolean } = {};

    if ('telefone_destino' in body) {
      dados.telefone_destino = body.telefone_destino ? String(body.telefone_destino) : null;
    }
    if (typeof body.mensagem_modelo === 'string') {
      dados.mensagem_modelo = body.mensagem_modelo;
    }
    if (typeof body.ativo === 'boolean') {
      dados.ativo = body.ativo;
    }

    const config = await salvarConfigNotificacao(dados);
    return { ok: true, config };
  });

  /** Envia uma notificacao de teste para o telefone de destino configurado. */
  app.post('/api/ia/notificacao/teste', async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const telefoneCliente = String(body.telefone ?? '5531900000000');
    const resultado = await notificarIntervencaoHumana({
      telefoneCliente,
      nomeCliente: String(body.nome ?? 'Cliente de Teste'),
      motivo: String(body.motivo ?? 'Teste de notificação pelo painel'),
    });
    if (!resultado.enviado) {
      return reply.status(400).send({ ok: false, erro: resultado.motivo });
    }
    return { ok: true, resultado };
  });

  /** Historico de notificacoes de intervencao humana. */
  app.get('/api/ia/notificacao/logs', async (req) => {
    const q = (req.query as { limite?: string }) ?? {};
    const logs = await obterLogsNotificacao(q.limite ? Number(q.limite) : 50);
    return { ok: true, total: logs.length, logs };
  });

  // -------------------------------------------------------------------------
  // Configuracao do follow-up (ativo, minutos, instrucoes). Usado pelo painel.
  // -------------------------------------------------------------------------

  /** Le a configuracao atual do follow-up. */
  app.get('/api/ia/followup', async () => {
    const config = await obterConfigFollowup();
    return { ok: true, config };
  });

  /** Salva a configuracao do follow-up. */
  app.post('/api/ia/followup', async (req) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const dados: { ativo?: boolean; minutos?: number; instrucoes?: string } = {};
    if (typeof body.ativo === 'boolean') dados.ativo = body.ativo;
    if (body.minutos !== undefined && body.minutos !== null && String(body.minutos).trim() !== '') {
      dados.minutos = Number(body.minutos);
    }
    if (typeof body.instrucoes === 'string') dados.instrucoes = body.instrucoes;
    const config = await salvarConfigFollowup(dados);
    return { ok: true, config };
  });

  // -------------------------------------------------------------------------
  // Delay aleatorio entre respostas (min/max em segundos). Usado pelo painel.
  // -------------------------------------------------------------------------

  app.get('/api/ia/delay', async () => {
    const config = await obterConfigDelay();
    return { ok: true, config };
  });

  app.post('/api/ia/delay', async (req) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const dados: { delay_min_seg?: number; delay_max_seg?: number } = {};
    if (body.delay_min_seg !== undefined && body.delay_min_seg !== null && String(body.delay_min_seg).trim() !== '') {
      dados.delay_min_seg = Number(body.delay_min_seg);
    }
    if (body.delay_max_seg !== undefined && body.delay_max_seg !== null && String(body.delay_max_seg).trim() !== '') {
      dados.delay_max_seg = Number(body.delay_max_seg);
    }
    const config = await salvarConfigDelay(dados);
    return { ok: true, config };
  });

  // -------------------------------------------------------------------------
  // Prompt do sistema (instruções da IA). Usado pelo painel.
  // -------------------------------------------------------------------------

  app.get('/api/ia/prompt', async () => {
    const prompt = await obterPromptBruto();
    return { ok: true, prompt, tamanho: prompt.length };
  });

  app.post('/api/ia/prompt', async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (typeof body.prompt !== 'string') {
      return reply.status(400).send({ ok: false, erro: 'Campo prompt é obrigatório.' });
    }
    const prompt = body.prompt.trim();
    if (!prompt) {
      return reply.status(400).send({ ok: false, erro: 'O prompt não pode ficar vazio.' });
    }
    await salvarPrompt(prompt);
    return { ok: true, tamanho: prompt.length, salvo_em: new Date().toISOString() };
  });

  // -------------------------------------------------------------------------
  // Modo treinador (patches estruturados do prompt). Usado pelo painel.
  // -------------------------------------------------------------------------

  app.get('/api/treinador/patches', async (req, reply) => {
    const q = (req.query as { status?: string }) ?? {};
    const status =
      q.status && ['pendente', 'aprovado', 'rejeitado'].includes(q.status)
        ? (q.status as 'pendente' | 'aprovado' | 'rejeitado')
        : undefined;
    const patches = await listarPatches(status);
    return { ok: true, patches };
  });

  app.get('/api/treinador/blocos', async () => {
    const blocos = await listarBlocosPromptAtual();
    return {
      ok: true,
      blocos: blocos.map((b) => ({
        nome: b.nome,
        resumo: b.texto.slice(0, 220),
      })),
    };
  });

  app.post('/api/treinador/patches', async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const entrada: PatchTreinadorEntrada = {
      bloco: String(body.bloco || 'GERAL'),
      operacao: (body.operacao as PatchTreinadorEntrada['operacao']) ?? 'replace_trecho',
      trechoAlvo: typeof body.trecho_alvo === 'string' ? body.trecho_alvo : null,
      textoProposto: String(body.texto_proposto || ''),
      resumo: String(body.resumo || ''),
      autor: String(body.autor || config.adminEmail || 'admin'),
      origem: String(body.origem || 'painel'),
    };
    try {
      const patch = await criarPatchPrompt(entrada);
      return { ok: true, patch };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ ok: false, erro: msg });
    }
  });

  app.post('/api/treinador/patches/:id/aprovar', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as Record<string, unknown>;
    const usuario = String(body.usuario || config.adminEmail || 'admin');
    try {
      const patch = await aprovarPatch(Number(id), usuario);
      return { ok: true, patch };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ ok: false, erro: msg });
    }
  });

  app.post('/api/treinador/patches/:id/rejeitar', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as Record<string, unknown>;
    const usuario = String(body.usuario || config.adminEmail || 'admin');
    try {
      const patch = await rejeitarPatch(Number(id), usuario);
      return { ok: true, patch };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ ok: false, erro: msg });
    }
  });

  app.post('/api/treinador/orquestrador', async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const mensagem = String(body.mensagem || '').trim();
    const historico = Array.isArray(body.historico) ? body.historico : [];
    const modo = body.modo === 'sugerir' ? 'sugerir' : 'criar';
    if (!mensagem) {
      return reply.status(400).send({ ok: false, erro: 'Campo mensagem é obrigatório.' });
    }

    try {
      const promptAtual = await obterPromptBruto();
      const blocos = await listarBlocosPromptAtual();
      const resumoBlocos = blocos
        .map((b) => `- ${b.nome}: ${b.texto.slice(0, 500)}`)
        .join('\n\n');

      const mensagens = [
        {
          role: 'system' as const,
          content:
            'Você é o orquestrador do modo treinador da Minas Placa. Fale de forma informal, natural e prestativa, como um copiloto técnico experiente. ' +
            'Seu modo padrão é livre: trabalhe no prompt inteiro, sem depender de blocos, e use blocos apenas como contexto opcional quando ajudarem. ' +
            'Localize semanticamente o trecho que precisa mudar. Se o pedido estiver claro, responda SOMENTE JSON com este formato: ' +
            '{"acao":"propor_patch","modo_alvo":"livre|bloco","bloco":"PROMPT LIVRE ou NOME_DO_BLOCO","operacao":"replace_trecho|append_bloco|prepend_bloco","trecho_alvo":"...","texto_proposto":"...","resumo":"...","mensagem_usuario":"..."} ' +
            'Prefira "modo_alvo":"livre". Só use "bloco" quando o usuário realmente pedir um bloco específico e ele existir. ' +
            'Se ainda faltar contexto, responda em texto normal pedindo esclarecimentos. Nunca invente estrutura que não existe. Não seja robótico. ' +
            'Prompt atual completo:\n\n' +
            promptAtual +
            '\n\nBlocos detectados:\n' +
            resumoBlocos,
        },
        ...historico
          .filter((item) => item && typeof item === 'object')
          .map((item) => {
            const it = item as Record<string, unknown>;
            return {
              role: it.role === 'assistant' ? 'assistant' : 'user',
              content: String(it.content || ''),
            };
          }),
        { role: 'user' as const, content: mensagem },
      ];

      const resposta = await chamarOrquestradorTreinador(mensagens);
      const match = resposta.match(/\{[\s\S]*\}/);
      if (!match) {
        return { ok: true, mensagem: resposta || 'Pode me dizer qual trecho você quer alterar?' };
      }

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        return { ok: true, mensagem: resposta || 'Pode me dizer qual trecho você quer alterar?' };
      }

      if (parsed.acao !== 'propor_patch') {
        return { ok: true, mensagem: resposta || 'Pode me dizer qual trecho você quer alterar?' };
      }

      const entrada: PatchTreinadorEntrada = {
        bloco: String(parsed.bloco || 'PROMPT LIVRE'),
        modoAlvo: parsed.modo_alvo === 'bloco' ? 'bloco' : 'livre',
        operacao: (parsed.operacao as PatchTreinadorEntrada['operacao']) || 'replace_trecho',
        trechoAlvo: typeof parsed.trecho_alvo === 'string' ? parsed.trecho_alvo : null,
        textoProposto: String(parsed.texto_proposto || ''),
        resumo: String(parsed.resumo || 'Patch sugerido pelo orquestrador'),
        autor: String(body.autor || config.adminEmail || 'admin'),
        origem: 'ai_magic',
      };
      const patch = modo === 'sugerir'
        ? await simularPatchPrompt(entrada)
        : await criarPatchPrompt(entrada);
      const msg =
        typeof parsed.mensagem_usuario === 'string' && parsed.mensagem_usuario.trim()
          ? parsed.mensagem_usuario.trim()
          : modo === 'sugerir'
            ? `Montei uma sugestão em modo ${patch.modo_alvo || 'livre'} para revisar antes de criar o patch real.`
            : `Criei a proposta de patch #${'id' in patch ? patch.id : '?'} em modo ${patch.modo_alvo || 'livre'}. Revise e aprove se estiver correta.`;
      return { ok: true, mensagem: msg, patch };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ ok: false, erro: msg });
    }
  });

  app.get('/api/ia/proativos', async () => {
    const config = await obterConfigProativos();
    return { ok: true, config };
  });

  app.post('/api/ia/proativos', async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (!Array.isArray(body.abordagens)) {
      return reply.status(400).send({ ok: false, erro: 'Campo abordagens é obrigatório.' });
    }
    try {
      const config = await salvarConfigProativos({ abordagens: body.abordagens as never[] });
      return { ok: true, config };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ ok: false, erro: msg });
    }
  });

  app.get('/api/ia/proativos/logs', async (req) => {
    const q = (req.query ?? {}) as { limite?: string };
    const limite = Math.min(200, Math.max(1, Number(q.limite ?? 50)));
    const logs = await listarLogsDisparos(limite);
    return { ok: true, logs };
  });

  app.post('/api/ia/proativos/toggle', async (req, reply) => {
    const body = (req.body ?? {}) as { habilitado?: boolean };
    if (typeof body.habilitado !== 'boolean') {
      return reply.status(400).send({ ok: false, erro: 'Campo habilitado (boolean) é obrigatório.' });
    }
    try {
      const config = await alternarDisparosProativos(body.habilitado);
      await publicarEventoPainel({
        tipo: 'proativos_toggle',
        habilitado: config.disparos_habilitados,
        atualizado_em: config.atualizado_em,
      });
      return { ok: true, config };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ ok: false, erro: msg });
    }
  });

  app.post('/api/ia/proativos/teste', async (req, reply) => {
    const body = (req.body ?? {}) as { slug?: string; telefone?: string };
    const slug = String(body.slug || '') as JobSlug;
    const slugsValidos = ['boleto-a-vencer', 'envia-rastreamento', 'cobranca-vencidos', 'pesquisa-pos-venda'];
    if (!slugsValidos.includes(slug)) {
      return reply.status(400).send({ ok: false, erro: 'slug inválido' });
    }
    const resultado = await dispararJobTeste(slug, body.telefone);
    if (!resultado.ok) {
      return reply.status(400).send({ ok: false, erro: resultado.erro });
    }
    return { ok: true };
  });

  /** Força o job agora (produção), com delay alto e guarda anti-acúmulo. */
  app.post('/api/ia/proativos/rodar', async (req, reply) => {
    const body = (req.body ?? {}) as { slug?: string };
    const slug = String(body.slug || '') as JobSlug;
    const slugsValidos = ['boleto-a-vencer', 'envia-rastreamento', 'cobranca-vencidos', 'pesquisa-pos-venda'];
    if (!slugsValidos.includes(slug)) {
      return reply.status(400).send({ ok: false, erro: 'slug inválido' });
    }
    const resultado = await dispararJobAgora(slug);
    if (!resultado.ok) {
      return reply.status(400).send({ ok: false, erro: resultado.erro });
    }
    return { ok: true, slug };
  });

  app.get('/api/ia/precos', async () => {
    const categorias = (await listarCategoriasPrecosPainel()).map((cat) => ({
      ...cat,
      faixas: cat.faixas.map((f) => ({
        ...f,
        max: Number.isFinite(f.max) ? f.max : 2_147_483_647,
      })),
    }));
    const extras = await listarExtrasPainel();
    return { ok: true, categorias, extras };
  });

  app.patch('/api/ia/precos/celula', async (req, reply) => {
    const body = (req.body ?? {}) as {
      categoria?: string;
      qtd_min?: number;
      qtd_max?: number;
      tamanho?: string;
      preco?: number;
    };
    if (!body.categoria || !body.tamanho || body.preco == null) {
      return reply.status(400).send({ ok: false, erro: 'categoria, tamanho e preco obrigatórios' });
    }
    if (body.qtd_min == null || body.qtd_max == null) {
      return reply.status(400).send({ ok: false, erro: 'qtd_min e qtd_max obrigatórios' });
    }
    const preco = Number(body.preco);
    if (!Number.isFinite(preco) || preco < 0) {
      return reply.status(400).send({ ok: false, erro: 'preco inválido' });
    }
    await atualizarPrecoCelula({
      categoria: body.categoria,
      qtd_min: Number(body.qtd_min),
      qtd_max: Number(body.qtd_max),
      tamanho: body.tamanho,
      preco,
    });
    return { ok: true };
  });

  app.patch('/api/ia/precos/extra', async (req, reply) => {
    const body = (req.body ?? {}) as { chave?: string; valor?: number };
    if (!body.chave || body.valor == null) {
      return reply.status(400).send({ ok: false, erro: 'chave e valor obrigatórios' });
    }
    const valor = Number(body.valor);
    if (!Number.isFinite(valor) || valor < 0) {
      return reply.status(400).send({ ok: false, erro: 'valor inválido' });
    }
    await atualizarPrecoExtra(body.chave, valor);
    return { ok: true };
  });

  app.put('/api/ia/precos/lote', async (req, reply) => {
    const body = (req.body ?? {}) as {
      linhas?: Array<{
        categoria: string;
        qtd_min: number;
        qtd_max: number;
        tamanho: string;
        preco: number;
      }>;
    };
    const linhas = Array.isArray(body.linhas) ? body.linhas : [];
    if (!linhas.length) {
      return reply.status(400).send({ ok: false, erro: 'Informe ao menos uma linha' });
    }
    await salvarLotePrecos(linhas);
    return { ok: true, total: linhas.length };
  });

  app.post('/api/ia/precos/reset', async (req, reply) => {
    const body = (req.body ?? {}) as { confirmar?: boolean };
    if (body.confirmar !== true) {
      return reply.status(400).send({ ok: false, erro: 'Envie confirmar: true' });
    }
    await resetarPrecosPadrao();
    const categorias = (await listarCategoriasPrecosPainel()).map((cat) => ({
      ...cat,
      faixas: cat.faixas.map((f) => ({
        ...f,
        max: Number.isFinite(f.max) ? f.max : 2_147_483_647,
      })),
    }));
    const extras = await listarExtrasPainel();
    return { ok: true, categorias, extras };
  });
}
