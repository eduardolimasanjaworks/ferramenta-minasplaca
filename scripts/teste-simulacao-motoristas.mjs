#!/usr/bin/env node
/**
 * Simulação: 10 motoristas IA conversando em paralelo com a assistente GMX.
 * Registra histórico, detecta respostas robóticas e valida ferramentas.
 *
 * Uso: node scripts/teste-simulacao-motoristas.mjs [--qtd=15] [--sequencial] [--paralelo=5] [--pausa=55]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DIST = existsSync('/app/dist/servicos')
  ? '/app/dist/servicos'
  : resolve(ROOT, 'app/dist/servicos');
const OUT_DIR = existsSync('/app/scripts')
  ? '/app/scripts/relatorios-simulacao'
  : resolve(ROOT, 'scripts/relatorios-simulacao');

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

process.env.DIRECTUS_URL = process.env.DIRECTUS_URL || (existsSync('/app/dist') ? 'http://gmx_app:8055' : 'http://127.0.0.1:8057');

const OPENAI = process.env.openaitoken || process.env.OPENAI_API_KEY;
if (!OPENAI) {
  console.error('Sem openaitoken');
  process.exit(1);
}

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  }),
);
const QTD = parseInt(args.qtd ?? '15', 10);
const PARALELO = args.sequencial !== 'true';
const PARALELO_MAX = parseInt(args.paralelo ?? '5', 10);
const PAUSA_TURNO_MS = parseInt(args.pausa ?? (PARALELO ? '8' : '55'), 10) * 1000;
const PAUSA_SIM_MS = parseInt(args['pausa-sim'] ?? '20', 10) * 1000;
const MAX_RETRY = parseInt(args.retry ?? '6', 10);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function ehRateLimit(err) {
  const msg = err instanceof Error ? err.message : String(err);
  return /rate_limit|429|tokens per min/i.test(msg);
}

function extrairEsperaRateLimit(err) {
  const msg = err instanceof Error ? err.message : String(err);
  const m = msg.match(/try again in ([\d.]+)s/i);
  if (m) return Math.ceil(parseFloat(m[1]) * 1000) + 2000;
  return null;
}

/** Retry com backoff exponencial para chamadas que estouram TPM */
async function comRetry(fn, rotulo = 'op') {
  for (let t = 0; t < MAX_RETRY; t++) {
    try {
      return await fn();
    } catch (err) {
      if (!ehRateLimit(err) || t === MAX_RETRY - 1) throw err;
      const espera =
        extrairEsperaRateLimit(err) ?? 12_000 + t * 8_000;
      console.warn(
        `[retry] ${rotulo}: rate limit, aguardando ${(espera / 1000).toFixed(0)}s (${t + 1}/${MAX_RETRY})`,
      );
      await sleep(espera);
    }
  }
  throw new Error(`${rotulo}: esgotou tentativas`);
}

const PERSONAS = [
  { nome: 'João', perfil: 'baiana, direto, quer cadastrar', roteiro: 'Pede cadastro, manda texto no lugar de foto se pressionado, depois aceita mandar foto' },
  { nome: 'Carlos', perfil: 'mineiro, vazio em Campinas', roteiro: 'Responde disponibilidade, diz que está vazio, informa Campinas SP' },
  { nome: 'Pedro', perfil: 'carregado indo pro RJ', roteiro: 'Diz que está carregado, destino Rio de Janeiro, libera sexta-feira' },
  { nome: 'Marcos', perfil: 'negociador duro', roteiro: 'Recebe oferta de frete e contrapõe valores até fechar ou recusar' },
  { nome: 'Ricardo', perfil: 'desconfiado', roteiro: 'Pergunta sobre pagamento e adiantamento antes de confiar' },
  { nome: 'André', perfil: 'engraçado evasivo', roteiro: 'Faz piada quando pedem documento, depois coopera' },
  { nome: 'Fernando', perfil: 'só manda oi', roteiro: 'Manda oi várias vezes sem escolher opção do menu' },
  { nome: 'Luiz', perfil: 'urgente', roteiro: 'Quer carga rápido, pergunta disponibilidade' },
  { nome: 'Paulo', perfil: 'técnico', roteiro: 'Pergunta detalhes de cadastro e documentos' },
  { nome: 'Sérgio', perfil: 'recusa carga', roteiro: 'Recebe oferta e recusa educadamente' },
  { nome: 'Roberto', perfil: 'goiano', roteiro: 'Responde disponibilidade, vazio em Goiânia GO' },
  { nome: 'Márcia', perfil: 'motorista mulher', roteiro: 'Quer cadastro e pergunta documentos necessários' },
  { nome: 'Diego', perfil: 'aceita oferta rápido', roteiro: 'Recebe oferta de frete e aceita sem negociar' },
  { nome: 'Antônio', perfil: 'sulista', roteiro: 'Carregado indo para Porto Alegre, libera segunda' },
  { nome: 'Felipe', perfil: 'curioso', roteiro: 'Pergunta disponibilidade e depois manda só valeu' },
];

