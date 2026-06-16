/**
 * Fila global de inferência LLM — limita chamadas simultâneas (TPM).
 * Webhooks/debounce aceitam todos; só o LLM espera na fila.
 */
import { config } from '../config.js';
import { logEvento } from '../util/log-eventos.js';

interface ItemFila<T> {
  executar: () => Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
  meta: Record<string, unknown>;
  enfileiradoEm: number;
}

let slotsOcupados = 0;
const esperando: ItemFila<unknown>[] = [];

export function statusFilaInferencia(): {
  slotsOcupados: number;
  maxSlots: number;
  aguardando: number;
} {
  return {
    slotsOcupados,
    maxSlots: config.inferenciaConcorrenciaMax,
    aguardando: esperando.length,
  };
}

function liberarSlot(): void {
  slotsOcupados = Math.max(0, slotsOcupados - 1);
  void processarProximo();
}

async function processarProximo(): Promise<void> {
  while (slotsOcupados < config.inferenciaConcorrenciaMax && esperando.length > 0) {
    const item = esperando.shift()!;
    slotsOcupados++;
    const esperaMs = Date.now() - item.enfileiradoEm;
    logEvento('fila-inferencia', 'Slot adquirido', {
      ...item.meta,
      slotsOcupados,
      aguardando: esperando.length,
      esperaMs,
    });

    item
      .executar()
      .then((r) => item.resolve(r))
      .catch((e) => item.reject(e))
      .finally(() => liberarSlot());
  }
}

/**
 * Executa trabalho LLM respeitando concorrência máxima.
 */
export function executarNaFilaInferencia<T>(
  executar: () => Promise<T>,
  meta: Record<string, unknown> = {},
): Promise<T> {
  if (slotsOcupados < config.inferenciaConcorrenciaMax) {
    slotsOcupados++;
    logEvento('fila-inferencia', 'Slot imediato', {
      ...meta,
      slotsOcupados,
      aguardando: esperando.length,
    });
    return executar().finally(() => liberarSlot());
  }

  logEvento('fila-inferencia', 'Enfileirado', {
    ...meta,
    slotsOcupados,
    aguardando: esperando.length + 1,
  });

  return new Promise<T>((resolve, reject) => {
    esperando.push({
      executar: executar as () => Promise<unknown>,
      resolve: resolve as (v: unknown) => void,
      reject,
      meta,
      enfileiradoEm: Date.now(),
    });
  });
}
