/**
 * Verifica se o canal de envio esta disponivel — Minas Placa clean.
 * Independente do provider (UazAPI ou Evolution).
 */
import { obterStatusConexaoAtivo } from './canal-whatsapp.js';

export async function podeEnviarParaTelefone(
  _telefone: string,
  _instance: string,
): Promise<{ pode: boolean; motivo?: string }> {
  const status = await obterStatusConexaoAtivo();
  if (!status.conectado) {
    return { pode: false, motivo: 'whatsapp_desconectado' };
  }
  return { pode: true };
}
