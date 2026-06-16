#!/usr/bin/env node
/**
 * Fase 7 — indexa linguagem do motorista no Qdrant (coleção linguagem_motorista_gmx).
 * Uso: node scripts/indexar-linguagem-motorista.mjs [--limite=500]
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DIST = resolve(ROOT, 'app/dist/servicos');
const DATA_CANDIDATES = [
  resolve(ROOT, 'data/linguagem-motorista-curado.json'),
  '/app/data/linguagem-motorista-curado.json',
];
const DATA = DATA_CANDIDATES.find((p) => existsSync(p));

for (const p of [resolve(ROOT, '.env'), '/app/.env']) {
  try {
    for (const linha of readFileSync(p, 'utf-8').split('\n')) {
      const t = linha.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i > 0 && !process.env[t.slice(0, i).trim()]) {
        process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
      }
    }
    break;
  } catch { /* */ }
}

const limite = parseInt(
  process.argv.find((a) => a.startsWith('--limite='))?.split('=')[1] ?? '400',
  10,
);

if (!DATA) {
  console.error('Rode primeiro: node scripts/processar-historico-chatwoot.mjs');
  process.exit(1);
}

const curado = JSON.parse(readFileSync(DATA, 'utf-8'));
const lote = curado.slice(0, limite);

const { limparColecaoLinguagem, indexarPontosLinguagem } = await import(
  `${DIST}/qdrant-linguagem.js`
);

console.log(`Indexando ${lote.length} frases de motorista...`);
await limparColecaoLinguagem();

let inseridos = 0;
const BATCH = 20;
for (let i = 0; i < lote.length; i += BATCH) {
  const pedaco = lote.slice(i, i + BATCH).map((x) => ({
    texto: x.texto,
    intencao: x.intencao,
    encerramento: x.encerramento === true,
    ocorrencias: x.ocorrencias,
  }));
  inseridos += await indexarPontosLinguagem(pedaco);
  console.log(`  ${Math.min(i + BATCH, lote.length)}/${lote.length}`);
  await new Promise((r) => setTimeout(r, 1500));
}

console.log(`OK — ${inseridos} pontos em linguagem_motorista_gmx`);
