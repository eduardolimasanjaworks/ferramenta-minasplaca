#!/usr/bin/env node
/**
 * Bateria de testes: STT + humanidade das respostas.
 * Uso: node scripts/teste-bateria.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// Carrega .env
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

const DIST = resolve(ROOT, 'app/dist/servicos');

function normalizarRespostaWhatsapp(texto) {
  return texto
    .replace(/\r\n/g, '\n')
    .replace(/\n+/g, ', ')
    .replace(/\.\s+/g, ', ')
    .replace(/\.\s*$/g, '')
    .replace(/\.(,|$)/g, '$1')
    .replace(/,{2,}/g, ',')
    .replace(/\s+/g, ' ')
    .trim();
}

const OPENAI = process.env.openaitoken || process.env.OPENAI_API_KEY;
if (!OPENAI) {
  console.error('Sem openaitoken');
  process.exit(1);
}

const CASOS = [
  {
    nome: 'Saudação simples',
    historico: [],
    mensagem: 'bom dia',
    espera: { semPontoFinal: true, naoInventarEmpresa: true, contemAlgum: ['cadastro', 'documento', 'pagamento', 'GMX'] },
  },
  {
    nome: 'Small talk (deve redirecionar sem ser robô)',
    historico: [],
    mensagem: 'e aí, como você tá? tá chovendo aqui',
    espera: { semPontoFinal: true, naoContem: ['Como posso ajudar', 'assistente virtual da OpenAI'] },
  },
  {
    nome: 'Pergunta sobre pagamento',
    historico: [],
    mensagem: 'quanto é o adiantamento do frete?',
    espera: {
      semPontoFinal: true,
      contemAlgum: ['90%', 'adiantamento', 'pagamento', 'duas etapas'],
      maxVirgulas: 4,
    },
  },
  {
    nome: 'Após menu — saudação de novo',
    historico: [
      { role: 'assistant', content: 'Olá parceiro, sou o assistente da GMX, consigo te ajudar com cadastro, documentos ou pagamentos' },
    ],
    mensagem: 'oi',
    espera: { semPontoFinal: true, naoContem: ['Como posso ajudar hoje'] },
  },
  {
    nome: 'Cenário 7 — ok inicial',
    historico: [
      {
        role: 'system',
        content:
          '[GMX Equipe]: Estamos atualizando nossa base de parceiros para novas ofertas de frete e vi que seu cadastro precisa de uma confirmação rápida',
      },
    ],
    mensagem: 'ok pode falar',
    espera: {
      semPontoFinal: true,
      contemAlgum: ['vazio', 'carregado', 'disponível', 'disponivel'],
      naoContem: ['Como posso ajudar'],
    },
  },
  {
    nome: 'Pediu foto — recebeu texto',
    historico: [
      { role: 'assistant', content: 'Preciso da foto da sua CNH por favor, pode mandar?' },
    ],
    mensagem: 'minha cnh é 123456789',
    espera: {
      semPontoFinal: true,
      naoContem: ['obrigado pelo envio', 'recebi seu documento', 'analisando'],
      contemAlgum: ['foto', 'imagem', 'arquivo', 'enviar'],
    },
  },
  {
    nome: 'Piada / evasiva documentos',
    historico: [
      { role: 'assistant', content: 'Preciso dos documentos para liberar seu cadastro' },
    ],
    mensagem: 'kkkk opala 76 não tenho documento',
    espera: { semPontoFinal: true, contemAlgum: ['documento', 'cadastro', 'foto'] },
  },
];

function avaliarResposta(texto, espera) {
  const problemas = [];
  const avisos = [];

  if (/\n\s*\n/.test(texto) || (texto.match(/\n/g) || []).length > 1) {
    problemas.push('quebras de linha (não é WhatsApp humano)');
  }
  if (espera.semPontoFinal && /\.\s*$/.test(texto.trim())) {
    problemas.push('termina com ponto final');
  }
  if (espera.semPontoFinal && (texto.match(/\./g) || []).length > 1) {
    problemas.push(`pontos no meio (${(texto.match(/\./g) || []).length})`);
  }
  const virgulas = (texto.match(/,/g) || []).length;
  if (virgulas > (espera.maxVirgulas ?? 3)) problemas.push(`muitas vírgulas (${virgulas}) — spam de bolhas`);
  if (texto.length > 320) problemas.push(`muito longo (${texto.length} chars)`);
  if (/Como posso ajudar/i.test(texto)) problemas.push('frase robótica "Como posso ajudar"');
  if (/assistente virtual da GMX.*assistente virtual/i.test(texto)) problemas.push('texto repetitivo');
  if (/Estamos atualizando nossa base/.test(texto) && espera.naoInventarEmpresa) {
    problemas.push('inventou mensagem da empresa sem histórico');
  }
  if (/prezad[oa]|venho por meio|estou à disposição|agradeço desde já/i.test(texto)) {
    problemas.push('tom corporativo/formal demais');
  }
  if (/CENÁRIO|PASSO \d|ferramenta/i.test(texto)) problemas.push('vazou instrução interna');
  if (/\{[^}]*"ferramenta"/i.test(texto)) problemas.push('vazou JSON de ferramenta');
  if ((texto.match(/🚛|😂|✅|1️⃣/g) || []).length > 2) avisos.push('emoji demais');

  for (const p of espera.naoContem || []) {
    if (texto.toLowerCase().includes(p.toLowerCase())) problemas.push(`contém proibido: "${p}"`);
  }
  if (espera.contemAlgum) {
    const ok = espera.contemAlgum.some((s) => texto.toLowerCase().includes(s.toLowerCase()));
    if (!ok) problemas.push(`faltou: ${espera.contemAlgum.join(' | ')}`);
  }

  return { problemas, avisos, humano: problemas.length === 0 };
}

async function obterPrompt() {
  const res = await fetch('http://127.0.0.1:8095/api/prompt');
  const data = await res.json();
  return data.prompt;
}

async function gerarResposta(prompt, mensagem, historico) {
  const { CAMADA_HUMANA } = await import(`${DIST}/camada-humana.js`).catch(() => ({
    CAMADA_HUMANA: '',
  }));

  const instrucao = `
${typeof CAMADA_HUMANA === 'string' ? CAMADA_HUMANA : ''}
FORMATAÇÃO WHATSAPP:
- Uma linha só, sem enter/parágrafo
- Máximo 3 vírgulas (4 mensagens no máximo)
- NUNCA ponto final (.)
- Tom de conversa entre parceiros de estrada, direto e leve`;

  const messages = [
    { role: 'system', content: `${prompt}\n\n${instrucao}` },
    ...historico,
    { role: 'user', content: mensagem },
  ];

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages,
      temperature: 0.35,
      max_tokens: 512,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data.choices[0].message.content.trim();
}

async function testarStt() {
  console.log('\n=== TESTE STT (Whisper) ===');
  try {
    const { readFileSync, existsSync } = await import('node:fs');
    const paths = ['/tmp/pt-test.wav', '/app/pt-test.wav'];
    let buf = null;
    for (const p of paths) {
      if (existsSync(p)) {
        buf = readFileSync(p);
        break;
      }
    }
    if (!buf) {
      console.log('STT: arquivo pt-test.wav não encontrado — rode espeak no host');
      return { ok: false, motivo: 'sem arquivo' };
    }
    const { transcreverAudio } = await import(`${DIST}/openai.js`);
    const texto = await transcreverAudio(buf, 'audio/wav');
    const ok = texto.length > 3;
    console.log(`STT API: ${ok ? 'OK' : 'FALHOU'} — "${texto}"`);
    return { ok, texto };
  } catch (e) {
    console.log('STT API: FALHOU —', e.message);
    return { ok: false, motivo: e.message };
  }
}

async function main() {
  console.log('=== BATERIA DE TESTES IA GMX ===\n');

  const stt = await testarStt();

  let prompt;
  try {
    prompt = await obterPrompt();
    console.log(`\nPrompt carregado: ${prompt.length} chars`);
  } catch {
    prompt = readFileSync(resolve(ROOT, 'prompt inicial para avaliarmos dificuldade'), 'utf-8');
    console.log(`\nPrompt do arquivo: ${prompt.length} chars`);
  }

  const resultados = [];
  for (const caso of CASOS) {
    process.stdout.write(`\n[${caso.nome}] `);
    try {
      let resposta = await gerarResposta(prompt, caso.mensagem, caso.historico);
      resposta = normalizarRespostaWhatsapp(resposta);
      const aval = avaliarResposta(resposta, caso.espera);
      console.log(aval.humano ? '✓ humano' : '✗ robô');
      console.log(`  → ${resposta.slice(0, 200)}${resposta.length > 200 ? '...' : ''}`);
      if (aval.problemas.length) console.log(`  problemas: ${aval.problemas.join('; ')}`);
      if (aval.avisos.length) console.log(`  avisos: ${aval.avisos.join('; ')}`);
      resultados.push({ ...caso, resposta, ...aval });
    } catch (e) {
      console.log('ERRO:', e.message);
      resultados.push({ ...caso, erro: e.message, humano: false });
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  const humanos = resultados.filter((r) => r.humano).length;
  const total = resultados.length;
  console.log(`\n=== RESUMO: ${humanos}/${total} casos humanos | STT: ${stt.ok ? 'OK' : 'FALHOU'} ===`);

  const todosProblemas = [...new Set(resultados.flatMap((r) => r.problemas || []))];
  if (todosProblemas.length) {
    console.log('\nProblemas recorrentes:');
    for (const p of todosProblemas) console.log(`  - ${p}`);
  }

  // Salva relatório
  const rel = '/tmp/ultimo-relatorio-testes.json';
  const { writeFileSync } = await import('node:fs');
  writeFileSync(rel, JSON.stringify({ stt, resultados, resumo: { humanos, total } }, null, 2));
  console.log(`\nRelatório: ${rel}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
