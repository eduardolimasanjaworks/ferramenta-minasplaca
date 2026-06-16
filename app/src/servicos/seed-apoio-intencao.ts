/**
 * Garante exemplos de apoio semântico no Qdrant (append, não apaga histórico).
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { indexarPontosLinguagem } from './qdrant-linguagem.js';
import { QdrantClient } from '@qdrant/js-client-rest';
import { config } from '../config.js';
import { COLECAO_LINGUAGEM } from './qdrant-linguagem.js';

const cliente = new QdrantClient({ url: config.qdrantUrl });

function localizarArquivosApoio(): string[] {
  const found: string[] = [];
  for (const p of [
    resolve(process.cwd(), '../data/intencoes-motorista-apoio.json'),
    resolve(process.cwd(), 'data/intencoes-motorista-apoio.json'),
    '/app/data/intencoes-motorista-apoio.json',
    resolve(process.cwd(), '../data/intencoes-referencia-atendimento.json'),
    resolve(process.cwd(), 'data/intencoes-referencia-atendimento.json'),
    '/app/data/intencoes-referencia-atendimento.json',
  ]) {
    if (existsSync(p)) found.push(p);
  }
  return found;
}

async function contarApoioIndexado(): Promise<number> {
  try {
    const r = await cliente.count(COLECAO_LINGUAGEM, {
      filter: {
        must: [{ key: 'tipo', match: { value: 'apoio_intencao' } }],
      },
      exact: true,
    });
    return r.count ?? 0;
  } catch {
    return 0;
  }
}

function contarExemplosArquivos(caminhos: string[]): number {
  let n = 0;
  for (const caminho of caminhos) {
    const raw = JSON.parse(readFileSync(caminho, 'utf-8'));
    const exemplos = Array.isArray(raw) ? raw : raw.exemplos ?? [];
    n += exemplos.length;
  }
  return n;
}

export async function garantirApoioIntencaoIndexado(): Promise<void> {
  const caminhos = localizarArquivosApoio();
  if (caminhos.length === 0) {
    console.warn('[apoio-intencao] Nenhum arquivo de apoio encontrado');
    return;
  }

  const esperado = contarExemplosArquivos(caminhos);
  const indexado = await contarApoioIndexado();

  if (indexado >= esperado && indexado > 0) {
    console.log(`[apoio-intencao] ${indexado} exemplos semânticos já indexados (arquivo: ${esperado})`);
    return;
  }

  if (indexado > 0) {
    console.log(`[apoio-intencao] Reindexando apoio (${indexado} → ${esperado} exemplos no arquivo)`);
    await cliente.delete(COLECAO_LINGUAGEM, {
      wait: true,
      filter: {
        must: [{ key: 'tipo', match: { value: 'apoio_intencao' } }],
      },
    });
  }

  const pontos: Array<{
    texto: string;
    intencao: string;
    tipo: 'apoio_intencao';
    acao_recomendada: string;
    nota: string;
    encerramento: false;
  }> = [];

  for (const caminho of caminhos) {
    const raw = JSON.parse(readFileSync(caminho, 'utf-8'));
    const exemplos = Array.isArray(raw) ? raw : raw.exemplos ?? [];
    for (const e of exemplos) {
      pontos.push({
        texto: e.texto,
        intencao: e.intencao,
        tipo: 'apoio_intencao',
        acao_recomendada: e.acao_recomendada ?? 'interpretar_contexto',
        nota: e.nota ?? '',
        encerramento: false,
      });
    }
  }

  const n = await indexarPontosLinguagem(pontos);
  console.log(`[apoio-intencao] ${n} exemplos de apoio semântico indexados (${caminhos.length} arquivos)`);
}
