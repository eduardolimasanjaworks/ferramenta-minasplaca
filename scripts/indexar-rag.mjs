/**
 * Indexador de conhecimento (RAG) — Minas Placa.
 *
 * Lê as fontes de conhecimento (prompt-cliente.txt e arquivos .txt/.md em ./data),
 * fatia em trechos, gera embeddings reais via OpenAI (text-embedding-3-small, 1536 dims)
 * e envia (upsert) para a coleção `minasplaca_conhecimento` no Qdrant.
 *
 * Uso:
 *   node scripts/indexar-rag.mjs
 *
 * Variaveis de ambiente (lidas do .env automaticamente):
 *   OPENAI_API_KEY   -> chave para gerar embeddings
 *   QDRANT_URL       -> padrao http://127.0.0.1:6340 (host) — dentro do compose use http://qdrant:6333
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(__dirname, '..');

// ---- Carrega .env de forma simples ----
function carregarEnv() {
  const caminho = join(RAIZ, '.env');
  if (!existsSync(caminho)) return;
  for (const linha of readFileSync(caminho, 'utf-8').split('\n')) {
    const l = linha.trim();
    if (!l || l.startsWith('#')) continue;
    const i = l.indexOf('=');
    if (i === -1) continue;
    const chave = l.slice(0, i).trim();
    const valor = l.slice(i + 1).trim();
    if (!(chave in process.env)) process.env[chave] = valor;
  }
}
carregarEnv();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const QDRANT_URL = process.env.QDRANT_URL_HOST || process.env.QDRANT_URL || 'http://127.0.0.1:6340';
const COLECAO = 'minasplaca_conhecimento';
const MODELO_EMBED = 'text-embedding-3-small';
const DIMENSOES = 1536;
const ALVO_CHARS = 700; // tamanho alvo de cada trecho

if (!OPENAI_API_KEY) {
  console.error('[indexar-rag] ERRO: OPENAI_API_KEY nao configurada no .env');
  process.exit(1);
}

// ---- Coleta as fontes de conhecimento ----
function coletarFontes() {
  const fontes = [];
  const prompt = join(RAIZ, 'prompt-cliente.txt');
  if (existsSync(prompt)) fontes.push({ nome: 'prompt-cliente.txt', texto: readFileSync(prompt, 'utf-8') });

  const dataDir = join(RAIZ, 'data');
  if (existsSync(dataDir)) {
    for (const arq of readdirSync(dataDir)) {
      const ext = extname(arq).toLowerCase();
      if (ext === '.txt' || ext === '.md') {
        fontes.push({ nome: `data/${arq}`, texto: readFileSync(join(dataDir, arq), 'utf-8') });
      }
    }
  }
  return fontes;
}

// ---- Fatia o texto em trechos coesos ----
function fatiar(texto) {
  const paragrafos = texto
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+\n/g, '\n').trim())
    .filter((p) => p.length > 0);

  const trechos = [];
  let atual = '';
  for (const p of paragrafos) {
    if ((atual + '\n\n' + p).length > ALVO_CHARS && atual) {
      trechos.push(atual.trim());
      atual = p;
    } else {
      atual = atual ? `${atual}\n\n${p}` : p;
    }
  }
  if (atual.trim()) trechos.push(atual.trim());
  return trechos;
}

// ---- Gera embeddings em lote ----
async function gerarEmbeddings(textos) {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: MODELO_EMBED, input: textos, dimensions: DIMENSOES }),
  });
  if (!res.ok) {
    const corpo = await res.text().catch(() => '');
    throw new Error(`OpenAI embeddings falhou (${res.status}): ${corpo}`);
  }
  const data = await res.json();
  return data.data.map((d) => d.embedding);
}

// ---- Garante coleccao com o tamanho certo ----
async function garantirColecao() {
  const r = await fetch(`${QDRANT_URL}/collections/${COLECAO}`);
  if (r.ok) return;
  const criar = await fetch(`${QDRANT_URL}/collections/${COLECAO}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vectors: { size: DIMENSOES, distance: 'Cosine' } }),
  });
  if (!criar.ok) throw new Error(`Falha ao criar colecao: ${await criar.text()}`);
  console.log(`[indexar-rag] Colecao ${COLECAO} criada.`);
}

// ---- Envia pontos ao Qdrant ----
async function upsert(pontos) {
  const res = await fetch(`${QDRANT_URL}/collections/${COLECAO}/points?wait=true`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points: pontos }),
  });
  if (!res.ok) throw new Error(`Upsert falhou (${res.status}): ${await res.text()}`);
}

async function main() {
  console.log(`[indexar-rag] Qdrant: ${QDRANT_URL} | Colecao: ${COLECAO}`);
  await garantirColecao();

  const fontes = coletarFontes();
  if (fontes.length === 0) {
    console.error('[indexar-rag] Nenhuma fonte de conhecimento encontrada.');
    process.exit(1);
  }

  const trechos = [];
  for (const f of fontes) {
    const partes = fatiar(f.texto);
    partes.forEach((texto, i) => trechos.push({ fonte: f.nome, indice: i, texto }));
    console.log(`[indexar-rag] ${f.nome}: ${partes.length} trechos`);
  }

  console.log(`[indexar-rag] Total de trechos: ${trechos.length}. Gerando embeddings...`);

  const LOTE = 64;
  let id = 1;
  const pontos = [];
  for (let i = 0; i < trechos.length; i += LOTE) {
    const lote = trechos.slice(i, i + LOTE);
    const vetores = await gerarEmbeddings(lote.map((t) => t.texto));
    lote.forEach((t, j) => {
      pontos.push({
        id: id++,
        vector: vetores[j],
        payload: { texto: t.texto, fonte: t.fonte, indice: t.indice },
      });
    });
    console.log(`[indexar-rag] Embeddings ${Math.min(i + LOTE, trechos.length)}/${trechos.length}`);
  }

  await upsert(pontos);
  console.log(`[indexar-rag] OK — ${pontos.length} pontos indexados na colecao ${COLECAO}.`);
}

main().catch((err) => {
  console.error('[indexar-rag] Falha:', err.message);
  process.exit(1);
});
