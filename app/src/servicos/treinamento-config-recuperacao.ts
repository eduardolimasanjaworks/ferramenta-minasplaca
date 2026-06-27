/**
 * Combina busca vetorial e lexical para recuperar contexto do treinador.
 * Deduplica os trechos para a proposta ficar enxuta e confirmavel.
 * Mantem fallback deterministico quando a camada vetorial nao responder.
 */
import {
  buscarTrechosRelacionadosTreinamento,
  type TrechoTreinamentoRelacionado,
} from './treinamento-config-busca.js';
import { buscarTrechosVetoriaisTreinamento } from './treinamento-config-vetorial.js';

function chaveTrecho(item: TrechoTreinamentoRelacionado): string {
  return `${item.alvo}|${item.chave || ''}|${item.texto}`;
}

export function mesclarTrechosTreinamentoParaTeste(
  vetorial: TrechoTreinamentoRelacionado[],
  lexical: TrechoTreinamentoRelacionado[],
  limite = 8,
): TrechoTreinamentoRelacionado[] {
  const itens = [...vetorial, ...lexical];
  const vistos = new Set<string>();
  const deduplicados = itens.filter((item) => {
    const chave = chaveTrecho(item);
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });

  return deduplicados
    .sort((a, b) => {
      const pesoA = a.origemBusca === 'vetorial' ? 1 : 0;
      const pesoB = b.origemBusca === 'vetorial' ? 1 : 0;
      return pesoB - pesoA || b.score - a.score || a.rotulo.localeCompare(b.rotulo);
    })
    .slice(0, limite);
}

export async function recuperarTrechosTreinamento(
  pedido: string,
  limite = 8,
): Promise<TrechoTreinamentoRelacionado[]> {
  const [vetorial, lexical] = await Promise.all([
    buscarTrechosVetoriaisTreinamento(pedido, limite).catch(() => []),
    buscarTrechosRelacionadosTreinamento(pedido, limite).catch(() => []),
  ]);
  return mesclarTrechosTreinamentoParaTeste(vetorial, lexical, limite);
}
