/**
 * Coleção Qdrant — linguagem do motorista (Fase 7, Camada A).
 * Só mensagens incoming curadas; sem texto de atendentes.
 */
import { randomUUID } from 'node:crypto';
import { QdrantClient } from '@qdrant/js-client-rest';
import { config } from '../config.js';
import { gerarEmbedding } from './openai.js';
import { DIMENSAO } from './qdrant.js';

const cliente = new QdrantClient({ url: config.qdrantUrl });
export const COLECAO_LINGUAGEM = config.qdrantColecaoLinguagem;

export interface PontoLinguagemMotorista {
  id?: string;
  texto: string;
  intencao?: string;
  encerramento?: boolean;
  ocorrencias?: number;
  /** Exemplos de apoio à desambiguação (não lista fechada) */
  tipo?: 'historico' | 'apoio_intencao';
  acao_recomendada?: string;
  nota?: string;
}

export async function inicializarColecaoLinguagem(): Promise<void> {
  const colecoes = await cliente.getCollections();
  const existe = colecoes.collections.some((c) => c.name === COLECAO_LINGUAGEM);
  if (existe) return;

  await cliente.createCollection(COLECAO_LINGUAGEM, {
    vectors: { size: DIMENSAO, distance: 'Cosine' },
  });
  console.log(`[qdrant] Coleção "${COLECAO_LINGUAGEM}" criada`);
}

export async function limparColecaoLinguagem(): Promise<void> {
  try {
    await cliente.deleteCollection(COLECAO_LINGUAGEM);
  } catch {
    /* */
  }
  await inicializarColecaoLinguagem();
}

export async function indexarPontosLinguagem(pontos: PontoLinguagemMotorista[]): Promise<number> {
  if (pontos.length === 0) return 0;
  await inicializarColecaoLinguagem();

  const batch = [];
  for (const p of pontos) {
    const vetor = await gerarEmbedding(p.texto);
    batch.push({
      id: p.id ?? randomUUID(),
      vector: vetor,
      payload: {
        texto: p.texto,
        intencao: p.intencao ?? 'indefinido',
        encerramento: p.encerramento === true,
        ocorrencias: p.ocorrencias ?? 1,
        tipo: p.tipo ?? 'historico',
        acao_recomendada: p.acao_recomendada ?? '',
        nota: p.nota ?? '',
      },
    });
  }

  await cliente.upsert(COLECAO_LINGUAGEM, { wait: true, points: batch });
  return batch.length;
}

export async function buscarLinguagemSimilar(
  consulta: string,
  limite = 3,
): Promise<Array<{ texto: string; intencao: string; encerramento: boolean; score: number }>> {
  try {
    const vetor = await gerarEmbedding(consulta.slice(0, 500));
    const resultado = await cliente.search(COLECAO_LINGUAGEM, {
      vector: vetor,
      limit: limite,
      with_payload: true,
    });
    return resultado.map((r) => ({
      texto: (r.payload?.texto as string) ?? '',
      intencao: (r.payload?.intencao as string) ?? 'indefinido',
      encerramento: r.payload?.encerramento === true,
      score: r.score ?? 0,
    }));
  } catch {
    return [];
  }
}

export async function buscarApoioIntencaoSimilar(
  consulta: string,
  limite = 4,
): Promise<
  Array<{
    texto: string;
    intencao: string;
    acao_recomendada: string;
    nota: string;
    score: number;
  }>
> {
  try {
    const vetor = await gerarEmbedding(consulta.slice(0, 500));
    const resultado = await cliente.search(COLECAO_LINGUAGEM, {
      vector: vetor,
      limit: limite * 3,
      with_payload: true,
    });
    return resultado
      .filter((r) => r.payload?.tipo === 'apoio_intencao')
      .slice(0, limite)
      .map((r) => ({
        texto: (r.payload?.texto as string) ?? '',
        intencao: (r.payload?.intencao as string) ?? 'indefinido',
        acao_recomendada: (r.payload?.acao_recomendada as string) ?? '',
        nota: (r.payload?.nota as string) ?? '',
        score: r.score ?? 0,
      }));
  } catch {
    return [];
  }
}

/** Reforça detecção de encerramento se histórico Qdrant tiver match forte */
export function encerramentoPorSimilaridadeHistorico(
  texto: string,
  similares: Array<{ texto: string; encerramento: boolean; score: number }>,
): boolean {
  if (similares.length === 0) return false;
  const top = similares[0];
  if (!top.encerramento || top.score < 0.88) return false;
  const a = texto.trim().toLowerCase();
  const b = top.texto.trim().toLowerCase();
  return a === b || a.includes(b) || b.includes(a);
}
