/**
 * Cliente Qdrant — armazenamento vetorial de chunks do prompt.
 */
import { QdrantClient } from '@qdrant/js-client-rest';
import { config } from '../config.js';

const cliente = new QdrantClient({ url: config.qdrantUrl });

const DIMENSAO = 3072; // text-embedding-3-large

/** Garante que a coleção existe */
export async function inicializarColecao(): Promise<void> {
  const colecoes = await cliente.getCollections();
  const existe = colecoes.collections.some((c) => c.name === config.qdrantColecao);
  if (existe) return;

  await cliente.createCollection(config.qdrantColecao, {
    vectors: { size: DIMENSAO, distance: 'Cosine' },
  });
  console.log(`[qdrant] Coleção "${config.qdrantColecao}" criada`);
}

/** Remove todos os pontos da coleção (reindexação) */
export async function limparColecao(): Promise<void> {
  try {
    await cliente.deleteCollection(config.qdrantColecao);
  } catch {
    /* coleção pode não existir */
  }
  await inicializarColecao();
}

/** Insere chunks vetorizados */
export async function inserirChunks(
  chunks: Array<{ id: string; vetor: number[]; texto: string; indice: number }>,
): Promise<void> {
  if (chunks.length === 0) return;
  await cliente.upsert(config.qdrantColecao, {
    wait: true,
    points: chunks.map((c) => ({
      id: c.id,
      vector: c.vetor,
      payload: { texto: c.texto, indice: c.indice },
    })),
  });
}

/** Busca chunks relevantes para uma consulta */
export async function buscarChunks(
  vetorConsulta: number[],
  limite = config.chunksRag,
): Promise<string[]> {
  const resultado = await cliente.search(config.qdrantColecao, {
    vector: vetorConsulta,
    limit: limite,
    with_payload: true,
  });
  return resultado
    .sort((a, b) => ((a.payload?.indice as number) ?? 0) - ((b.payload?.indice as number) ?? 0))
    .map((r) => (r.payload?.texto as string) ?? '')
    .filter(Boolean);
}

/** Verifica conexão com Qdrant */
export async function verificarQdrant(): Promise<boolean> {
  try {
    await cliente.getCollections();
    return true;
  } catch {
    return false;
  }
}

export { DIMENSAO };
