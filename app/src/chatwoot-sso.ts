/**
 * SSO do Chatwoot para embed no painel (Platform API).
 * Prefere chatwoot_user_id do usuario logado; fallback no SSO compartilhado.
 */
import type { FastifyInstance } from 'fastify';
import { config } from './config.js';
import { obterUsuarioDaSessao } from './auth-minasplaca.js';
import { ssoUrlParaUsuario } from './chatwoot-usuarios.js';
import { usuarioTemAba } from './usuarios-store.js';

export async function rotasChatwootSso(app: FastifyInstance) {
  app.get('/api/chatwoot/sso', async (req, reply) => {
    const usuario = await obterUsuarioDaSessao(req);
    if (!usuario) {
      return reply.status(401).send({ ok: false, erro: 'Nao autenticado' });
    }
    if (!usuarioTemAba(usuario, 'conversas')) {
      return reply.status(403).send({ ok: false, erro: 'Sem permissao para Conversas' });
    }

    const token = config.chatwootPlatformToken;
    if (!token) {
      return reply.status(503).send({ ok: false, erro: 'chatwoot_sso_nao_configurado' });
    }

    const cwUserId = usuario.chatwoot_user_id || Number(config.chatwootSsoUserId || 0);
    if (!cwUserId) {
      return reply.status(503).send({ ok: false, erro: 'chatwoot_sso_nao_configurado' });
    }

    const sso = await ssoUrlParaUsuario(cwUserId);
    if (!sso.ok || !sso.iframeUrl) {
      return reply.status(502).send({ ok: false, erro: 'sso_failed', detail: sso.motivo });
    }
    return { ok: true, iframeUrl: sso.iframeUrl };
  });
}
