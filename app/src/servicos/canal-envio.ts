/**
 * Canal de envio — Evolution API (WhatsApp do QR).
 */
import { obterStatusConexao, obterStatusConexaoPorInstancia } from './evolution-instancia.js';

/** Há WhatsApp Evolution conectado para enviar */
export async function podeEnviarParaTelefone(
  _telefone: string,
  instance?: string,
): Promise<{ pode: boolean; canal: 'evolution' | 'nenhum'; motivo?: string }> {
  const status =
    instance && instance.trim()
      ? await obterStatusConexaoPorInstancia(instance)
      : await obterStatusConexao();
  if (status.conectado) {
    return { pode: true, canal: 'evolution' };
  }
  return {
    pode: false,
    canal: 'nenhum',
    motivo: status.motivoDesconexao ?? `WhatsApp ${status.state}`,
  };
}
