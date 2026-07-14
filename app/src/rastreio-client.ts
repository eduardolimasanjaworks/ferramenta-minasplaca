import { config } from './config.js';

export interface EventoRastreio {
  descricao?: string;
  dtEvent?: string;
  dtHrCriado?: string;
  data?: string;
}

export interface RastreioResposta {
  codigo_rastreio?: string;
  objetos?: Array<{ eventos?: EventoRastreio[] }>;
  error?: string;
  status?: number;
}

export async function consultarRastreio(codigo: string): Promise<RastreioResposta> {
  const body = new URLSearchParams({ codigo_rastreio: codigo });
  const res = await fetch(config.rastreioWebhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const txt = await res.text();
    return { error: `HTTP ${res.status}: ${txt.slice(0, 200)}`, status: res.status };
  }
  try {
    return (await res.json()) as RastreioResposta;
  } catch {
    return { error: 'Resposta inválida do webhook de rastreio' };
  }
}
