/**
 * Integracao Evolution API — Minas Placa clean.
 */
import { config } from '../config.js';
import { dividirResposta, normalizarRespostaWhatsapp } from './mensagem.js';
import { obterDelayAleatorioMs } from '../delay-config.js';

function aguardar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function obterStatusConexao(instance: string): Promise<{ conectado: boolean; state?: string }> {
  try {
    const res = await fetch(`${config.evolutionUrl}/instance/connectionState/${instance}`, {
      headers: { apikey: config.evolutionApiKey },
    });
    if (!res.ok) return { conectado: false };
    const data = await res.json() as { state?: string; instance?: { state?: string } };
    const state = String(data.instance?.state ?? data.state ?? '').toLowerCase();
    return { conectado: state === 'open' || state === 'connected', state };
  } catch {
    return { conectado: false };
  }
}

export interface InfoChatwootEvolution {
  enabled: boolean;
  accountId: string | null;
  url: string | null;
  inboxName: string | null;
}

export interface InfoInstanciaWhatsapp {
  instanceName: string;
  connected: boolean;
  state: string;
  telefone: string | null;
  profileName: string | null;
  profilePicUrl: string | null;
  integration: string | null;
  chatwoot: InfoChatwootEvolution | null;
  atualizadoEm: string | null;
}

function headersEvolution(): Record<string, string> {
  return { apikey: config.evolutionApiKey, 'Content-Type': 'application/json' };
}

function telefoneDeOwnerJid(ownerJid: string | null | undefined): string | null {
  if (!ownerJid) return null;
  const n = ownerJid.replace(/@.*/, '').replace(/\D/g, '');
  return n || null;
}

type InstanciaEvolution = {
  name?: string;
  connectionStatus?: string;
  ownerJid?: string;
  profileName?: string;
  profilePicUrl?: string;
  integration?: string;
  updatedAt?: string;
  Chatwoot?: {
    enabled?: boolean;
    accountId?: string;
    url?: string;
    nameInbox?: string;
  };
};

async function buscarInstanciaEvolution(instance: string): Promise<InstanciaEvolution | null> {
  const res = await fetch(
    `${config.evolutionUrl}/instance/fetchInstances?instanceName=${encodeURIComponent(instance)}`,
    { headers: headersEvolution() },
  );
  if (!res.ok) return null;
  const data = await res.json() as InstanciaEvolution | InstanciaEvolution[];
  if (Array.isArray(data)) return data.find((i) => i.name === instance) ?? data[0] ?? null;
  return data;
}

export async function obterInfoInstancia(instance = config.evolutionInstance): Promise<InfoInstanciaWhatsapp> {
  const status = await obterStatusConexao(instance);
  const inst = await buscarInstanciaEvolution(instance).catch(() => null);
  const state = String(inst?.connectionStatus ?? status.state ?? 'unknown').toLowerCase();
  const connected = status.conectado || state === 'open' || state === 'connected';
  const cw = inst?.Chatwoot;
  return {
    instanceName: instance,
    connected,
    state,
    telefone: telefoneDeOwnerJid(inst?.ownerJid),
    profileName: inst?.profileName ?? null,
    profilePicUrl: inst?.profilePicUrl ?? null,
    integration: inst?.integration ?? null,
    chatwoot: cw
      ? {
          enabled: cw.enabled === true,
          accountId: cw.accountId ?? null,
          url: cw.url ?? null,
          inboxName: cw.nameInbox ?? null,
        }
      : null,
    atualizadoEm: inst?.updatedAt ?? null,
  };
}

export async function desconectarInstancia(instance = config.evolutionInstance): Promise<{ ok: boolean; state?: string }> {
  const res = await fetch(`${config.evolutionUrl}/instance/logout/${instance}`, {
    method: 'DELETE',
    headers: headersEvolution(),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Evolution logout ${res.status}: ${txt}`);
  }
  const status = await obterStatusConexao(instance);
  return { ok: true, state: status.state };
}

export async function reiniciarInstancia(instance = config.evolutionInstance): Promise<{ ok: boolean; state?: string }> {
  const res = await fetch(`${config.evolutionUrl}/instance/restart/${instance}`, {
    method: 'POST',
    headers: headersEvolution(),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Evolution restart ${res.status}: ${txt}`);
  }
  await new Promise((r) => setTimeout(r, 2000));
  const status = await obterStatusConexao(instance);
  return { ok: true, state: status.state };
}

export async function enviarTextoSimples(
  instance: string,
  telefone: string,
  texto: string,
  delayMs = 1200,
): Promise<void> {
  const res = await fetch(`${config.evolutionUrl}/message/sendText/${instance}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: config.evolutionApiKey,
    },
    body: JSON.stringify({
      number: telefone,
      text: texto,
      delay: delayMs,
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Evolution erro ${res.status}: ${txt}`);
  }
}

export async function enviarRespostaFragmentada(
  instance: string,
  telefone: string,
  textoCompleto: string,
  opts?: { fragmentar?: boolean; ignorarDigitando?: boolean },
): Promise<number> {
  const textos = opts?.fragmentar === false
    ? [normalizarRespostaWhatsapp(textoCompleto)]
    : dividirResposta(normalizarRespostaWhatsapp(textoCompleto));

  for (const texto of textos) {
    const delayMs = await obterDelayAleatorioMs();
    await aguardar(delayMs);
    await enviarTextoSimples(instance, telefone, texto, delayMs);
  }
  return textos.length;
}

export async function tentarEnviarResposta(
  telefone: string,
  textoCompleto: string,
  instance: string,
  opts?: { remoteJid?: string; mensagensEntrada?: number; fragmentar?: boolean },
): Promise<{ enviado: boolean; fragmentos: number; motivo?: string }> {
  const status = await obterStatusConexao(instance);
  if (!status.conectado) {
    return { enviado: false, fragmentos: 0, motivo: 'whatsapp_desconectado' };
  }
  try {
    const fragmentos = await enviarRespostaFragmentada(instance, telefone, textoCompleto, {
      fragmentar: opts?.fragmentar,
    });
    return { enviado: true, fragmentos };
  } catch (err) {
    const motivo = err instanceof Error ? err.message : String(err);
    return { enviado: false, fragmentos: 0, motivo };
  }
}
