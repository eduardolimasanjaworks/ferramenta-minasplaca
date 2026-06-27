/**
 * Busca vetorial dos trechos editaveis do treinador usando Qdrant.
 * Mantem uma colecao dedicada para prompt, orquestracao e mensagens de fluxo.
 * Reindexa so quando o catalogo real muda para evitar custo desnecessario.
 */
import { createHash, randomUUID } from 'node:crypto';
import { QdrantClient } from '@qdrant/js-client-rest';
import { config } from '../config.js';
import { gerarEmbedding } from './openai.js';
import { DIMENSAO } from './qdrant.js';
import {
  montarCatalogoTrechosTreinamento,
  type TrechoCatalogado,
  type TrechoTreinamentoRelacionado,
} from './treinamento-config-busca.js';

const cliente = new QdrantClient({ url: config.qdrantUrl });
const COLECAO = config.qdrantColecaoTreinamento;
let ultimoHashSincronizado = '';

function hashCatalogo(catalogo: TrechoCatalogado[]): string {
  return createHash('sha1')
    .update(
      catalogo
        .map((item) => `${item.alvo}|${item.chave || ''}|${item.rotulo}|${item.texto}`)
        .join('\n###\n'),
    )
    .digest('hex');
}

async function inicializarColecaoTreinamento(): Promise<void> {
  const colecoes = await cliente.getCollections();
  const existe = colecoes.collections.some((item) => item.name === COLECAO);
  if (existe) return;
  await cliente.createCollection(COLECAO, {
    vectors: { size: DIMENSAO, distance: 'Cosine' },
  });
}

async function resetarColecaoTreinamento(): Promise<void> {
  try {
    await cliente.deleteCollection(COLECAO);
  } catch {
    /* colecao pode nao existir */
  }
  await inicializarColecaoTreinamento();
}

async function sincronizarCatalogoVetorial(catalogo: TrechoCatalogado[]): Promise<string> {
  const hashAtual = hashCatalogo(catalogo);
  if (hashAtual === ultimoHashSincronizado) return hashAtual;

  await resetarColecaoTreinamento();
  const pontos = [];
  for (const item of catalogo) {
    const vetor = await gerarEmbedding(item.texto.slice(0, 1800));
    pontos.push({
      id: randomUUID(),
      vector: vetor,
      payload: {
        hash: hashAtual,
        alvo: item.alvo,
        chave: item.chave ?? '',
        rotulo: item.rotulo,
        texto: item.texto,
      },
    });
  }

  if (pontos.length) {
    await cliente.upsert(COLECAO, {
      wait: true,
      points: pontos,
    });
  }
  ultimoHashSincronizado = hashAtual;
  return hashAtual;
}

export async function buscarTrechosVetoriaisTreinamento(
  pedido: string,
  limite = 8,
): Promise<TrechoTreinamentoRelacionado[]> {
  try {
    if (!config.openaiToken) return [];
    const catalogo = await montarCatalogoTrechosTreinamento();
    if (!catalogo.length) return [];

    const hashAtual = await sincronizarCatalogoVetorial(catalogo);
    const vetorConsulta = await gerarEmbedding(pedido.slice(0, 1800));
    const resultado = await cliente.search(COLECAO, {
      vector: vetorConsulta,
      limit: limite * 3,
      with_payload: true,
      filter: {
        must: [{ key: 'hash', match: { value: hashAtual } }],
      },
    });

    const vistos = new Set<string>();
    return resultado
      .map((item) => {
        const alvo = String(item.payload?.alvo || 'prompt_sistema') as TrechoTreinamentoRelacionado['alvo'];
        const chave = String(item.payload?.chave || '').trim() || null;
        const texto = String(item.payload?.texto || '').trim();
        const rotulo = String(item.payload?.rotulo || '').trim() || `${alvo}${chave ? `.${chave}` : ''}`;
        return {
          alvo,
          chave,
          rotulo,
          texto,
          score: Number(item.score || 0),
          termos: [],
          motivo: `busca vetorial score ${Number(item.score || 0).toFixed(3)}`,
          origemBusca: 'vetorial' as const,
        };
      })
      .filter((item) => item.texto && item.score >= 0.55)
      .filter((item) => {
        const chaveUnica = `${item.alvo}|${item.chave || ''}|${item.texto}`;
        if (vistos.has(chaveUnica)) return false;
        vistos.add(chaveUnica);
        return true;
      })
      .slice(0, limite);
  } catch {
    return [];
  }
}
