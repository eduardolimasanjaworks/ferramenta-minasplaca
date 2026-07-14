/**
 * Rotas REST do CRM (Kanban + contatos + campos + tags).
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { obterUsuarioDaSessao } from './auth-minasplaca.js';
import {
  abrirArquivoContato,
  atualizarCampoCatalogo,
  atualizarColuna,
  atualizarContato,
  atualizarTagCatalogo,
  criarCampoCatalogo,
  criarColuna,
  criarContato,
  criarTagCatalogo,
  CrmTelefoneDuplicadoError,
  CrmTelefoneObrigatorioError,
  definirChatwootContactId,
  listarCamposCatalogo,
  listarColunas,
  listarTagsCatalogo,
  moverContato,
  obterBoard,
  obterCadastros,
  obterContato,
  removerArquivoContato,
  removerCampoCatalogo,
  removerColuna,
  removerContato,
  removerTagCatalogo,
  reordenarColunas,
  salvarCadastros,
  uploadArquivoContato,
  type CrmCampoCatalogo,
  type CrmConfigCadastros,
  type CrmContato,
  type CrmTagCatalogo,
} from './crm-store.js';
import {
  obterUltimoSyncCrmChatwoot,
  sincronizarTodosContatosChatwoot,
} from './crm-chatwoot-sync.js';
import {
  sincronizarContatoCrmParaChatwoot,
  sincronizarLabelsChatwoot,
} from './crm-chatwoot-write.js';
import { definirPausa } from './pausa-minasplaca.js';
import { listarUsuarios } from './usuarios-store.js';

async function exigirAuth(req: FastifyRequest, reply: FastifyReply) {
  const u = await obterUsuarioDaSessao(req);
  if (!u) {
    reply.code(401).send({ ok: false, erro: 'Nao autenticado' });
    return null;
  }
  return u;
}

function erroContato(reply: FastifyReply, err: unknown) {
  if (err instanceof CrmTelefoneObrigatorioError) {
    return reply.code(400).send({
      ok: false,
      codigo: 'telefone_obrigatorio',
      erro: 'Informe o telefone do contato.',
    });
  }
  if (err instanceof CrmTelefoneDuplicadoError) {
    return reply.code(409).send({
      ok: false,
      codigo: 'telefone_duplicado',
      contatoExistenteId: err.contatoExistenteId,
      erro: 'Ja existe um contato com este telefone.',
    });
  }
  throw err;
}

export async function rotasCrm(app: FastifyInstance): Promise<void> {
  app.get('/api/crm/board', async (req, reply) => {
    if (!(await exigirAuth(req, reply))) return;
    const board = await obterBoard();
    return { ok: true, ...board };
  });

  /* Usuarios do painel (responsaveis) — qualquer autenticado */
  app.get('/api/crm/usuarios', async (req, reply) => {
    if (!(await exigirAuth(req, reply))) return;
    const usuarios = await listarUsuarios();
    return {
      ok: true,
      usuarios: usuarios.map((u) => ({ id: u.id, nome: u.nome, email: u.email })),
    };
  });

  /* Colunas */
  app.get('/api/crm/colunas', async (req, reply) => {
    if (!(await exigirAuth(req, reply))) return;
    return { ok: true, colunas: await listarColunas() };
  });

  app.post('/api/crm/colunas', async (req, reply) => {
    if (!(await exigirAuth(req, reply))) return;
    const body = (req.body ?? {}) as { titulo?: string; cor?: string };
    const coluna = await criarColuna(body);
    return { ok: true, coluna };
  });

  app.patch('/api/crm/colunas/:id', async (req, reply) => {
    if (!(await exigirAuth(req, reply))) return;
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { titulo?: string; cor?: string; ordem?: number };
    const coluna = await atualizarColuna(id, body);
    if (!coluna) return reply.code(404).send({ ok: false, erro: 'Coluna nao encontrada' });
    return { ok: true, coluna };
  });

  app.delete('/api/crm/colunas/:id', async (req, reply) => {
    if (!(await exigirAuth(req, reply))) return;
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { moverParaId?: string };
    const ok = await removerColuna(id, { moverParaId: body.moverParaId });
    if (!ok) return reply.code(404).send({ ok: false, erro: 'Coluna nao encontrada' });
    return { ok: true };
  });

  app.post('/api/crm/colunas/reordenar', async (req, reply) => {
    if (!(await exigirAuth(req, reply))) return;
    const body = (req.body ?? {}) as { origemId?: string; destinoId?: string };
    if (!body.origemId || !body.destinoId) {
      return reply.code(400).send({ ok: false, erro: 'origemId e destinoId obrigatorios' });
    }
    const colunas = await reordenarColunas(body.origemId, body.destinoId);
    return { ok: true, colunas };
  });

  /* Contatos */
  app.get('/api/crm/contatos/:id', async (req, reply) => {
    if (!(await exigirAuth(req, reply))) return;
    const { id } = req.params as { id: string };
    const contato = await obterContato(id);
    if (!contato) return reply.code(404).send({ ok: false, erro: 'Contato nao encontrado' });
    return { ok: true, contato };
  });

  app.post('/api/crm/contatos', async (req, reply) => {
    if (!(await exigirAuth(req, reply))) return;
    const body = (req.body ?? {}) as {
      colunaId?: string;
      nome?: string;
      telefone?: string;
      ddi?: string;
      email?: string;
      iaAtiva?: boolean;
    };
    if (!body.colunaId || !body.nome?.trim()) {
      return reply.code(400).send({ ok: false, erro: 'colunaId e nome obrigatorios' });
    }
    if (!body.telefone?.trim()) {
      return reply.code(400).send({
        ok: false,
        codigo: 'telefone_obrigatorio',
        erro: 'Informe o telefone do contato.',
      });
    }
    const { whatsappConectadoParaIa } = await import('./pausa-minasplaca.js');
    const waOk = await whatsappConectadoParaIa();
    const iaAtiva = waOk && body.iaAtiva !== false;
    try {
      let contato = await criarContato({
        colunaId: body.colunaId,
        nome: body.nome,
        telefone: body.telefone,
        ddi: body.ddi,
        email: body.email,
        automacaoAtiva: iaAtiva,
      });

      if (iaAtiva && contato.telefone) {
        await definirPausa(contato.telefone, false, {
          origem: 'crm',
          motivo: 'Contato criado com IA ativa',
        }).catch(() => {});
      } else if (contato.telefone) {
        await definirPausa(contato.telefone, true, {
          origem: 'crm',
          motivo: waOk ? 'Contato criado com IA pausada' : 'WhatsApp desconectado',
        }).catch(() => {});
      }

      const sync = await sincronizarContatoCrmParaChatwoot(contato, { iaAtiva });
      if (sync.chatwootContactId) {
        contato =
          (await definirChatwootContactId(contato.id, sync.chatwootContactId)) || contato;
      }

      return { ok: true, contato };
    } catch (err) {
      return erroContato(reply, err);
    }
  });

  app.patch('/api/crm/contatos/:id', async (req, reply) => {
    if (!(await exigirAuth(req, reply))) return;
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as Partial<CrmContato>;
    try {
      const antes = await obterContato(id);
      if (!antes) return reply.code(404).send({ ok: false, erro: 'Contato nao encontrado' });

      if (body.automacaoAtiva === true) {
        const { whatsappConectadoParaIa } = await import('./pausa-minasplaca.js');
        if (!(await whatsappConectadoParaIa())) {
          return reply.code(409).send({
            ok: false,
            erro: 'WhatsApp desconectado — a IA não pode ficar ativa',
          });
        }
      }

      const contato = await atualizarContato(id, body);
      if (!contato) return reply.code(404).send({ ok: false, erro: 'Contato nao encontrado' });

      if (body.automacaoAtiva !== undefined && contato.telefone) {
        const pausada = !contato.automacaoAtiva;
        await definirPausa(contato.telefone, pausada, {
          origem: 'crm',
          motivo: contato.automacaoAtiva ? 'IA ativa no CRM' : 'IA pausada no CRM',
        }).catch(() => {});
        await sincronizarContatoCrmParaChatwoot(contato, {
          iaAtiva: contato.automacaoAtiva,
        }).catch(() => {});
      }

      if (body.tags !== undefined && contato.chatwootContactId) {
        await sincronizarLabelsChatwoot(contato.chatwootContactId, contato.tags).catch(
          () => {},
        );
      }

      return { ok: true, contato };
    } catch (err) {
      return erroContato(reply, err);
    }
  });

  app.post('/api/crm/contatos/:id/mover', async (req, reply) => {
    if (!(await exigirAuth(req, reply))) return;
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { colunaId?: string };
    if (!body.colunaId) {
      return reply.code(400).send({ ok: false, erro: 'colunaId obrigatorio' });
    }
    const contato = await moverContato(id, body.colunaId);
    if (!contato) return reply.code(404).send({ ok: false, erro: 'Contato nao encontrado' });
    return { ok: true, contato };
  });

  app.delete('/api/crm/contatos/:id', async (req, reply) => {
    if (!(await exigirAuth(req, reply))) return;
    const { id } = req.params as { id: string };
    const ok = await removerContato(id);
    if (!ok) return reply.code(404).send({ ok: false, erro: 'Contato nao encontrado' });
    return { ok: true };
  });

  app.post('/api/crm/contatos/:id/arquivos', async (req, reply) => {
    if (!(await exigirAuth(req, reply))) return;
    const { id } = req.params as { id: string };
    const nomeRaw = String(req.headers['x-filename'] || 'arquivo');
    let nome = 'arquivo';
    try {
      nome = decodeURIComponent(nomeRaw);
    } catch {
      nome = nomeRaw;
    }
    const mime = String(req.headers['x-mime'] || 'application/octet-stream');
    const body = req.body;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      return reply.code(400).send({ ok: false, erro: 'Corpo binario obrigatorio' });
    }
    if (body.length > 20 * 1024 * 1024) {
      return reply.code(413).send({ ok: false, erro: 'Arquivo maior que 20MB' });
    }
    const arquivo = await uploadArquivoContato(id, { nome, mime, buffer: body });
    if (!arquivo) return reply.code(404).send({ ok: false, erro: 'Contato nao encontrado' });
    return { ok: true, arquivo };
  });

  app.get('/api/crm/contatos/:id/arquivos/:arquivoId/download', async (req, reply) => {
    if (!(await exigirAuth(req, reply))) return;
    const { id, arquivoId } = req.params as { id: string; arquivoId: string };
    const file = await abrirArquivoContato(id, arquivoId);
    if (!file) return reply.code(404).send({ ok: false, erro: 'Arquivo nao encontrado' });
    reply.header('Content-Type', file.mime);
    reply.header(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(file.nome)}`,
    );
    if (file.tamanho > 0) reply.header('Content-Length', String(file.tamanho));
    return reply.send(file.stream);
  });

  app.delete('/api/crm/contatos/:id/arquivos/:arquivoId', async (req, reply) => {
    if (!(await exigirAuth(req, reply))) return;
    const { id, arquivoId } = req.params as { id: string; arquivoId: string };
    const ok = await removerArquivoContato(id, arquivoId);
    if (!ok) return reply.code(404).send({ ok: false, erro: 'Arquivo nao encontrado' });
    return { ok: true };
  });

  /* Catálogo de campos */
  app.get('/api/crm/campos', async (req, reply) => {
    if (!(await exigirAuth(req, reply))) return;
    return { ok: true, campos: await listarCamposCatalogo() };
  });

  app.post('/api/crm/campos', async (req, reply) => {
    if (!(await exigirAuth(req, reply))) return;
    const body = (req.body ?? {}) as Omit<CrmCampoCatalogo, 'id'>;
    const campo = await criarCampoCatalogo(body);
    return { ok: true, campo };
  });

  app.patch('/api/crm/campos/:id', async (req, reply) => {
    if (!(await exigirAuth(req, reply))) return;
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as Partial<CrmCampoCatalogo>;
    const campo = await atualizarCampoCatalogo(id, body);
    if (!campo) return reply.code(404).send({ ok: false, erro: 'Campo nao encontrado' });
    return { ok: true, campo };
  });

  app.delete('/api/crm/campos/:id', async (req, reply) => {
    if (!(await exigirAuth(req, reply))) return;
    const { id } = req.params as { id: string };
    const ok = await removerCampoCatalogo(id);
    if (!ok) return reply.code(404).send({ ok: false, erro: 'Campo nao encontrado' });
    return { ok: true };
  });

  /* Catálogo de tags */
  app.get('/api/crm/tags', async (req, reply) => {
    if (!(await exigirAuth(req, reply))) return;
    return { ok: true, tags: await listarTagsCatalogo() };
  });

  app.post('/api/crm/tags', async (req, reply) => {
    if (!(await exigirAuth(req, reply))) return;
    const body = (req.body ?? {}) as { nome?: string };
    if (!body.nome?.trim()) {
      return reply.code(400).send({ ok: false, erro: 'Nome obrigatorio' });
    }
    const tag = await criarTagCatalogo(body.nome);
    return { ok: true, tag };
  });

  app.patch('/api/crm/tags/:id', async (req, reply) => {
    if (!(await exigirAuth(req, reply))) return;
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as Partial<CrmTagCatalogo>;
    const tag = await atualizarTagCatalogo(id, body);
    if (!tag) return reply.code(404).send({ ok: false, erro: 'Tag nao encontrada' });
    return { ok: true, tag };
  });

  app.delete('/api/crm/tags/:id', async (req, reply) => {
    if (!(await exigirAuth(req, reply))) return;
    const { id } = req.params as { id: string };
    const ok = await removerTagCatalogo(id);
    if (!ok) return reply.code(404).send({ ok: false, erro: 'Tag nao encontrada' });
    return { ok: true };
  });

  /* Cadastros (autor notas; responsaveis legado) */
  app.get('/api/crm/cadastros', async (req, reply) => {
    if (!(await exigirAuth(req, reply))) return;
    return { ok: true, cadastros: await obterCadastros() };
  });

  app.put('/api/crm/cadastros', async (req, reply) => {
    if (!(await exigirAuth(req, reply))) return;
    const body = (req.body ?? {}) as Partial<CrmConfigCadastros>;
    const cadastros = await salvarCadastros(body);
    return { ok: true, cadastros };
  });

  /* Sync Atendimento → CRM */
  app.get('/api/crm/sync/atendimento', async (req, reply) => {
    if (!(await exigirAuth(req, reply))) return;
    return { ok: true, ultimo: obterUltimoSyncCrmChatwoot() };
  });

  app.post('/api/crm/sync/atendimento', async (req, reply) => {
    if (!(await exigirAuth(req, reply))) return;
    const resultado = await sincronizarTodosContatosChatwoot();
    if (!resultado.ok) {
      return reply.code(502).send({ ...resultado, ok: false });
    }
    return { ...resultado, ok: true };
  });

  /* Alias legado */
  app.get('/api/crm/sync/chatwoot', async (req, reply) => {
    if (!(await exigirAuth(req, reply))) return;
    return { ok: true, ultimo: obterUltimoSyncCrmChatwoot() };
  });

  app.post('/api/crm/sync/chatwoot', async (req, reply) => {
    if (!(await exigirAuth(req, reply))) return;
    const resultado = await sincronizarTodosContatosChatwoot();
    if (!resultado.ok) {
      return reply.code(502).send({ ...resultado, ok: false });
    }
    return { ...resultado, ok: true };
  });
}
