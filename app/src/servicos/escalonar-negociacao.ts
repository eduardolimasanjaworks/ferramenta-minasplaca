/**
 * Escalonamento de negociação — pausa IA + notifica operadores.
 */
import { pausarContato } from './pausa.js';
import { listarTelefonesNotificacao } from './rotas-gmx.js';
import { enviarTexto } from './evolution.js';
import { config } from '../config.js';
import { logEvento } from '../util/log-eventos.js';
import { normalizarTelefone } from '../util/telefone.js';

export async function escalonarNegociacao(opts: {
  telefoneMotorista: string;
  origem?: string;
  destino?: string;
  valorPedido?: number;
  valorMinimo?: number;
  valorMaximo?: number;
  motivo: string;
}): Promise<{ pausado: boolean; notificados: number }> {
  const tel = normalizarTelefone(opts.telefoneMotorista);
  await pausarContato(tel, 'negociacao_escalonada');

  const msg = [
    '⚠️ Negociação escalonada (IA pausada)',
    `Motorista: ${tel}`,
    opts.origem && opts.destino ? `Rota: ${opts.origem} → ${opts.destino}` : '',
    opts.valorPedido != null ? `Valor pedido: R$ ${opts.valorPedido}` : '',
    opts.valorMinimo != null && opts.valorMaximo != null
      ? `Faixa: R$ ${opts.valorMinimo} – R$ ${opts.valorMaximo}`
      : '',
    `Motivo: ${opts.motivo}`,
  ]
    .filter(Boolean)
    .join('\n');

  const telefones = await listarTelefonesNotificacao();
  let notificados = 0;

  for (const dest of telefones) {
    try {
      await enviarTexto(config.evolutionInstance, dest.telefone, msg);
      notificados++;
    } catch (err) {
      logEvento(
        'escalonar',
        'Falha ao notificar operador',
        { telefone: dest.telefone, erro: err instanceof Error ? err.message : String(err) },
        'warn',
      );
    }
  }

  logEvento('escalonar', 'Negociação escalonada', {
    motorista: tel,
    notificados,
    motivo: opts.motivo,
  });

  return { pausado: true, notificados };
}
