#!/usr/bin/env node
/**
 * Extrai intenções e frases de exemplo dos docs referencia-atendimento.
 * Gera catálogo JSON para Qdrant (apoio semântico, não lista fechada).
 *
 * Uso: node scripts/extrair-intencoes-referencia.mjs [--indexar]
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const REF_DIR = resolve(ROOT, 'docs/referencia-atendimento');
const OUT_JSON = resolve(ROOT, 'data/intencoes-referencia-atendimento.json');
const OUT_CATALOG = resolve(ROOT, 'data/catalogo-intencoes-referencia.md');
const DIST = resolve(ROOT, 'app/dist/servicos');

const INDEXAR = process.argv.includes('--indexar');

/** Mapeia arquivo → intenção principal */
const INTENCAO_POR_ARQUIVO = {
  '01-localizacao': 'localizacao',
  '02-disponibilidade-vazio-carregado': 'disponibilidade',
  '03-agenda-quando-libera': 'agenda_liberacao',
  '04-oferta-carga': 'oferta',
  '05-negociacao-frete': 'negociacao',
  '06-cadastro-documentos': 'cadastro',
  '07-negociacao-portal-rotas': 'negociacao',
};

function inferirAcao(secao, nota) {
  const t = `${secao}\n${nota}`.toLowerCase();
  if (/não avançar|não chamar ferramenta|fiquei na dúvida|pergunt/.test(t)) return 'perguntar';
  if (/grava_ocr|cnh|crlv|antt|documento|foto/.test(t)) return 'pedir_documento';
  if (/registrar_disponibilidade|vazio|carregado|localiza/.test(t)) return 'registrar_disponibilidade';
  if (/resposta_oferta|aceite|oferta/.test(t)) return 'oferta';
  if (/escalon|humano|operador/.test(t)) return 'escalonar_humano';
  if (/canhoto|comprovante/.test(t)) return 'canhoto';
  if (/troca|veículo|caminhão|carreta|cavalo/.test(t)) return 'perguntar_veiculo';
  return 'interpretar_contexto';
}

function parseMarkdown(arquivo, conteudo) {
  const slug = basename(arquivo, '.md');
  if (slug === 'README') return { intencaoDoc: null, exemplos: [], secoes: [] };

  const intencaoDoc = INTENCAO_POR_ARQUIVO[slug] ?? slug.replace(/^\d+-/, '');
  const linhas = conteudo.split('\n');
  const exemplos = [];
  const secoes = [];
  let secaoAtual = intencaoDoc;
  let bufferNota = [];

  for (const linha of linhas) {
    if (/^##\s+/.test(linha)) {
      secaoAtual = linha.replace(/^##\s+/, '').trim();
      bufferNota = [];
      secoes.push({ titulo: secaoAtual, intencao: intencaoDoc });
      continue;
    }
    if (/^###\s+/.test(linha)) {
      secaoAtual = linha.replace(/^###\s+/, '').trim();
      continue;
    }
    if (/^-\s+/.test(linha) || /^\*\*/.test(linha)) {
      bufferNota.push(linha.replace(/^-\s+/, '').trim());
    }

    const mMotorista = linha.match(/^Motorista:\s*(.+)/i);
    if (mMotorista) {
      let texto = mMotorista[1].trim();
      if (texto.startsWith('[') && texto.includes('anexo')) {
        texto = texto.replace(/\[anexo:[^\]]+\]/i, '[anexo mídia]').trim();
      }
      if (texto.length < 3 || texto.length > 180) continue;
      const nota = bufferNota.slice(-3).join(' ').slice(0, 300);
      exemplos.push({
        texto,
        intencao: intencaoDoc,
        secao: secaoAtual,
        acao_recomendada: inferirAcao(secaoAtual, nota),
        nota: nota || `Referência: ${slug} — ${secaoAtual}`,
        fonte: slug,
      });
    }
  }

  return { intencaoDoc, exemplos, secoes };
}

const arquivos = readdirSync(REF_DIR).filter((f) => f.endsWith('.md'));
const todosExemplos = [];
const catalogo = [];

for (const arq of arquivos) {
  const conteudo = readFileSync(resolve(REF_DIR, arq), 'utf-8');
  const parsed = parseMarkdown(arq, conteudo);
  if (!parsed.intencaoDoc) continue;

  catalogo.push({
    arquivo: arq,
    intencao: parsed.intencaoDoc,
    secoes: parsed.secoes.length,
    exemplos: parsed.exemplos.length,
  });
  todosExemplos.push(...parsed.exemplos);
}

const unicos = new Map();
for (const e of todosExemplos) {
  const chave = e.texto.toLowerCase().slice(0, 100);
  if (!unicos.has(chave)) unicos.set(chave, e);
}

const saida = {
  geradoEm: new Date().toISOString(),
  fonte: 'docs/referencia-atendimento',
  total: unicos.size,
  catalogo,
  exemplos: [...unicos.values()],
};

writeFileSync(OUT_JSON, JSON.stringify(saida, null, 2));

let md = `# Catálogo de intenções — referencia-atendimento\n\n`;
md += `Gerado em ${saida.geradoEm}\n\n`;
md += `| Doc | Intenção | Exemplos |\n|-----|----------|----------|\n`;
for (const c of catalogo) {
  md += `| ${c.arquivo} | ${c.intencao} | ${c.exemplos} |\n`;
}
md += `\n## Amostra por intenção\n\n`;
const porIntencao = new Map();
for (const e of saida.exemplos) {
  if (!porIntencao.has(e.intencao)) porIntencao.set(e.intencao, []);
  porIntencao.get(e.intencao).push(e);
}
for (const [int, items] of porIntencao) {
  md += `### ${int}\n`;
  for (const item of items.slice(0, 8)) {
    md += `- "${item.texto}" → \`${item.acao_recomendada}\`\n`;
  }
  md += '\n';
}
writeFileSync(OUT_CATALOG, md);

console.log(`Extraídos ${saida.exemplos.length} exemplos → ${OUT_JSON}`);
console.log(`Catálogo → ${OUT_CATALOG}`);

if (INDEXAR) {
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

  const { indexarPontosLinguagem } = await import(`${DIST}/qdrant-linguagem.js`);
  const pontos = saida.exemplos.map((e) => ({
    texto: e.texto,
    intencao: e.intencao,
    tipo: 'apoio_intencao',
    acao_recomendada: e.acao_recomendada,
    nota: `${e.nota} [ref:${e.fonte}]`,
    encerramento: false,
  }));

  const BATCH = 15;
  let total = 0;
  for (let i = 0; i < pontos.length; i += BATCH) {
    total += await indexarPontosLinguagem(pontos.slice(i, i + BATCH));
    console.log(`  Qdrant ${Math.min(i + BATCH, pontos.length)}/${pontos.length}`);
    await new Promise((r) => setTimeout(r, 800));
  }
  console.log(`Indexados ${total} pontos de referência no Qdrant`);
}
