/**
 * Drena fila de respostas pendentes quando o WhatsApp reconecta.
 * Só envia itens recentes — respostas antigas são descartadas (evita spam fora de contexto).
 */
import { config } from '../config.js';
import { obterStatusConexao } from './evolution-instancia.js';
import { enviarRespostaCanal } from './enviar-resposta.js';
import {
  listarRespostasPendentes,
  removerRespostaPendente,
  descartarRespostasAntigas,
  type RespostaPendente,
} from './fila-respostas.js';
import { logEvento } from '../util/log-eventos.js';
import { iaPodeResponder } from './pausa.js';

let processando = false;

function itemAindaValido(item: RespostaPendente): boolean {
  return Date.now() - item.criadoEm <= config.filaRespostaMaxIdadeMs;
}

async function drenarUma(item: RespostaPendente): Promise<boolean> {
  if (!itemAindaValido(item)) {
    await removerRespostaPendente(item.id, item.telefone);
    logEvento(
      'fila',
      'Resposta pendente descartada na drenagem (muito antiga)',
      { telefone: item.telefone, id: item.id },
      'warn',
    );
    return true;
  }

  if (item.origem === 'teste') {
    await removerRespostaPendente(item.id, item.telefone);
    return true;
  }

  if (!(await iaPodeResponder(item.telefone))) {
    await removerRespostaPendente(item.id, item.telefone);
    logEvento('fila', 'Resposta pendente descartada (IA pausada)', {
      telefone: item.telefone,
      id: item.id,
    });
    return true;
  }

  try {
    const qtd = await enviarRespostaCanal(item.telefone, item.texto, config.evolutionInstance, {
      fragmentar: false,
    });
    await removerRespostaPendente(item.id, item.telefone);
    logEvento('fila', 'Resposta pendente enviada', {
      telefone: item.telefone,
      id: item.id,
      fragmentos: qtd,
      idadeSeg: Math.round((Date.now() - item.criadoEm) / 1000),
    });
    return true;
  } catch (err) {
    logEvento(
      'fila',
      'Falha ao drenar resposta pendente',
      {
        telefone: item.telefone,
        id: item.id,
        erro: err instanceof Error ? err.message : String(err),
      },
      'warn',
    );
    return false;
  }
}

async function cicloDrenagem(): Promise<void> {
  if (processando) return;
  processando = true;
  try {
    await descartarRespostasAntigas();

    const status = await obterStatusConexao();
    if (!status.conectado) return;

    const pendentes = (await listarRespostasPendentes(20)).filter(itemAindaValido);
    if (pendentes.length === 0) return;

    logEvento('fila', 'Drenando respostas pendentes recentes', {
      quantidade: pendentes.length,
      maxIdadeMin: Math.round(config.filaRespostaMaxIdadeMs / 60_000),
    });

    for (const item of pendentes) {
      const ok = await drenarUma(item);
      if (!ok) break;
      const ainda = await obterStatusConexao();
      if (!ainda.conectado) break;
    }
  } finally {
    processando = false;
  }
}

export function iniciarWorkerFilaRespostas(): void {
  setInterval(() => {
    cicloDrenagem().catch((err) =>
      console.error('[fila-worker] Erro:', err),
    );
  }, 8000);
  console.log(
    `[fila-worker] Worker iniciado (intervalo 8s, max idade ${Math.round(config.filaRespostaMaxIdadeMs / 60_000)}min)`,
  );
}
