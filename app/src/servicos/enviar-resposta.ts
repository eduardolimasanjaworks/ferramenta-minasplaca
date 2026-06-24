/**
 * Envio de respostas — sempre via Evolution API (WhatsApp conectado no QR).
 */
import { dividirResposta } from './mensagem.js';
import { enviarRespostaFragmentada } from './evolution.js';
import { podeEnviarParaTelefone } from './canal-envio.js';
import { enfileirarResposta } from './fila-respostas.js';
import { logEvento } from '../util/log-eventos.js';
import { marcarEnvioIa } from './envio-ia.js';
import { salvarEstadoMonitorTelefone } from './monitor-telefone.js';
import { aleatorioEntre, obterConfigHumanizacao } from './config-humanizacao.js';
import { jidEhGrupoOuLista } from '../util/telefone.js';
import { config } from '../config.js';
import { simulacaoAtivaParaTelefone } from './simulacao-cenario.js';

export interface ResultadoEnvio {
  enviado: boolean;
  pendente: boolean;
  fragmentos: number;
  motivo?: string;
  filaId?: string;
  agendado?: boolean;
}

export interface OpcoesEnvioResposta {
  remoteJid?: string;
  mensagensEntrada?: number;
  origem?: 'evolution' | 'teste';
  /** false = uma única bolha (menu programático, respostas curtas) */
  fragmentar?: boolean;
  /** Persiste o atraso inicial antes do envio para sobreviver a reboot */
  agendarAtrasoInicial?: boolean;
  /** Pula simulacao de digitando para disparos que precisam sair na hora */
  ignorarDigitando?: boolean;
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
  if (jidEhGrupoOuLista(opts.remoteJid)) {
    logEvento('envio', 'Bloqueado envio para grupo/lista', {
      telefone,
      remoteJid: opts.remoteJid,
      texto: textoCompleto.slice(0, 80),
    }, 'warn');
    return { enviado: false, pendente: false, fragmentos: 0, motivo: 'grupo_bloqueado' };
  }

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

  const simulado =
    config.envioSimuladoHabilitado ? true : await simulacaoAtivaParaTelefone(telefone);
  if (simulado) {
    logEvento('envio', 'Envio simulado habilitado — não enviando ao WhatsApp', {
      telefone,
      fragmentos: fragmentos.length,
      texto: textoCompleto.slice(0, 120),
    });
    await salvarEstadoMonitorTelefone(telefone, {
      fase: 'concluido',
      mensagem: 'Envio simulado (sem WhatsApp)',
      desdeMs: Date.now(),
      detalhe: `fragmentos ${fragmentos.length}`,
    }).catch(() => undefined);
    await marcarEnvioIa(telefone, 8).catch(() => undefined);
    return { enviado: true, pendente: false, fragmentos: fragmentos.length, motivo: 'envio_simulado' };
  }

  const canal = await podeEnviarParaTelefone(telefone);
  // #region debug-point D:send-channel-check
  if (telefone === '5512982787368') fetch('http://2.24.201.28:7777/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'chat-sync-no-response',runId:'pre-fix',hypothesisId:'D',location:'enviar-resposta.ts:87',msg:'[DEBUG] envio avaliou disponibilidade do canal para o telefone alvo',data:{telefone,instance,canal},ts:Date.now()})}).catch(()=>{});
  // #endregion

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
      fragmentar: opts.fragmentar !== false,
      tipoFila: 'canal_indisponivel',
    });
    await salvarEstadoMonitorTelefone(telefone, {
      fase: 'fila_pendente',
      mensagem: 'Resposta aguardando reconexao do canal',
      desdeMs: Date.now(),
      detalhe: canal.motivo ?? 'whatsapp_desconectado',
    });
    return {
      enviado: false,
      pendente: true,
      fragmentos: fragmentos.length,
      motivo: canal.motivo,
      filaId,
    };
  }

  if (opts.agendarAtrasoInicial) {
    const cfg = await obterConfigHumanizacao();
    const atrasoInicial = aleatorioEntre(cfg.atrasoInicialMinMs, cfg.atrasoInicialMaxMs);
    const agendadoPara = Date.now() + atrasoInicial;
    const filaId = await enfileirarResposta({
      telefone,
      remoteJid: opts.remoteJid ?? `${telefone}@s.whatsapp.net`,
      texto: textoCompleto,
      motivo: 'agendado_atraso_inicial',
      mensagensEntrada: opts.mensagensEntrada ?? 1,
      origem: opts.origem,
      agendadoPara,
      fragmentar: opts.fragmentar !== false,
      tipoFila: 'atraso_humanizado',
    });
    await salvarEstadoMonitorTelefone(telefone, {
      fase: 'aguardando_atraso_inicial',
      mensagem: 'Resposta agendada com atraso persistido',
      desdeMs: Date.now(),
      ateMs: agendadoPara,
      sorteadoMs: atrasoInicial,
      detalhe: `fila ${filaId}`,
    });
    logEvento('envio', 'Resposta agendada com atraso inicial persistido', {
      telefone,
      filaId,
      atrasoInicial,
      agendadoPara,
    });
    return {
      enviado: false,
      pendente: false,
      fragmentos: fragmentos.length,
      motivo: 'agendado_atraso_inicial',
      filaId,
      agendado: true,
    };
  }

  try {
    const qtd = await enviarRespostaCanal(telefone, textoCompleto, instance, {
      fragmentar: opts.fragmentar,
      ignorarDigitando: opts.ignorarDigitando,
    });
    // #region debug-point D:send-success
    if (telefone === '5512982787368') fetch('http://2.24.201.28:7777/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'chat-sync-no-response',runId:'pre-fix',hypothesisId:'D',location:'enviar-resposta.ts:164',msg:'[DEBUG] envio confirmou sucesso para o telefone alvo',data:{telefone,instance,qtd,conteudoPreview:textoCompleto.slice(0,200)},ts:Date.now()})}).catch(()=>{});
    // #endregion
    await marcarEnvioIa(telefone, 8);
    return { enviado: true, pendente: false, fragmentos: qtd };
  } catch (err) {
    const motivo = err instanceof Error ? err.message : String(err);
    // #region debug-point D:send-error
    if (telefone === '5512982787368') fetch('http://2.24.201.28:7777/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'chat-sync-no-response',runId:'pre-fix',hypothesisId:'D',location:'enviar-resposta.ts:171',msg:'[DEBUG] envio falhou para o telefone alvo',data:{telefone,instance,motivo,conteudoPreview:textoCompleto.slice(0,200)},ts:Date.now()})}).catch(()=>{});
    // #endregion
    logEvento('envio', 'Falha no envio Evolution — enfileirando', { telefone, motivo }, 'error');
    const filaId = await enfileirarResposta({
      telefone,
      remoteJid: opts.remoteJid ?? `${telefone}@s.whatsapp.net`,
      texto: textoCompleto,
      motivo,
      mensagensEntrada: opts.mensagensEntrada ?? 1,
      origem: opts.origem,
      fragmentar: opts.fragmentar !== false,
      tipoFila: 'falha_envio',
    });
    await salvarEstadoMonitorTelefone(telefone, {
      fase: 'fila_pendente',
      mensagem: 'Resposta caiu na fila por falha no envio',
      desdeMs: Date.now(),
      detalhe: motivo,
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
  opts?: { fragmentar?: boolean; ignorarAtrasoInicial?: boolean; ignorarDigitando?: boolean },
): Promise<number> {
  return enviarRespostaFragmentada(instance, telefone, textoCompleto, opts);
}