const GATILHOS_GMX = {
  disponibilidade:
    '[GMX]: Estamos atualizando nossa base de parceiros para novas ofertas de frete e vi que seu cadastro precisa de uma confirmação rápida',
  oferta:
    '[GMX]: Temos uma carga — retirada Guarulhos SP, entrega Curitiba PR, valor R$ 4.500,00 — você está por onde e tem interesse?',
};

function normalizar(texto) {
  return texto
    .replace(/\r\n/g, '\n')
    .replace(/\n+/g, ', ')
    .replace(/\.\s+/g, ', ')
    .replace(/\.\s*$/g, '')
    .replace(/,{2,}/g, ',')
    .replace(/\s+/g, ' ')
    .trim();
}

function extrairFerramentas(texto) {
  const blocos = [];
  let i = 0;
  while (i < texto.length) {
    const start = texto.indexOf('{"ferramenta"', i);
    if (start === -1) break;
    let depth = 0;
    let end = -1;
    for (let j = start; j < texto.length; j++) {
      if (texto[j] === '{') depth++;
      if (texto[j] === '}') {
        depth--;
        if (depth === 0) {
          end = j + 1;
          break;
        }
      }
    }
    if (end === -1) break;
    try {
      blocos.push(JSON.parse(texto.slice(start, end)));
    } catch { /* */ }
    i = end;
  }
  return blocos;
}

function textoVisivel(texto) {
  let t = texto;
  for (const b of extrairFerramentas(texto)) t = t.replace(JSON.stringify(b), '');
  return normalizar(t);
}

function dividirFragmentos(texto) {
  const limpo = normalizar(texto);
  const partes = limpo.split(',').map((p) => p.trim()).filter(Boolean);
  return partes.length > 0 ? partes : [limpo || 'ok'];
}

function detectarProblemas(respostaBruta, ctx = {}) {
  const visivel = textoVisivel(respostaBruta);
  const fragmentos = dividirFragmentos(visivel);
  const problemas = [];
  const ferramentas = extrairFerramentas(respostaBruta).map((b) => b.ferramenta);

  if (/\.\s*$/.test(visivel) || fragmentos.some((f) => /\.\s*$/.test(f))) {
    problemas.push('ponto_final');
  }
  if (/Como posso ajudar/i.test(visivel)) problemas.push('robotico_como_posso_ajudar');
  if (/prezad[oa]|venho por meio|estou à disposição/i.test(visivel)) problemas.push('tom_formal');
  if (/CENÁRIO|PASSO \d|ferramenta interna/i.test(visivel)) problemas.push('vazou_instrucao');
  if (/\{[^}]*"ferramenta"/.test(visivel)) problemas.push('json_vazou');
  if (visivel.length > 350) problemas.push('muito_longo');
  if (fragmentos.length === 1 && visivel.length > 90) problemas.push('bloco_unico');
  if (fragmentos.length === 1 && visivel.length > 50 && !visivel.includes(',')) {
    problemas.push('sem_fragmentacao');
  }
  if (ctx.esperaFerramenta && !ferramentas.includes(ctx.esperaFerramenta)) {
    problemas.push(`faltou_ferramenta_${ctx.esperaFerramenta}`);
  }
  if (ctx.deveConter?.length) {
    const ok = ctx.deveConter.some((s) => visivel.toLowerCase().includes(s.toLowerCase()));
    if (!ok) problemas.push(`faltou_conteudo:${ctx.deveConter.join('|')}`);
  }

  return { problemas, visivel, ferramentas, fragmentos, robotico: problemas.length > 0 };
}

