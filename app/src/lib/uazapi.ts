/**
 * Operacoes UazAPI usadas pelo iaminas (status, QR, envio, webhook, midia).
 * Espelha docs.uazapi.com / SDK oficial — sem dependencia npm extra.
 */
import { config } from '../config.js';
import { uazFetch } from './uazapi-http.js';

export type StatusUaz = {
  conectado: boolean;
  state: string;
  telefone?: string | null;
  profileName?: string | null;
  profilePicUrl?: string | null;
  instanceName: string;
};

type StatusResp = {
  instance?: {
    name?: string;
    status?: string;
    owner?: string;
    profileName?: string;
    profilePicUrl?: string;
  };
  status?: string | { connected?: boolean; loggedIn?: boolean; jid?: string | null };
  owner?: string;
  profileName?: string;
};

function stateOk(s: string): boolean {
  const x = s.toLowerCase();
  return x === 'connected' || x === 'open';
}

function digitos(jid?: string | null): string | null {
  if (!jid) return null;
  const n = jid.replace(/@.*/, '').replace(/\D/g, '');
  return n || null;
}

export async function uazStatus(): Promise<StatusUaz> {
  const data = await uazFetch<StatusResp>('/instance/status');
  const inst = data.instance ?? {};
  const stObj = typeof data.status === 'object' && data.status ? data.status : null;
  const stateRaw = String(
    inst.status
    ?? (typeof data.status === 'string' ? data.status : undefined)
    ?? 'unknown',
  ).toLowerCase();
  const conectado =
    stateOk(stateRaw)
    || stObj?.connected === true
    || stObj?.loggedIn === true;
  return {
    conectado,
    state: conectado ? 'connected' : (stateRaw || 'disconnected'),
    telefone: digitos(inst.owner ?? data.owner),
    profileName: inst.profileName ?? data.profileName ?? null,
    profilePicUrl: inst.profilePicUrl ?? null,
    instanceName: inst.name ?? config.uazapiInstanceName,
  };
}

export async function uazConnect(phone?: string): Promise<{
  connected?: boolean;
  code?: string;
  pairingCode?: string | null;
  raw?: unknown;
}> {
  const st = await uazStatus().catch(() => null);
  if (st?.conectado) return { connected: true };

  const data = await uazFetch<Record<string, unknown>>('/instance/connect', {
    method: 'POST',
    body: phone ? { phone } : undefined,
  });

  const inst = (data.instance && typeof data.instance === 'object')
    ? (data.instance as Record<string, unknown>)
    : {};

  // free.uazapi: QR costuma vir em instance.qrcode (data:image/png;base64,...)
  const candidatos = [
    inst.qrcode,
    data.qrcode,
    data.base64,
    data.qr,
    data.code,
    inst.base64,
  ];

  let code: string | undefined;
  for (const c of candidatos) {
    if (typeof c === 'string' && c.trim()) {
      code = c.trim();
      break;
    }
    if (c && typeof c === 'object' && 'base64' in (c as object)) {
      const b = String((c as { base64?: string }).base64 ?? '').trim();
      if (b) {
        code = b;
        break;
      }
    }
  }

  const loggedIn = data.loggedIn === true || data.connected === true;
  if (loggedIn && !code) return { connected: true, raw: data };

  return {
    connected: false,
    code,
    pairingCode:
      (typeof data.pairingCode === 'string' ? data.pairingCode : null)
      ?? (typeof inst.paircode === 'string' ? inst.paircode : null)
      ?? null,
    raw: data,
  };
}

export async function uazDisconnect(): Promise<void> {
  await uazFetch('/instance/disconnect', { method: 'POST' });
}

export async function uazLogout(): Promise<void> {
  await uazFetch('/instance/logout', { method: 'POST' });
}

export async function uazRestart(): Promise<void> {
  await uazFetch('/instance/restart', { method: 'POST' });
}

/** Cria instancia (admin). Retorna token se a API enviar. */
export async function uazInitInstance(name = config.uazapiInstanceName): Promise<unknown> {
  return uazFetch('/instance/init', {
    method: 'POST',
    auth: 'admin',
    body: { name, systemName: 'iaminas-minasplaca' },
  });
}

export async function uazConfigurarWebhook(
  url = config.uazapiWebhookUrl,
): Promise<void> {
  if (!url) throw new Error('UAZAPI_WEBHOOK_URL ausente');
  await uazFetch('/webhook', {
    method: 'POST',
    body: {
      url,
      enabled: true,
      events: ['messages', 'connection', 'qrcode'],
    },
  });
}

export async function uazEnviarTexto(numero: string, texto: string): Promise<void> {
  await uazFetch('/send/text', {
    method: 'POST',
    body: { number: numero, text: texto },
  });
}

export async function uazEnviarMidia(opts: {
  number: string;
  type: 'image' | 'audio' | 'video' | 'document' | 'ptt';
  file: string;
  text?: string;
  fileName?: string;
}): Promise<void> {
  await uazFetch('/send/media', {
    method: 'POST',
    body: {
      number: opts.number,
      type: opts.type,
      file: opts.file,
      text: opts.text,
      docName: opts.fileName,
    },
  });
}

export async function uazDownloadMensagem(id: string, opts?: {
  return_base64?: boolean;
  return_link?: boolean;
  transcribe?: boolean;
}): Promise<{ base64?: string; url?: string; transcription?: string }> {
  return uazFetch('/message/download', {
    method: 'POST',
    body: {
      id,
      return_base64: opts?.return_base64 ?? true,
      return_link: opts?.return_link ?? true,
      generate_mp3: false,
      transcribe: opts?.transcribe ?? false,
      ...(opts?.transcribe && config.openaiApiKey
        ? { openai_apikey: config.openaiApiKey }
        : {}),
    },
  });
}

export async function uazPing(): Promise<boolean> {
  try {
    if (!config.uazapiToken) return false;
    await uazStatus();
    return true;
  } catch {
    return false;
  }
}
