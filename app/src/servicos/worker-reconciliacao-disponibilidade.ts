/**
 * Worker — reconciliação de disponibilidade a cada 30 minutos (configurável).
 */
import { config } from '../config.js';
import { executarReconciliacaoDisponibilidade } from './reconciliacao-disponibilidade.js';

let emExecucao = false;

export function iniciarWorkerReconciliacaoDisponibilidade(): void {
  const intervalo = config.reconciliacaoIntervaloMs;
  console.log(
    `[worker-reconciliacao] Ativo — ciclo a cada ${Math.round(intervalo / 60000)} min`,
  );

  const rodar = async () => {
    if (emExecucao) {
      console.warn('[worker-reconciliacao] Ciclo anterior ainda em execução — pulando');
      return;
    }
    emExecucao = true;
    try {
      await executarReconciliacaoDisponibilidade();
    } catch (err) {
      console.error('[worker-reconciliacao] Falha no ciclo:', err);
    } finally {
      emExecucao = false;
    }
  };

  setTimeout(() => {
    void rodar();
  }, 60_000);

  setInterval(() => {
    void rodar();
  }, intervalo);
}
