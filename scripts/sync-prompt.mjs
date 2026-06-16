#!/usr/bin/env node
/** Sincroniza prompt do arquivo para o banco e reindexa */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arquivo = resolve(ROOT, 'prompt inicial para avaliarmos dificuldade');
const prompt = readFileSync(arquivo, 'utf-8');

const KEY = process.env.IAGMX_ADMIN_KEY || 'iagmx-pausa-2026';

const res = await fetch('http://127.0.0.1:8095/api/prompt', {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'x-iagmx-key': KEY,
  },
  body: JSON.stringify({ prompt }),
});
console.log(await res.json());
