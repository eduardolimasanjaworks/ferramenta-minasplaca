/**
 * Garante registro no ERP no primeiro contato WhatsApp (idempotente).
 */
import {
  buscarMotoristaPorTelefone,
  criarContatoWhatsApp,
  STATUS_CONTATO_WHATSAPP,
} from './motorista-gmx.js';
import { invalidarCacheContextoErp } from './contexto-erp-motorista.js';

function extrairPrimeiroNome(nomeWhatsApp?: string): string | undefined {
  if (!nomeWhatsApp || nomeWhatsApp === 'Cliente' || nomeWhatsApp.length <= 1) {
    return undefined;
  }
  return nomeWhatsApp.split(' ')[0];
}

/** Cria contato no ERP se não existir; atualiza nome genérico com pushName do WhatsApp. */
export async function garantirContatoMotorista(
  telefone: string,
  nomeWhatsApp?: string,
): Promise<{ criado: boolean; motoristaId: number }> {
  const existente = await buscarMotoristaPorTelefone(telefone);
  const nome = extrairPrimeiroNome(nomeWhatsApp);

  if (!existente) {
    const m = await criarContatoWhatsApp(telefone, nome);
    invalidarCacheContextoErp(telefone);
    return { criado: true, motoristaId: m.id };
  }

  const nomeGenerico =
    !existente.nome ||
    /^(motorista|contato)$/i.test(existente.nome) ||
    (existente.status_cadastro === STATUS_CONTATO_WHATSAPP && existente.nome === 'Contato');

  if (nome && nomeGenerico) {
    const { atualizarMotorista } = await import('./motorista-gmx.js');
    await atualizarMotorista(existente.id, { nome }).catch(() => undefined);
    invalidarCacheContextoErp(telefone);
  }

  return { criado: false, motoristaId: existente.id };
}

/** Indica contato ainda não qualificado como motorista */
export function ehContatoWhatsAppProspecto(motorista: {
  status_cadastro?: string;
}): boolean {
  return motorista.status_cadastro === STATUS_CONTATO_WHATSAPP;
}
