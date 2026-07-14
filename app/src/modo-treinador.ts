import pg from 'pg';
import { config } from './config.js';
import { obterPromptBruto, salvarPrompt } from './prompt-minasplaca.js';

const pool = new pg.Pool({ connectionString: config.databaseUrl });
const BLOCO_LIVRE = 'PROMPT LIVRE';

export type OperacaoTreinador = 'replace_trecho' | 'append_bloco' | 'prepend_bloco';
export type ModoAlvoTreinador = 'livre' | 'bloco';

export interface PatchTreinadorEntrada {
  bloco: string;
  modoAlvo?: ModoAlvoTreinador;
  operacao: OperacaoTreinador;
  trechoAlvo?: string | null;
  textoProposto: string;
  resumo: string;
  autor: string;
  origem: string;
}

export interface PatchTreinadorRegistro {
  id: number;
  tipo: 'prompt';
  bloco: string;
  modo_alvo?: ModoAlvoTreinador;
  operacao: OperacaoTreinador;
  trecho_alvo: string | null;
  texto_proposto: string;
  resumo: string;
  prompt_antes: string;
  prompt_depois: string;
  autor: string;
  origem: string;
  status: 'pendente' | 'aprovado' | 'rejeitado';
  criado_em: string;
  decidido_em: string | null;
  decidido_por: string | null;
  preview_antes?: string;
  preview_depois?: string;
}

export interface PromptBloco {
  nome: string;
  texto: string;
}

export interface PatchTreinadorSimulado {
  bloco: string;
  modo_alvo: ModoAlvoTreinador;
  operacao: OperacaoTreinador;
  trecho_alvo: string | null;
  texto_proposto: string;
  resumo: string;
  prompt_antes: string;
  prompt_depois: string;
  preview_antes: string;
  preview_depois: string;
}

