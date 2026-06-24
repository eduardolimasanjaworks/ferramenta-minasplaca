/**
 * Agenda tarefas pesadas para depois que a API ja estiver ouvindo.
 * Evita bloquear o boot e reduz 502 transitorio durante deploy.
 * Expoe estado simples para healthcheck e teste deterministico.
 */
import { sincronizarVetores } from './prompt.js';

export type WarmupStatus = 'idle' | 'scheduled' | 'running' | 'done' | 'error';

export interface WarmupSnapshot {
  status: WarmupStatus;
  tarefa: string;
  iniciadoEm: string | null;
  finalizadoEm: string | null;
  erro: string | null;
}

const estado: WarmupSnapshot = {
  status: 'idle',
  tarefa: 'sincronizar_vetores_prompt',
  iniciadoEm: null,
  finalizadoEm: null,
  erro: null,
};

let timerAtivo: ReturnType<typeof setTimeout> | null = null;
let promessaAtiva: Promise<void> | null = null;

function setEstado(partial: Partial<WarmupSnapshot>) {
  Object.assign(estado, partial);
}

export function obterStatusWarmupPosBoot(): WarmupSnapshot {
  return { ...estado };
}

export function resetWarmupPosBootParaTeste(): void {
  if (timerAtivo) clearTimeout(timerAtivo);
  timerAtivo = null;
  promessaAtiva = null;
  setEstado({
    status: 'idle',
    iniciadoEm: null,
    finalizadoEm: null,
    erro: null,
  });
}

export function agendarWarmupPosBoot(
  job: () => Promise<void> = sincronizarVetores,
  delayMs = 5000,
): Promise<void> {
  if (promessaAtiva) return promessaAtiva;

  setEstado({
    status: 'scheduled',
    iniciadoEm: null,
    finalizadoEm: null,
    erro: null,
  });

  promessaAtiva = new Promise<void>((resolve) => {
    timerAtivo = setTimeout(() => {
      timerAtivo = null;
      setEstado({
        status: 'running',
        iniciadoEm: new Date().toISOString(),
      });

      job()
        .then(() => {
          setEstado({
            status: 'done',
            finalizadoEm: new Date().toISOString(),
          });
        })
        .catch((error) => {
          setEstado({
            status: 'error',
            finalizadoEm: new Date().toISOString(),
            erro: error instanceof Error ? error.message : String(error),
          });
          console.error('[warmup] Falha no warm-up pos-boot:', error);
        })
        .finally(() => {
          resolve();
        });
    }, Math.max(0, delayMs));
  });

  return promessaAtiva;
}
