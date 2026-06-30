/**
 * RAG Minas Placa — busca contexto relevante no Qdrant.
 */
import { QdrantClient } from '@qdrant/js-client-rest';
import { config } from './config.js';
const cliente = new QdrantClient({ url: config.qdrantUrl });
const COLECAO = 'minasplaca_conhecimento';
export async function garantirColecaoConhecimento() {
    try {
        await cliente.getCollection(COLECAO);
        return;
    }
    catch {
        await cliente.createCollection(COLECAO, {
            vectors: {
                size: 1536,
                distance: 'Cosine',
            },
        });
        console.log('[rag] Colecao', COLECAO, 'criada');
    }
}
export async function buscarContexto(mensagem, limite = 5) {
    try {
        const resultado = await cliente.scroll(COLECAO, {
            limit: limite * 2,
            with_payload: true,
        });
        const termos = mensagem.toLowerCase().split(/\s+/).filter((t) => t.length > 3);
        const trechos = (resultado.points ?? [])
            .map((p) => p.payload?.texto ?? '')
            .filter(Boolean)
            .filter((t) => termos.some((termo) => t.toLowerCase().includes(termo)));
        return trechos.slice(0, limite);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[rag] Erro ao buscar contexto:', msg);
        return [];
    }
}
export async function indexarConhecimento(trechos) {
    if (!config.openrouterToken) {
        console.warn('[rag] Sem token de embeddings — indexacao textual simples');
    }
    await garantirColecaoConhecimento();
    for (const texto of trechos) {
        const id = String(Date.now() + Math.random());
        await cliente.upsert(COLECAO, {
            points: [
                {
                    id,
                    vector: new Array(1536).fill(0).map(() => Math.random() - 0.5),
                    payload: { texto },
                },
            ],
        });
    }
}
