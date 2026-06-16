#!/usr/bin/env node
/**
 * Fase 7 — extrai linguagem do motorista do export Chatwoot (só incoming).
 * Gera: data/linguagem-motorista-curado.json + data/padroes-encerramento-motorista.json
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const JSONL = resolve(
  ROOT,
  'VERIFICAR possibilidade de treinar baseado em historico, para imitar sintaxe e comportamento/gmx_motoristas_direct_operacao_2026-06-15.jsonl',
);
const OUT_DIR = resolve(ROOT, 'data');

const ACK = /^(ok|blz|beleza|valeu|vlw|obrigad|obg|show|tmj|combinado|perfeito|certo|fechou|entendi|tranquilo|top|agradeço|grato|falou|flw)[\s!.]*$/i;
const EMOJI = /^[\s\p{Emoji}\p{Extended_Pictographic}\u200d\ufe0f👍🙏✅]+$/u;
const DESPEDIDA_AGENTE =
  /boa viagem|dados atualizados|fica para a próxima|equipe te chama|vai com deus|já anotei|anotei aqui/i;

function classificarIntencao(t) {
  const s = t.toLowerCase();
  if (ACK.test(s) || EMOJI.test(t)) return 'encerramento';
  if (/cadastr|cnh|crlv|antt|documento/.test(s)) return 'cadastro';
  if (/vazio|carregad|dispon|local|onde|estou|cidade/.test(s)) return 'disponibilidade';
  if (/frete|carga|valor|paga|negoci|topa|interesse|\d{3,}/.test(s)) return 'negociacao';
  if (/pagamento|pix|adiantamento|saldo/.test(s)) return 'pagamento';
  if (/^(oi|olá|ola|bom dia|boa tarde|boa noite)\b/.test(s)) return 'saudacao';
  return 'outro';
}

function ehEncerramento(t, msgAnterior) {
  if (!msgAnterior || msgAnterior.direction !== 'outgoing') return false;
  if (!DESPEDIDA_AGENTE.test(msgAnterior.content || '')) return false;
  if (t.length > 70) return false;
  return ACK.test(t.trim()) || EMOJI.test(t.trim());
}

mkdirSync(OUT_DIR, { recursive: true });

const freq = new Map();
const encerramentos = new Map();
let total = 0;
let ignoradas = 0;

for (const line of readFileSync(JSONL, 'utf-8').split('\n')) {
  if (!line.trim()) continue;
  const conv = JSON.parse(line);
  const msgs = conv.messages || [];
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    if (m.direction !== 'incoming') continue;
    const t = (m.content || '').trim();
    if (!t || t.startsWith('[') || /DELETED/i.test(t)) {
      ignoradas++;
      continue;
    }
    if (t.length > 200) continue;

    const chave = t.toLowerCase().slice(0, 120);
    const intencao = classificarIntencao(t);
    const enc = ehEncerramento(t, msgs[i - 1]);

    if (!freq.has(chave)) {
      freq.set(chave, { texto: t, intencao, encerramento: enc, ocorrencias: 0 });
    }
    const item = freq.get(chave);
    item.ocorrencias++;
    if (enc) item.encerramento = true;
    total++;

    if (enc) {
      encerramentos.set(chave, (encerramentos.get(chave) || 0) + 1);
    }
  }
}

const curado = [...freq.values()]
  .filter((x) => x.ocorrencias >= 2 || x.encerramento)
  .sort((a, b) => b.ocorrencias - a.ocorrencias)
  .slice(0, 8000);

const frasesEnc = [...encerramentos.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 200)
  .map(([k]) => freq.get(k)?.texto || k)
  .filter(Boolean);

writeFileSync(resolve(OUT_DIR, 'linguagem-motorista-curado.json'), JSON.stringify(curado, null, 2));
writeFileSync(
  resolve(OUT_DIR, 'padroes-encerramento-motorista.json'),
  JSON.stringify({ geradoEm: new Date().toISOString(), frases: frasesEnc }, null, 2),
);

console.log(`Processado: ${total} msgs incoming, ${ignoradas} ignoradas`);
console.log(`Curado: ${curado.length} frases únicas → data/linguagem-motorista-curado.json`);
console.log(`Encerramento: ${frasesEnc.length} padrões → data/padroes-encerramento-motorista.json`);