export async function inicializarModoTreinador(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS modo_treinador_patches (
      id SERIAL PRIMARY KEY,
      tipo TEXT NOT NULL,
      bloco TEXT NOT NULL,
      operacao TEXT NOT NULL,
      trecho_alvo TEXT,
      texto_proposto TEXT NOT NULL,
      resumo TEXT NOT NULL,
      prompt_antes TEXT NOT NULL,
      prompt_depois TEXT NOT NULL,
      autor TEXT NOT NULL,
      origem TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pendente',
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      decidido_em TIMESTAMPTZ,
      decidido_por TEXT
    )
  `);
}

export function quebrarPromptEmBlocos(prompt: string): PromptBloco[] {
  const linhas = prompt.split(/\r?\n/);
  const blocos: PromptBloco[] = [];
  let atual: PromptBloco | null = null;
  let bufferSolto: string[] = [];

  function flushSolto() {
    const texto = bufferSolto.join('\n').trim();
    if (!texto) return;
    blocos.push({ nome: BLOCO_LIVRE, texto });
    bufferSolto = [];
  }

  for (const linha of linhas) {
    const m = linha.match(/^===\s*BLOCO:\s*(.+?)\s*===\s*$/i);
    if (m) {
      flushSolto();
      if (atual) {
        blocos.push({ nome: atual.nome, texto: atual.texto.replace(/\s+$/, '') });
      }
      atual = { nome: m[1].trim(), texto: '' };
    } else if (atual) {
      atual.texto += (atual.texto ? '\n' : '') + linha;
    } else {
      bufferSolto.push(linha);
    }
  }

  if (atual) {
    blocos.push({ nome: atual.nome, texto: atual.texto.replace(/\s+$/, '') });
  }
  flushSolto();

  if (!blocos.length) {
    return [{ nome: BLOCO_LIVRE, texto: prompt }];
  }

  return blocos;
}

export function montarPromptDeBlocos(blocos: PromptBloco[]): string {
  return blocos
    .map((b) => {
      if (b.nome === BLOCO_LIVRE) return b.texto.trim();
      return `=== BLOCO: ${b.nome} ===\n${b.texto.trim()}`;
    })
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

function aplicarPatchTexto(textoAtual: string, entrada: PatchTreinadorEntrada): string {
  const atual = String(textoAtual ?? '');
  const proposto = String(entrada.textoProposto ?? '').trim();
  const trecho = String(entrada.trechoAlvo ?? '').trim();

  if (!proposto) {
    throw new Error('textoProposto é obrigatório.');
  }

  if (entrada.operacao === 'replace_trecho') {
    if (!trecho) {
      throw new Error('trechoAlvo é obrigatório para replace_trecho.');
    }
    if (!atual.includes(trecho)) {
      throw new Error('trechoAlvo não foi encontrado no texto selecionado.');
    }
    return atual.replace(trecho, proposto);
  }

  if (entrada.operacao === 'prepend_bloco') {
    return proposto + (atual.trim() ? '\n\n' + atual : '');
  }

  return atual.trim() ? atual + '\n\n' + proposto : proposto;
}

function detectarModoAlvo(entrada: PatchTreinadorEntrada): ModoAlvoTreinador {
  if (entrada.modoAlvo === 'bloco' || entrada.modoAlvo === 'livre') return entrada.modoAlvo;
  const bloco = String(entrada.bloco || '').trim().toUpperCase();
  if (!bloco || bloco === 'GERAL' || bloco === BLOCO_LIVRE) return 'livre';
  return 'bloco';
}

function localizarBloco(blocos: PromptBloco[], nome: string): PromptBloco | null {
  return blocos.find((b) => b.nome.toLowerCase() === nome.toLowerCase()) || null;
}

function localizarJanelaLivre(texto: string, destaque: string): string {
  const alvo = String(destaque || '').trim();
  if (!alvo) return texto.slice(0, 1200);
  const idx = texto.indexOf(alvo);
  if (idx < 0) return texto.slice(0, 1200);
  const margem = 600;
  const inicio = Math.max(0, idx - margem);
  const fim = Math.min(texto.length, idx + alvo.length + margem);
  return texto.slice(inicio, fim);
}

export async function criarPatchPrompt(entrada: PatchTreinadorEntrada): Promise<PatchTreinadorRegistro> {
  await inicializarModoTreinador();
  const simulacao = await simularPatchPrompt(entrada);

  const res = await pool.query<PatchTreinadorRegistro>(
    `INSERT INTO modo_treinador_patches (
       tipo, bloco, operacao, trecho_alvo, texto_proposto, resumo,
       prompt_antes, prompt_depois, autor, origem, status
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pendente')
     RETURNING *`,
    [
      'prompt',
      simulacao.bloco,
      entrada.operacao,
      entrada.trechoAlvo ?? null,
      entrada.textoProposto,
      entrada.resumo,
      simulacao.prompt_antes,
      simulacao.prompt_depois,
      entrada.autor,
      entrada.origem,
    ],
  );

  const patch = normalizarRegistro(res.rows[0]);
  patch.modo_alvo = simulacao.modo_alvo;
  patch.preview_antes = simulacao.preview_antes;
  patch.preview_depois = simulacao.preview_depois;
  return patch;
}

export async function simularPatchPrompt(entrada: PatchTreinadorEntrada): Promise<PatchTreinadorSimulado> {
  const promptAtual = await obterPromptBruto();
  const modoAlvo = detectarModoAlvo(entrada);

  if (modoAlvo === 'livre') {
    const promptNovo = aplicarPatchTexto(promptAtual, { ...entrada, bloco: BLOCO_LIVRE });
    const previewAntes =
      entrada.operacao === 'replace_trecho' && entrada.trechoAlvo
        ? localizarJanelaLivre(promptAtual, entrada.trechoAlvo)
        : entrada.operacao === 'prepend_bloco'
          ? promptAtual.slice(0, 1200)
          : promptAtual.slice(-1200);
    const previewDepois =
      entrada.operacao === 'replace_trecho'
        ? localizarJanelaLivre(promptNovo, entrada.textoProposto)
        : entrada.operacao === 'prepend_bloco'
          ? promptNovo.slice(0, 1200)
          : promptNovo.slice(-1200);
    return {
      bloco: BLOCO_LIVRE,
      modo_alvo: 'livre',
      operacao: entrada.operacao,
      trecho_alvo: entrada.trechoAlvo ?? null,
      texto_proposto: entrada.textoProposto,
      resumo: entrada.resumo,
      prompt_antes: promptAtual,
      prompt_depois: promptNovo,
      preview_antes: previewAntes,
      preview_depois: previewDepois,
    };
  }

  const blocos = quebrarPromptEmBlocos(promptAtual);
  const alvoNome = entrada.bloco || BLOCO_LIVRE;
  const alvo = localizarBloco(blocos, alvoNome);
  if (!alvo) {
    throw new Error(`Bloco "${entrada.bloco}" não encontrado no prompt atual.`);
  }
  const blocosNovos = blocos.map((b) => ({ ...b }));
  const idx = blocosNovos.findIndex((b) => b.nome.toLowerCase() === alvoNome.toLowerCase());
  blocosNovos[idx] = { ...blocosNovos[idx], texto: aplicarPatchTexto(blocosNovos[idx].texto, entrada) };
  const promptNovo = montarPromptDeBlocos(blocosNovos);
  return {
    bloco: entrada.bloco,
    modo_alvo: 'bloco',
    operacao: entrada.operacao,
    trecho_alvo: entrada.trechoAlvo ?? null,
    texto_proposto: entrada.textoProposto,
    resumo: entrada.resumo,
    prompt_antes: promptAtual,
    prompt_depois: promptNovo,
    preview_antes: alvo.texto,
    preview_depois: blocosNovos[idx].texto,
  };
}

export async function listarBlocosPromptAtual(): Promise<PromptBloco[]> {
  const promptAtual = await obterPromptBruto();
  return quebrarPromptEmBlocos(promptAtual);
}

function normalizarRegistro(row: PatchTreinadorRegistro): PatchTreinadorRegistro {
  const modoAlvo = row.modo_alvo || (String(row.bloco || '').toUpperCase() === BLOCO_LIVRE ? 'livre' : 'bloco');
  let previewAntes = row.prompt_antes;
  let previewDepois = row.prompt_depois;

  if (modoAlvo === 'bloco') {
    const blocoAntes = quebrarPromptEmBlocos(row.prompt_antes).find(
      (b) => b.nome.toLowerCase() === row.bloco.toLowerCase(),
    );
    const blocoDepois = quebrarPromptEmBlocos(row.prompt_depois).find(
      (b) => b.nome.toLowerCase() === row.bloco.toLowerCase(),
    );
    previewAntes = blocoAntes?.texto ?? row.prompt_antes;
    previewDepois = blocoDepois?.texto ?? row.prompt_depois;
  } else if (row.operacao === 'replace_trecho' && row.trecho_alvo) {
    previewAntes = localizarJanelaLivre(row.prompt_antes, row.trecho_alvo);
    previewDepois = localizarJanelaLivre(row.prompt_depois, row.texto_proposto);
  } else if (row.operacao === 'prepend_bloco') {
    previewAntes = row.prompt_antes.slice(0, 1200);
    previewDepois = row.prompt_depois.slice(0, 1200);
  } else {
    previewAntes = row.prompt_antes.slice(-1200);
    previewDepois = row.prompt_depois.slice(-1200);
  }

  return {
    ...row,
    status: row.status as PatchTreinadorRegistro['status'],
    modo_alvo: modoAlvo,
    preview_antes: previewAntes,
    preview_depois: previewDepois,
  };
}

export async function listarPatches(status?: 'pendente' | 'aprovado' | 'rejeitado'): Promise<
  PatchTreinadorRegistro[]
> {
  await inicializarModoTreinador();
  const params: unknown[] = [];
  let where = '';
  if (status) {
    where = 'WHERE status = $1';
    params.push(status);
  }
  const res = await pool.query<PatchTreinadorRegistro>(
    `SELECT * FROM modo_treinador_patches ${where} ORDER BY criado_em DESC, id DESC LIMIT 100`,
    params,
  );
  return res.rows.map(normalizarRegistro);
}

export async function obterPatch(id: number): Promise<PatchTreinadorRegistro | null> {
  await inicializarModoTreinador();
  const res = await pool.query<PatchTreinadorRegistro>(
    'SELECT * FROM modo_treinador_patches WHERE id = $1 LIMIT 1',
    [id],
  );
  return res.rows[0] ? normalizarRegistro(res.rows[0]) : null;
}

export async function aprovarPatch(id: number, usuario: string): Promise<PatchTreinadorRegistro> {
  await inicializarModoTreinador();
  const atual = await obterPatch(id);
  if (!atual) throw new Error('Patch não encontrado.');
  if (atual.status !== 'pendente') throw new Error('Patch já foi decidido.');
  if (atual.tipo !== 'prompt') throw new Error('Tipo de patch não suportado.');

  await salvarPrompt(atual.prompt_depois);

  const res = await pool.query<PatchTreinadorRegistro>(
    `UPDATE modo_treinador_patches
     SET status = 'aprovado', decidido_em = NOW(), decidido_por = $2
     WHERE id = $1
     RETURNING *`,
    [id, usuario],
  );
  return normalizarRegistro(res.rows[0]);
}

export async function rejeitarPatch(id: number, usuario: string): Promise<PatchTreinadorRegistro> {
  await inicializarModoTreinador();
  const atual = await obterPatch(id);
  if (!atual) throw new Error('Patch não encontrado.');
  if (atual.status !== 'pendente') throw new Error('Patch já foi decidido.');

  const res = await pool.query<PatchTreinadorRegistro>(
    `UPDATE modo_treinador_patches
     SET status = 'rejeitado', decidido_em = NOW(), decidido_por = $2
     WHERE id = $1
     RETURNING *`,
    [id, usuario],
  );
  return normalizarRegistro(res.rows[0]);
}

