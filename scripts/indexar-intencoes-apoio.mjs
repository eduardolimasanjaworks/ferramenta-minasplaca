#!/usr/bin/env node
/**
 * Indexa exemplos de apoio semântico (intenções ambíguas) no Qdrant — append, não apaga histórico.
 * Uso: node scripts/indexar-intencoes-apoio.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DIST = resolve(ROOT, 'app/dist/servicos');
const DATA = [
  resolve(ROOT, 'data/intencoes-motorista-apoio.json'),
  '/app/data/intencoes-motorista-apoio.json',
].find((p) => existsSync(p));

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

if (!DATA) {
  console.error('Arquivo data/intencoes-motorista-apoio.json não encontrado');
  process.exit(1);
}

const exemplos = JSON.parse(readFileSync(DATA, 'utf-8'));
const { indexarPontosLinguagem } = await import(`${DIST}/qdrant-linguagem.js`);

const pontos = exemplos.map((e) => ({
  texto: e.texto,
  intencao: e.intencao,
  tipo: 'apoio_intencao',
  acao_recomendada: e.acao_recomendada,
  nota: e.nota,
  encerramento: false,
}));

console.log(`Indexando ${pontos.length} exemplos de apoio semântico (append)...`);
const n = await indexarPontosLinguagem(pontos);
console.log(`OK — ${n} pontos adicionados em linguagem_motorista_gmx`);
