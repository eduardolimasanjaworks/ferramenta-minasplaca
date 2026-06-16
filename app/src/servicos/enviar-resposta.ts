/**
 * Envio de respostas — sempre via Evolution API (WhatsApp conectado no QR).
 */
import { dividirResposta } from './mensagem.js';
import { enviarRespostaFragmentada } from './evolution.js';
import { podeEnviarParaTelefone } from './canal-envio.js';
import { enfileirarResposta } from './fila-respostas.js';
import { logEvento } from '../util/log-eventos.js';
import { marcarEnvioIa } from './envio-ia.js';

export interface ResultadoEnvio {
  enviado: boolean;
  pendente: boolean;
  fragmentos: number;
  motivo?: string;
  filaId?: string;
}

export interface OpcoesEnvioResposta {
  remoteJid?: string;
  mensagensEntrada?: number;
  origem?: 'evolution' | 'teste';
  /** false = uma única bolha (menu programático, respostas curtas) */
  fragmentar?: boolean;
}

/**
 * Envia resposta pelo WhatsApp Evolution ou enfileira se desconectado.
 */
export async function tentarEnviarResposta(
  telefone: string,
  textoCompleto: string,
  instance: string,
  opts: OpcoesEnvioResposta = {},
): Promise<ResultadoEnvio> {
  if (opts.origem === 'teste') {
    logEvento('envio', 'Resposta de teste — não enviada ao WhatsApp', {
      telefone,
      texto: textoCompleto.slice(0, 80),
    });
    return { enviado: false, pendente: false, fragmentos: 0, motivo: 'modo_teste' };
  }

  const fragmentos =
    opts.fragmentar === false
      ? [textoCompleto.trim() || 'Ok']
      : dividirResposta(textoCompleto);
  const canal = await podeEnviarParaTelefone(telefone);

  if (!canal.pode) {
    logEvento('envio', 'WhatsApp desconectado — enfileirando', {
      telefone,
      motivo: canal.motivo,
      fragmentos: fragmentos.length,
    }, 'warn');
    const filaId = await enfileirarResposta({
      telefone,
      remoteJid: opts.remoteJid ?? `${telefone}@s.whatsapp.net`,
      texto: textoCompleto,
      motivo: canal.motivo ?? 'whatsapp_desconectado',
      mensagensEntrada: opts.mensagensEntrada ?? 1,
      origem: opts.origem,
    });
    return {
      enviado: false,
      pendente: true,
      fragmentos: fragmentos.length,
      motivo: canal.motivo,
      filaId,
    };
  }

  try {
    const qtd = await enviarRespostaCanal(telefone, textoCompleto, instance, {
      fragmentar: opts.fragmentar,
    });
    await marcarEnvioIa(telefone, 8);
    return { enviado: true, pendente: false, fragmentos: qtd };
  } catch (err) {
    const motivo = err instanceof Error ? err.message : String(err);
    logEvento('envio', 'Falha no envio Evolution — enfileirando', { telefone, motivo }, 'error');
    const filaId = await enfileirarResposta({
      telefone,
      remoteJid: opts.remoteJid ?? `${telefone}@s.whatsapp.net`,
      texto: textoCompleto,
      motivo,
      mensagensEntrada: opts.mensagensEntrada ?? 1,
      origem: opts.origem,
    });
    return {
      enviado: false,
      pendente: true,
      fragmentos: fragmentos.length,
      motivo,
      filaId,
    };
  }
}

/** Envia resposta fragmentada via Evolution (lança erro se falhar). */
export async function enviarRespostaCanal(
  telefone: string,
  textoCompleto: string,
  instance: string,
  opts?: { fragmentar?: boolean },
): Promise<number> {
  return enviarRespostaFragmentada(instance, telefone, textoCompleto, opts);
}
