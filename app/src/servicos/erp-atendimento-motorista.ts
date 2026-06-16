/**
 * Espelha estado de atendimento IA no ERP (cadastro_motorista).
 */
import { buscarMotoristaPorTelefone } from './motorista-gmx.js';
import { directusConfigurado, directusPatch } from './directus.js';
import { normalizarTelefone } from '../util/telefone.js';

export interface EstadoAtendimentoErp {
  ia_pausada?: boolean;
  ia_pausa_motivo?: string | null;
  precisa_atendimento?: boolean;
  precisa_atendimento_motivo?: string | null;
  ultima_intencao_whatsapp?: string | null;
  ultima_intencao_em?: string | null;
}

async function patchMotoristaPorTelefone(
  telefone: string,
  campos: EstadoAtendimentoErp,
): Promise<void> {
  if (!directusConfigurado()) return;
  const motorista = await buscarMotoristaPorTelefone(telefone);
  if (!motorista?.id) return;

  const payload: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(campos)) {
    if (v !== undefined) payload[k] = v;
  }
  if (Object.keys(payload).length === 0) return;

  await directusPatch('cadastro_motorista', motorista.id, payload).catch((err) => {
    console.warn('[erp-atendimento] Falha ao sincronizar', telefone, err);
  });
}

export async function sincronizarPausaIaErp(
  telefone: string,
  pausada: boolean,
  motivo?: string,
): Promise<void> {
  await patchMotoristaPorTelefone(telefone, {
    ia_pausada: pausada,
    ia_pausa_motivo: pausada ? motivo ?? 'pausado_painel' : null,
    ...(pausada ? { precisa_atendimento: true, precisa_atendimento_motivo: motivo ?? 'IA pausada — atendimento humano' } : {}),
  });
}

export async function registrarIntencaoWhatsapp(
  telefone: string,
  intencao: string,
  opts?: { ambiguo?: boolean; notas?: string },
): Promise<void> {
  const agora = new Date().toISOString();
  const patch: EstadoAtendimentoErp = {
    ultima_intencao_whatsapp: intencao,
    ultima_intencao_em: agora,
  };

  if (opts?.ambiguo) {
    patch.precisa_atendimento = true;
    patch.precisa_atendimento_motivo =
      opts.notas ?? `Intenção ambígua: ${intencao} — conferir conversa WhatsApp`;
  }

  await patchMotoristaPorTelefone(telefone, patch);
}

export async function marcarPrecisaAtendimentoErp(
  telefone: string,
  motivo: string,
  opts?: { pausarIa?: boolean },
): Promise<void> {
  await patchMotoristaPorTelefone(telefone, {
    precisa_atendimento: true,
    precisa_atendimento_motivo: motivo,
    ...(opts?.pausarIa
      ? { ia_pausada: true, ia_pausa_motivo: motivo }
      : {}),
  });
}

export async function limparPrecisaAtendimentoErp(telefone: string): Promise<void> {
  await patchMotoristaPorTelefone(telefone, {
    precisa_atendimento: false,
    precisa_atendimento_motivo: null,
  });
}

export async function obterEstadoAtendimentoErp(telefone: string): Promise<{
  motoristaId: number | null;
  telefone: string;
  estado: EstadoAtendimentoErp;
}> {
  const tel = normalizarTelefone(telefone);
  const motorista = await buscarMotoristaPorTelefone(tel);
  if (!motorista) {
    return { motoristaId: null, telefone: tel, estado: {} };
  }

  return {
    motoristaId: motorista.id,
    telefone: tel,
    estado: {
      ia_pausada: Boolean(motorista.ia_pausada),
      ia_pausa_motivo: (motorista.ia_pausa_motivo as string) ?? null,
      precisa_atendimento: Boolean(motorista.precisa_atendimento),
      precisa_atendimento_motivo: (motorista.precisa_atendimento_motivo as string) ?? null,
      ultima_intencao_whatsapp: (motorista.ultima_intencao_whatsapp as string) ?? null,
      ultima_intencao_em: (motorista.ultima_intencao_em as string) ?? null,
    },
  };
}