async function chatOpenAI(messages, temp = 0.7) {
  return comRetry(async () => {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        temperature: temp,
        max_tokens: 180,
      }),
    });
    const data = await res.json();
    if (res.ok) return data.choices[0].message.content.trim();
    if (data.error?.code === 'rate_limit_exceeded') {
      const espera = data.error?.message?.match(/([\d.]+)s/)?.[1];
      const err = new Error(data.error.message || 'rate_limit');
      if (espera) err.esperaMs = Math.ceil(parseFloat(espera) * 1000) + 2000;
      throw err;
    }
    throw new Error(JSON.stringify(data));
  }, 'motorista-ia');
}

async function mensagemMotorista(persona, historico, ultimaGmx) {
  const hist = historico
    .map((h) => `${h.role === 'user' ? 'Motorista' : 'GMX'}: ${h.content}`)
    .join('\n');
  return chatOpenAI([
    {
      role: 'system',
      content: `Você é ${persona.nome}, motorista de caminhão no WhatsApp. ${persona.perfil}.
Roteiro desta simulação: ${persona.roteiro}.
Responda em UMA linha curta, informal, PT-BR, como motorista real. Sem aspas.`,
    },
    {
      role: 'user',
      content: `Histórico:\n${hist || '(início)'}\n\nÚltima msg GMX:\n${ultimaGmx || '(nenhuma)'}\n\nSua próxima mensagem:`,
    },
  ]);
}

async function respostaGmx(telefone, nome, mensagem, historico, promptBase) {
  return comRetry(async () => {
    const { montarPromptSistemaInferencia } = await import(`${DIST}/contexto-inferencia.js`);
    const { gerarRespostaRefinada } = await import(`${DIST}/inferencia-refinada.js`);
    const { processarFerramentas } = await import(`${DIST}/ferramentas.js`);

    const prompt = await montarPromptSistemaInferencia({
      telefone,
      nomeContato: nome,
      mensagemUsuario: mensagem,
      promptBase,
    });

    const hist = historico.map((h) => ({
      role: h.role,
      content: h.content,
    }));

    const { texto, plano, passadas, revisoes } = await gerarRespostaRefinada(
      prompt,
      [mensagem],
      hist,
    );

    const ctxFerr = {
      remoteJid: `${telefone}@s.whatsapp.net`,
      instance: 'gmx-atendimento',
      itens: [{
        tipo: 'texto',
        conteudo: mensagem,
        instance: 'gmx-atendimento',
        remoteJid: `${telefone}@s.whatsapp.net`,
        pushName: nome,
        timestamp: Date.now(),
      }],
    };

    const aposFerramentas = texto.includes('{"ferramenta"')
      ? await processarFerramentas(texto, ctxFerr).catch(() => texto)
      : texto;
    const visivel = normalizar(aposFerramentas);

    return {
      bruto: texto,
      visivel,
      plano,
      passadas,
      revisoes,
      ferramentas: extrairFerramentas(texto).map((b) => b.ferramenta),
    };
  }, `gmx-${telefone}`);
}

