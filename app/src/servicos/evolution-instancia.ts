/**
 * Operações de instância WhatsApp na Evolution API.
 */
import { config } from '../config.js';

const headers = () => ({
  'Content-Type': 'application/json',
  apikey: config.evolutionApiKey,
});

export interface StatusConexao {
  instance: string;
  state: string;
  conectado: boolean;
  motivoDesconexao?: string;
  podeEnviar: boolean;
}

interface InstanciaEvolution {
  connectionStatus?: string;
  disconnectionReasonCode?: number;
  disconnectionObject?: string;
}

/** Estado da conexão WhatsApp */
export async function obterStatusConexao(): Promise<StatusConexao> {
  const url = `${config.evolutionUrl}/instance/connectionState/${config.evolutionInstance}`;
  const res = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(15000) });
  if (res.status === 404) {
    return {
      instance: config.evolutionInstance,
      state: 'not_found',
      conectado: false,
      motivoDesconexao: 'Instância WhatsApp não criada — escaneie o QR em /whatsapp',
      podeEnviar: false,
    };
  }
  if (!res.ok) {
    const corpo = await res.text();
    throw new Error(`connectionState falhou (${res.status}): ${corpo}`);
  }
  const dados = (await res.json()) as { instance?: { state?: string } };
  const state = dados.instance?.state ?? 'desconhecido';
  const conectado = state === 'open';

  let motivoDesconexao: string | undefined;
  if (!conectado) {
    try {
      const listRes = await fetch(`${config.evolutionUrl}/instance/fetchInstances`, {
        headers: headers(),
        signal: AbortSignal.timeout(15000),
      });
      if (listRes.ok) {
        const lista = (await listRes.json()) as InstanciaEvolution[];
        const inst = lista.find((i) => (i as { name?: string }).name === config.evolutionInstance);
        if (inst?.disconnectionObject) {
          const parsed = JSON.parse(inst.disconnectionObject) as {
            error?: { data?: { attrs?: { type?: string } } };
          };
          const tipo = parsed.error?.data?.attrs?.type;
          if (tipo === 'device_removed') {
            motivoDesconexao =
              'Sessão expulsa — outro dispositivo (ex: Chatwoot) conectou no mesmo número';
          } else if (tipo) {
            motivoDesconexao = `Desconectado: ${tipo}`;
          }
        }
      }
    } catch {
      /* ignora */
    }
  }

  return {
    instance: config.evolutionInstance,
    state,
    conectado,
    motivoDesconexao,
    podeEnviar: conectado,
  };
}

export interface QrCodeResposta {
  base64: string | null;
  pairingCode: string | null;
  count?: number;
}

/** Gera ou atualiza QR code para pareamento */
export async function obterQrCode(): Promise<QrCodeResposta> {
  const url = `${config.evolutionUrl}/instance/connect/${config.evolutionInstance}`;
  const res = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(30000) });
  if (!res.ok) {
    const corpo = await res.text();
    throw new Error(`connect falhou (${res.status}): ${corpo}`);
  }
  const dados = (await res.json()) as QrCodeResposta;
  return {
    base64: dados.base64 ?? null,
    pairingCode: dados.pairingCode ?? null,
    count: dados.count,
  };
}

/** Desconecta sessão e gera novo QR */
export async function reconectar(): Promise<QrCodeResposta> {
  const logoutUrl = `${config.evolutionUrl}/instance/logout/${config.evolutionInstance}`;
  await fetch(logoutUrl, {
    method: 'DELETE',
    headers: headers(),
    signal: AbortSignal.timeout(15000),
  }).catch(() => {
    /* logout pode falhar se já desconectado */
  });
  await new Promise((r) => setTimeout(r, 1500));
  return obterQrCode();
}
