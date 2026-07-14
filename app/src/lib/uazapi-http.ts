/**
 * HTTP baixo nivel da UazAPI (uazapiGO v2).
 * Centraliza auth (token / admintoken), timeout e parse de erro.
 */
import { config } from '../config.js';

export type UazAuth = 'instance' | 'admin';

export class UazapiErro extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly corpo?: string,
  ) {
    super(message);
    this.name = 'UazapiErro';
  }
}

export async function uazFetch<T = unknown>(
  path: string,
  opts: {
    method?: string;
    body?: unknown;
    auth?: UazAuth;
    token?: string;
    timeoutMs?: number;
  } = {},
): Promise<T> {
  const base = config.uazapiBaseUrl.replace(/\/$/, '');
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  const auth = opts.auth ?? 'instance';
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  if (auth === 'admin') {
    if (!config.uazapiAdminToken) throw new UazapiErro('UAZAPI_ADMIN_TOKEN ausente');
    headers.admintoken = config.uazapiAdminToken;
  } else {
    const tok = opts.token ?? config.uazapiToken;
    if (!tok) throw new UazapiErro('UAZAPI_TOKEN ausente');
    headers.token = tok;
  }

  const res = await fetch(url, {
    method: opts.method ?? (opts.body ? 'POST' : 'GET'),
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
  });

  const txt = await res.text().catch(() => '');
  if (!res.ok) {
    throw new UazapiErro(`UazAPI ${opts.method ?? 'GET'} ${path} → ${res.status}`, res.status, txt);
  }
  if (!txt) return {} as T;
  try {
    return JSON.parse(txt) as T;
  } catch {
    return txt as unknown as T;
  }
}