async function rodarSimulacao(idx) {
  const { avaliarSeDeveResponder } = await import(`${DIST}/linguagem-motorista-runtime.js`).catch(() => ({
    avaliarSeDeveResponder: async () => ({ encerrar: false }),
  }));

  const persona = PERSONAS[idx % PERSONAS.length];
  const telefone = `5511999${String(1000 + idx).slice(-4)}`;
  const historico = [];
  const log = [];
  const problemasTotais = [];

  let gmxInicial = null;
  if (persona.roteiro.includes('oferta') || persona.roteiro.includes('frete') || persona.roteiro.includes('aceita')) {
    gmxInicial = GATILHOS_GMX.oferta;
  } else if (persona.roteiro.includes('disponibilidade') || persona.roteiro.includes('vazio') || persona.roteiro.includes('carregado')) {
    gmxInicial = GATILHOS_GMX.disponibilidade;
  }

  if (gmxInicial) {
    historico.push({ role: 'assistant', content: gmxInicial });
    log.push({ turno: 0, quem: 'gmx_proativa', texto: gmxInicial });
  }

  const maxTurnos = persona.roteiro.includes('oferta') ? 4 : 5;
  let ultimaGmx = gmxInicial ?? '';

  let totalFragmentos = 0;
  let respostasGmx = 0;

  for (let t = 1; t <= maxTurnos; t++) {
    const msgMotorista = await mensagemMotorista(persona, historico, ultimaGmx);
    historico.push({ role: 'user', content: msgMotorista });
    log.push({ turno: t, quem: 'motorista', texto: msgMotorista });

    const ultimaAssistant = historico
      .slice(0, -1)
      .reverse()
      .find((h) => h.role === 'assistant')?.content;

    const silencio = await avaliarSeDeveResponder(msgMotorista, ultimaAssistant);
    if (silencio.encerrar) {
      log.push({
        turno: t,
        quem: 'gmx',
        texto: null,
        silencio: true,
        motivo: silencio.motivo,
        fragmentos: 0,
      });
      break;
    }

    const resp = await respostaGmx(telefone, persona.nome, msgMotorista, historico.slice(0, -1), promptBase);
    historico.push({ role: 'assistant', content: resp.visivel });
    ultimaGmx = resp.visivel;
    respostasGmx++;

    const ctx = {};
    if (msgMotorista.toLowerCase().includes('campinas') && persona.roteiro.includes('Campinas')) {
      ctx.esperaFerramenta = 'registrar_disponibilidade';
    }
    if (persona.roteiro.includes('recusa') && t >= maxTurnos - 1) {
      ctx.esperaFerramenta = 'resposta_oferta_carga';
    }

    const analise = detectarProblemas(resp.bruto, ctx);
    totalFragmentos += analise.fragmentos.length;
    log.push({
      turno: t,
      quem: 'gmx',
      texto: resp.visivel,
      fragmentos: analise.fragmentos,
      plano: resp.plano,
      passadas: resp.passadas,
      ferramentas: resp.ferramentas,
      problemas: analise.problemas,
    });
    problemasTotais.push(...analise.problemas.map((p) => ({ turno: t, problema: p })));

    if (t < maxTurnos && PAUSA_TURNO_MS > 0) {
      await sleep(PAUSA_TURNO_MS);
    }
  }

  const mediaFragmentos = respostasGmx > 0 ? (totalFragmentos / respostasGmx).toFixed(1) : '0';

  return {
    id: idx + 1,
    persona: persona.nome,
    telefone,
    roteiro: persona.roteiro,
    turnos: log.length,
    mediaFragmentos,
    problemas: problemasTotais,
    historico: log,
    score: Math.max(0, 100 - problemasTotais.length * 12),
  };
}

let promptBase;
try {
  const apiUrl = existsSync('/app/dist') ? 'http://127.0.0.1:8095/api/prompt' : 'http://127.0.0.1:8095/api/prompt';
  const res = await fetch(apiUrl);
  promptBase = (await res.json()).prompt;
} catch {
  promptBase = readFileSync(resolve(ROOT, 'prompt inicial para avaliarmos dificuldade'), 'utf-8');
}

console.log(`\n=== SIMULAÇÃO ${QTD} MOTORISTAS IA × ASSISTENTE GMX ===`);
console.log(
  `Modo: ${PARALELO ? `paralelo (max ${PARALELO_MAX})` : 'sequencial'} | Prompt: ${promptBase.length} chars | pausa turno: ${PAUSA_TURNO_MS / 1000}s | retry: ${MAX_RETRY}\n`,
);

