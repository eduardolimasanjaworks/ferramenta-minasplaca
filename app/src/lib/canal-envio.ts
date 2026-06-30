/**
 * Verifica se o canal de envio esta disponivel — Minas Placa clean.
 */
import { obterStatusConexao } from './evolution.js';

export async function podeEnviarParaTelefone(
  telefone: string,
  instance: string,
): Promise<{ pode: boolean; motivo?: string }> {
  const status = await obterStatusConexao(instance);
  if (!status.conectado) {
    return { pode: false, motivo: 'whatsapp_desconectado' };
  }
  return { pode: true };
}
