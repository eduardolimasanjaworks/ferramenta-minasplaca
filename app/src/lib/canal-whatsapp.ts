/**
 * Fachada unica WhatsApp do iaminas.
 * Escolhe UazAPI ou Evolution via WHATSAPP_PROVIDER — um canal ativo por vez.
 */
import { config } from '../config.js';
import { dividirResposta, normalizarRespostaWhatsapp } from './mensagem.js';
import { obterDelayAleatorioMs } from '../delay-config.js';
import {
  desconectarInstancia as evoDesconectar,
  enviarTextoSimples as evoTexto,
  obterInfoInstancia as evoInfo,
  obterStatusConexao as evoStatus,
  reiniciarInstancia as evoReiniciar,
  type InfoInstanciaWhatsapp,
} from './evolution.js';
import {
  uazConnect,
  uazConfigurarWebhook,
  uazDisconnect,
  uazEnviarMidia,
  uazEnviarTexto,
  uazLogout,
  uazRestart,
  uazStatus,
} from './uazapi.js';

function aguardar(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function provedorWhatsapp(): 'uazapi' | 'evolution' {
  return config.whatsappProvider;
}

export function nomeInstanciaAtiva(): string {
  return config.whatsappInstance;
}

export async function obterStatusConexaoAtivo(): Promise<{ conectado: boolean; state?: string }> {
  if (provedorWhatsapp() === 'uazapi') {
    const s = await uazStatus();
    return { conectado: s.conectado, state: s.state };
  }
  return evoStatus(config.evolutionInstance);
}

export async function obterInfoInstanciaAtiva(): Promise<InfoInstanciaWhatsapp & { provider: string }> {
  if (provedorWhatsapp() === 'uazapi') {
    const s = await uazStatus();
    return {
      instanceName: s.instanceName,
      connected: s.conectado,
      state: s.state,
      telefone: s.telefone ?? null,
      profileName: s.profileName ?? null,
      profilePicUrl: s.profilePicUrl ?? null,
      integration: 'UAZAPI',
      chatwoot: null,
      atualizadoEm: null,
      provider: 'uazapi',
    };
  }
  const info = await evoInfo();
  return { ...info, provider: 'evolution' };
}

export async function desconectarAtivo(): Promise<{ ok: boolean; state?: string }> {
  if (provedorWhatsapp() === 'uazapi') {
    await uazLogout().catch(() => uazDisconnect());
    const s = await uazStatus().catch(() => ({ state: 'disconnected' as string }));
    return { ok: true, state: s.state };
  }
  return evoDesconectar();
}

export async function reiniciarAtivo(): Promise<{ ok: boolean; state?: string }> {
  if (provedorWhatsapp() === 'uazapi') {
    await uazRestart();
    await aguardar(1500);
    const s = await uazStatus();
    return { ok: true, state: s.state };
  }
  return evoReiniciar();
}

export async function obterQrAtivo(): Promise<{
  connected?: boolean;
  code?: string;
  pairingCode?: string | null;
  message?: string;
}> {
  if (provedorWhatsapp() === 'uazapi') {
    await uazConfigurarWebhook().catch((err) =>
      console.error('[canal-whatsapp] webhook uazapi:', err),
    );
    return uazConnect();
  }
  throw new Error('QR Evolution fica em /api/whatsapp/qr (legado)');
}

export async function enviarTextoAtivo(telefone: string, texto: string, delayMs = 1200): Promise<void> {
  if (provedorWhatsapp() === 'uazapi') {
    if (delayMs > 0) await aguardar(delayMs);
    await uazEnviarTexto(telefone, texto);
    return;
  }
  await evoTexto(config.evolutionInstance, telefone, texto, delayMs);
}

export async function enviarMidiaAtiva(opts: {
  telefone: string;
  type: 'image' | 'audio' | 'video' | 'document' | 'ptt';
  url: string;
  caption?: string;
  fileName?: string;
}): Promise<void> {
  if (provedorWhatsapp() === 'uazapi') {
    await uazEnviarMidia({
      number: opts.telefone,
      type: opts.type,
      file: opts.url,
      text: opts.caption,
      fileName: opts.fileName,
    });
    return;
  }
  const res = await fetch(
    `${config.evolutionUrl}/message/sendMedia/${config.evolutionInstance}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: config.evolutionApiKey,
      },
      body: JSON.stringify({
        number: opts.telefone,
        mediatype: opts.type === 'document' ? 'document' : opts.type,
        media: opts.url,
        fileName: opts.fileName,
        caption: opts.caption,
      }),
    },
  );
  if (!res.ok) throw new Error(`Evolution media ${res.status}: ${await res.text()}`);
}

export async function tentarEnviarRespostaAtiva(
  telefone: string,
  textoCompleto: string,
  opts?: { fragmentar?: boolean },
): Promise<{ enviado: boolean; fragmentos: number; motivo?: string; provider?: string }> {
  const status = await obterStatusConexaoAtivo();
  if (!status.conectado) {
    return { enviado: false, fragmentos: 0, motivo: 'whatsapp_desconectado', provider: provedorWhatsapp() };
  }
  try {
    const textos = opts?.fragmentar === false
      ? [normalizarRespostaWhatsapp(textoCompleto)]
      : dividirResposta(normalizarRespostaWhatsapp(textoCompleto));
    for (const texto of textos) {
      const delayMs = await obterDelayAleatorioMs();
      await enviarTextoAtivo(telefone, texto, delayMs);
    }
    return { enviado: true, fragmentos: textos.length, provider: provedorWhatsapp() };
  } catch (err) {
    return {
      enviado: false,
      fragmentos: 0,
      motivo: err instanceof Error ? err.message : String(err),
      provider: provedorWhatsapp(),
    };
  }
}
