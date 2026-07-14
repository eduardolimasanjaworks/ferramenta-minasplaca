/**
 * Sync de usuarios do painel com Chatwoot (Platform API).
 * Requer PlatformAppPermissible na account do app (Account#13 Minas / Account#12 Tilit).
 */
import { config } from './config.js';

function baseUrl(): string {
  return config.chatwootUrl.replace(/\/$/, '');
}

function platformToken(): string | null {
  return config.chatwootPlatformToken || null;
}

async function platformFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = platformToken();
  if (!token) throw new Error('chatwoot_platform_token_ausente');
  const headers = new Headers(init.headers);
  headers.set('Api-Access-Token', token);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(`${baseUrl()}${path}`, {
    ...init,
    headers,
    signal: AbortSignal.timeout(20_000),
  });
}

/** Chatwoot exige maiuscula, minuscula, numero e especial. */
export function senhaAtendePoliticaChatwoot(senha: string): boolean {
  return (
    senha.length >= 8 &&
    /[A-Z]/.test(senha) &&
    /[a-z]/.test(senha) &&
    /\d/.test(senha) &&
    /[^A-Za-z0-9]/.test(senha)
  );
}

/**
 * Cria usuario no Chatwoot (Platform) e vincula na account via account_users.
 */
export async function criarUsuarioChatwoot(dados: {
  nome: string;
  email: string;
  senha: string;
  roleConta?: 'agent' | 'administrator';
}): Promise<{ ok: boolean; userId?: number; motivo?: string }> {
  if (!platformToken()) {
    return { ok: false, motivo: 'chatwoot_platform_token_ausente' };
  }
  if (!senhaAtendePoliticaChatwoot(dados.senha)) {
    return {
      ok: false,
      motivo: 'senha_fraca_atendimento (use maiuscula, minuscula, numero e caractere especial)',
    };
  }

  const email = dados.email.trim().toLowerCase();
  const role = dados.roleConta ?? 'agent';

  try {
    const create = await platformFetch('/platform/api/v1/users', {
      method: 'POST',
      body: JSON.stringify({
        name: dados.nome,
        email,
        password: dados.senha,
      }),
    });
    const body = (await create.json().catch(() => ({}))) as {
      id?: number;
      message?: string;
      error?: string;
    };
    if (!create.ok || !body.id) {
      return {
        ok: false,
        motivo: `criar_user_http_${create.status}: ${JSON.stringify(body).slice(0, 300)}`,
      };
    }

    let lastLinkStatus = 0;
    let lastLinkDetail = '';
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (attempt > 1) await new Promise((r) => setTimeout(r, 400 * attempt));
      const link = await platformFetch(
        `/platform/api/v1/accounts/${config.chatwootAccountId}/account_users`,
        {
          method: 'POST',
          body: JSON.stringify({
            user_id: body.id,
            role,
          }),
        },
      );
      lastLinkStatus = link.status;
      if (link.ok || link.status === 422) {
        console.log(
          `[chatwoot-usuarios] user ${body.id} vinculado na account ${config.chatwootAccountId} (${role})`,
        );
        return { ok: true, userId: body.id };
      }
      lastLinkDetail = await link.text().catch(() => '');
    }

    console.error(
      '[chatwoot-usuarios] Falha ao vincular account_user:',
      lastLinkStatus,
      lastLinkDetail,
    );
    return {
      ok: false,
      userId: body.id,
      motivo: `user_criado_mas_vinculo_falhou_http_${lastLinkStatus}: ${lastLinkDetail.slice(0, 200)}`,
    };
  } catch (err) {
    return { ok: false, motivo: err instanceof Error ? err.message : String(err) };
  }
}

export async function atualizarUsuarioChatwoot(
  chatwootUserId: number,
  dados: { nome?: string; senha?: string },
): Promise<{ ok: boolean; motivo?: string }> {
  if (!platformToken()) return { ok: false, motivo: 'chatwoot_platform_token_ausente' };
  if (dados.senha && !senhaAtendePoliticaChatwoot(dados.senha)) {
    return {
      ok: false,
      motivo: 'senha_fraca_atendimento (use maiuscula, minuscula, numero e caractere especial)',
    };
  }

  const payload: Record<string, string> = {};
  if (dados.nome) payload.name = dados.nome;
  if (dados.senha) payload.password = dados.senha;
  if (!Object.keys(payload).length) return { ok: true };

  try {
    const r = await platformFetch(`/platform/api/v1/users/${chatwootUserId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      return { ok: false, motivo: `http_${r.status}: ${detail.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, motivo: err instanceof Error ? err.message : String(err) };
  }
}

export async function ssoUrlParaUsuario(chatwootUserId: number): Promise<{
  ok: boolean;
  iframeUrl?: string;
  motivo?: string;
}> {
  if (!platformToken()) return { ok: false, motivo: 'chatwoot_platform_token_ausente' };
  try {
    const r = await platformFetch(`/platform/api/v1/users/${chatwootUserId}/login`);
    const data = (await r.json()) as { url?: string };
    if (!r.ok || !data.url) {
      return { ok: false, motivo: `sso_http_${r.status}` };
    }
    const sep = data.url.includes('?') ? '&' : '?';
    return {
      ok: true,
      iframeUrl: `${data.url}${sep}sso_account_id=${config.chatwootAccountId}`,
    };
  } catch (err) {
    return { ok: false, motivo: err instanceof Error ? err.message : String(err) };
  }
}