async function executarComPool(indices, limite, fn) {
  const resultados = new Array(indices.length);
  let cursor = 0;
  async function worker(wid) {
    while (cursor < indices.length) {
      const pos = cursor++;
      const i = indices[pos];
      console.log(`[pool ${wid}] Motorista ${i + 1}/${QTD} (${PERSONAS[i % PERSONAS.length].nome})`);
      try {
        resultados[pos] = await fn(i);
      } catch (e) {
        resultados[pos] = {
          id: i + 1,
          persona: PERSONAS[i % PERSONAS.length].nome,
          erro: e instanceof Error ? e.message : String(e),
          problemas: [{ problema: 'erro_fatal' }],
          score: 0,
          historico: [],
        };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, indices.length) }, (_, w) => worker(w + 1)));
  return resultados;
}

mkdirSync(OUT_DIR, { recursive: true });
const inicio = Date.now();

const indices = Array.from({ length: QTD }, (_, i) => i);
let resultados = [];
if (PARALELO) {
  resultados = await executarComPool(indices, PARALELO_MAX, rodarSimulacao);
} else {
  for (const i of indices) {
    console.log(`\n>>> Motorista ${i + 1}/${QTD} (${PERSONAS[i % PERSONAS.length].nome})`);
    try {
      resultados.push(await rodarSimulacao(i));
    } catch (e) {
      console.error(`>>> Motorista ${i + 1} FALHOU:`, e instanceof Error ? e.message : e);
      resultados.push({
        id: i + 1,
        persona: PERSONAS[i % PERSONAS.length].nome,
        erro: e instanceof Error ? e.message : String(e),
        problemas: [{ problema: 'erro_fatal' }],
        score: 0,
        historico: [],
      });
    }
    if (i < indices.length - 1) {
      console.log(`>>> Pausa entre simulações: ${PAUSA_SIM_MS / 1000}s`);
      await sleep(PAUSA_SIM_MS);
    }
  }
}

const todosProblemas = resultados.flatMap((r) => r.problemas ?? []);
const contagem = {};
for (const p of todosProblemas) {
  const k = p.problema ?? p;
  contagem[k] = (contagem[k] ?? 0) + 1;
}

const scoreMedio = resultados.reduce((s, r) => s + (r.score ?? 0), 0) / resultados.length;
const mediaFragGeral =
  resultados.filter((r) => r.mediaFragmentos).reduce((s, r) => s + parseFloat(r.mediaFragmentos), 0) /
    Math.max(1, resultados.filter((r) => r.mediaFragmentos).length);

console.log('--- RESUMO ---');
for (const r of resultados) {
  const n = (r.problemas ?? []).length;
  const frag = r.mediaFragmentos ? ` frag médio ${r.mediaFragmentos}` : '';
  const sil = (r.historico ?? []).some((h) => h.silencio) ? ' [silêncio ok]' : '';
  console.log(`  #${r.id} ${r.persona ?? '?'} — score ${r.score ?? 0} — ${n} problema(s)${frag}${sil}${r.erro ? ` ERRO: ${r.erro}` : ''}`);
}
console.log(`\nScore médio: ${scoreMedio.toFixed(0)}/100 | Fragmentos médios/msg: ${mediaFragGeral.toFixed(1)}`);
console.log('Problemas mais frequentes:');
for (const [k, v] of Object.entries(contagem).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k}: ${v}x`);
}

const relatorio = {
  geradoEm: new Date().toISOString(),
  duracaoSeg: ((Date.now() - inicio) / 1000).toFixed(1),
  qtd: QTD,
  scoreMedio,
  contagemProblemas: contagem,
  simulacoes: resultados,
};

const arquivo = resolve(OUT_DIR, `simulacao-${Date.now()}.json`);
writeFileSync(arquivo, JSON.stringify(relatorio, null, 2));
console.log(`\nRelatório: ${arquivo}`);
process.exit(todosProblemas.length > QTD * 2 ? 1 : 0);
