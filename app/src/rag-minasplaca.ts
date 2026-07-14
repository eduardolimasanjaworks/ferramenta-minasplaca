/**
 * RAG Minas Placa — busca contexto relevante no Qdrant.
 *
 * Estrategia:
 *  1. Gera embedding da mensagem (OpenAI text-embedding-3-small, 1536 dims).
 *  2. Faz busca vetorial (cosine) na colecao de conhecimento.
 *  3. Se nao houver embeddings/chave, cai no modo textual (scroll + palavra-chave).
 *
 * Para popular a base rode: node scripts/indexar-rag.mjs
 */
import { QdrantClient } from '@qdrant/js-client-rest';
import { config } from './config.js';

const cliente = new QdrantClient({ url: config.qdrantUrl });
const COLECAO = 'minasplaca_conhecimento';
const MODELO_EMBED = 'text-embedding-3-small';
const DIMENSOES = 1536;

export async function garantirColecaoConhecimento(): Promise<void> {
  try {
    await cliente.getCollection(COLECAO);
    return;
  } catch {
    await cliente.createCollection(COLECAO, {
      vectors: {
        size: DIMENSOES,
        distance: 'Cosine',
      },
    });
    console.log('[rag] Colecao', COLECAO, 'criada');
  }
}

/** Gera o embedding de um texto. Retorna null se nao houver chave ou em caso de erro. */
async function gerarEmbedding(texto: string): Promise<number[] | null> {
  if (!config.openaiApiKey) return null;
  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: MODELO_EMBED, input: texto, dimensions: DIMENSOES }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.warn('[rag] Embedding falhou:', res.status);
      return null;
    }
    const data = (await res.json()) as { data?: Array<{ embedding: number[] }> };
    return data.data?.[0]?.embedding ?? null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[rag] Erro ao gerar embedding:', msg);
    return null;
  }
}

/** Busca textual de fallback (sem embeddings): scroll + filtro por palavra-chave. */
async function buscarContextoTextual(mensagem: string, limite: number): Promise<string[]> {
  const resultado = await cliente.scroll(COLECAO, {
    limit: 256,
    with_payload: true,
  });

  const termos = mensagem
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 3);

  const trechos = (resultado.points ?? [])
    .map((p) => (p.payload?.texto as string) ?? '')
    .filter(Boolean)
    .filter((t) => termos.some((termo) => t.toLowerCase().includes(termo)));

  return trechos.slice(0, limite);
}

export async function buscarContexto(mensagem: string, limite = 5): Promise<string[]> {
  try {
    const vetor = await gerarEmbedding(mensagem);
    if (vetor) {
      const resultado = await cliente.search(COLECAO, {
        vector: vetor,
        limit: limite,
        with_payload: true,
        score_threshold: 0.2,
      });
      const trechos = resultado
        .map((p) => (p.payload?.texto as string) ?? '')
        .filter(Boolean);
      if (trechos.length) return trechos;
    }
    return await buscarContextoTextual(mensagem, limite);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[rag] Erro ao buscar contexto:', msg);
    return [];
  }
}

export async function indexarConhecimento(trechos: string[]): Promise<void> {
  await garantirColecaoConhecimento();

  for (const texto of trechos) {
    const id = Math.floor(Date.now() + Math.random() * 1000);
    const vetor = (await gerarEmbedding(texto)) ?? new Array(DIMENSOES).fill(0);
    await cliente.upsert(COLECAO, {
      points: [
        {
          id,
          vector: vetor,
          payload: { texto },
        },
      ],
    });
  }
}
