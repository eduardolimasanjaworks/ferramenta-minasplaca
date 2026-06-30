/**
 * Verifica se o canal de envio esta disponivel — Minas Placa clean.
 */
import { obterStatusConexao } from './evolution.js';
export async function podeEnviarParaTelefone(telefone, instance) {
    const status = await obterStatusConexao(instance);
    if (!status.conectado) {
        return { pode: false, motivo: 'whatsapp_desconectado' };
    }
    return { pode: true };
}
