/**
 * Rotas de CRUD de usuarios do painel.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { obterUsuarioDaSessao } from './auth-minasplaca.js';
import {
  abasDisponiveisApp,
  alterarSenhaUsuario,
  atualizarUsuario,
  criarUsuario,
  excluirUsuario,
  listarUsuarios,
  obterUsuarioPorId,
  paraPublico,
  type RolePainel,
} from './usuarios-store.js';
import {
  atualizarUsuarioChatwoot,
  criarUsuarioChatwoot,
  senhaAtendePoliticaChatwoot,
} from './chatwoot-usuarios.js';

async function exigirAdmin(req: FastifyRequest, reply: FastifyReply) {
  const u = await obterUsuarioDaSessao(req);
  if (!u) {
    reply.code(401).send({ ok: false, erro: 'Nao autenticado' });
    return null;
  }
  if (u.role !== 'admin') {
    reply.code(403).send({ ok: false, erro: 'Apenas administradores' });
    return null;
  }
  return u;
}

export async function rotasUsuariosPainel(app: FastifyInstance): Promise<void> {
  app.get('/api/ia/usuarios/abas', async () => {
    return { ok: true, abas: [...abasDisponiveisApp()] };
  });

  app.get('/api/ia/usuarios', async (req, reply) => {
    if (!(await exigirAdmin(req, reply))) return;
    const usuarios = await listarUsuarios();
    return { ok: true, usuarios };
  });

  app.post('/api/ia/usuarios', async (req, reply) => {
    const admin = await exigirAdmin(req, reply);
    if (!admin) return;

    const body = (req.body ?? {}) as {
      email?: string;
      nome?: string;
      senha?: string;
      role?: RolePainel;
      abas?: string[];
      criar_chatwoot?: boolean;
    };

    const email = String(body.email || '').trim();
    const nome = String(body.nome || '').trim();
    const senha = String(body.senha || '');
    if (!email || !nome || !senha) {
      return reply.code(400).send({ ok: false, erro: 'nome, email e senha obrigatorios' });
    }

    let chatwootUserId: number | null = null;
    let chatwootSync: { ok: boolean; motivo?: string } | null = null;
    const criarCw = body.criar_chatwoot !== false;

    if (criarCw) {
      if (!senhaAtendePoliticaChatwoot(senha)) {
        return reply.code(400).send({
          ok: false,
          erro:
            'Para criar no Atendimento, a senha precisa ter maiuscula, minuscula, numero e caractere especial (min. 8).',
        });
      }
      const cw = await criarUsuarioChatwoot({
        nome,
        email,
        senha,
        roleConta: body.role === 'admin' ? 'administrator' : 'agent',
      });
      chatwootSync = { ok: cw.ok, motivo: cw.motivo };
      if (cw.ok && cw.userId) chatwootUserId = cw.userId;
    }

    try {
      const usuario = await criarUsuario({
        email,
        nome,
        senha,
        role: body.role === 'admin' ? 'admin' : 'agente',
        abas: body.abas,
        chatwoot_user_id: chatwootUserId,
      });
      return { ok: true, usuario, chatwoot: chatwootSync };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.code(400).send({ ok: false, erro: msg, chatwoot: chatwootSync });
    }
  });

  app.patch('/api/ia/usuarios/:id', async (req, reply) => {
    const admin = await exigirAdmin(req, reply);
    if (!admin) return;
    const { id } = req.params as { id: string };
    const userId = Number(id);
    if (!userId) return reply.code(400).send({ ok: false, erro: 'id invalido' });

    const body = (req.body ?? {}) as {
      nome?: string;
      role?: RolePainel;
      abas?: string[];
      ativo?: boolean;
      senha?: string;
      sync_chatwoot?: boolean;
    };

    const antes = await obterUsuarioPorId(userId);
    if (!antes) return reply.code(404).send({ ok: false, erro: 'Usuario nao encontrado' });

    try {
      const usuario = await atualizarUsuario(userId, {
        nome: body.nome,
        role: body.role,
        abas: body.abas,
        ativo: body.ativo,
        senha: body.senha,
      });

      let chatwoot: { ok: boolean; motivo?: string } | null = null;
      if (body.sync_chatwoot !== false && (body.nome || body.senha) && usuario.chatwoot_user_id) {
        chatwoot = await atualizarUsuarioChatwoot(usuario.chatwoot_user_id, {
          nome: body.nome,
          senha: body.senha,
        });
      }

      return { ok: true, usuario, chatwoot };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.code(400).send({ ok: false, erro: msg });
    }
  });

  app.delete('/api/ia/usuarios/:id', async (req, reply) => {
    const admin = await exigirAdmin(req, reply);
    if (!admin) return;
    const { id } = req.params as { id: string };
    const userId = Number(id);
    try {
      await excluirUsuario(userId, admin.id);
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.code(400).send({ ok: false, erro: msg });
    }
  });
}

export { alterarSenhaUsuario, paraPublico };
