/**
 * Gera propostas de patch para configuracoes reais da IA.
 * Permite conversar sobre trocas Y -> Z sem editar no escuro.
 * Mantem confirmacao explicita antes de aplicar qualquer mudanca estrutural.
 */
import pg from 'pg';
import { config } from '../config.js';
import { chatCompletionRaw } from './chat-providers.js';
import {
  aplicarPatchTreinamento,
  montarResumoAlvosTreinamento,
  simularPatchTreinamento,
  type AlvoPatchTreinamento,
  type OperacaoPatchTreinamento,
  type PatchTreinamentoAplicavel,
} from './treinamento-config-alvos.js';

const pool = new pg.Pool({ connectionString: config.databaseUrl });

export interface PatchConfiguracaoPendente {
  id: number;
  canal: string;
  telefone_autor: string;
  nome_autor: string | null;
  alvo: AlvoPatchTreinamento;
  chave_alvo: string | null;
  operacao: OperacaoPatchTreinamento;
  trecho_atual: string | null;
  texto_proposto: string;
  resumo: string;
  justificativa: string | null;
  pergunta_confirmacao: string | null;
  preview_antes: string;
  preview_depois: string;
  origem_texto: string;
  status: 'pendente' | 'aprovado' | 'cancelado';
  confirmado_por: string | null;
  criado_em: string;
  atualizado_em: string;
}

interface PatchConfiguracaoSugerido extends PatchTreinamentoAplicavel {
  resumo: string;
  justificativa?: string;
  perguntaConfirmacao?: string;
}

function telefoneSeguro(valor?: string): string {
  return String(valor || '').replace(/\D/g, '') || 'dashboard';
}

function cortar(texto: string, limite = 900): string {
  const sane = String(texto || '').trim();
  return sane.length <= limite ? sane : `${sane.slice(0, limite)}...`;
}

export async function inicializarTreinamentoConfigPatches(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_config_patches_pendentes (
      id SERIAL PRIMARY KEY,
      canal TEXT NOT NULL DEFAULT 'whatsapp',
      telefone_autor TEXT NOT NULL,
      nome_autor TEXT,
      alvo TEXT NOT NULL,
      chave_alvo TEXT,
      operacao TEXT NOT NULL,
      trecho_atual TEXT,
      texto_proposto TEXT NOT NULL,
      resumo TEXT NOT NULL,
      justificativa TEXT,
      pergunta_confirmacao TEXT,
      preview_antes TEXT NOT NULL,
      preview_depois TEXT NOT NULL,
      origem_texto TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pendente',
      confirmado_por TEXT,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function sugerirPatchPorTexto(texto: string): Promise<PatchConfiguracaoSugerido> {
  const contexto = await montarResumoAlvosTreinamento();
  const resposta = await chatCompletionRaw(
    [
      {
        role: 'system',
        content:
          'Voce e um editor tecnico da GMX. Leia os alvos reais de configuracao e proponha um patch objetivo. Responda SOMENTE JSON com {"alvo":"prompt_sistema|orquestracao_texto|mensagens_fluxo","chave":"... ou null","operacao":"replace|append|prepend","trechoAtual":"...","textoProposto":"...","resumo":"...","justificativa":"...","perguntaConfirmacao":"..."}. Use replace quando o pedido falar em trocar, corrigir ou substituir trecho. Use append para redundancia/reforco. Se o alvo for mensagens_fluxo, a chave deve ser um nome real do catalogo. Se o alvo for orquestracao_texto, a chave deve ser camadaHumana ou instrucaoFormatacao.',
      },
      {
        role: 'user',
        content: `${contexto}\n\n=== PEDIDO DO TREINADOR ===\n${texto}`,
      },
    ],
    { temperature: 0.15, max_tokens: 900 },
  );
  const match = resposta.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Nao consegui estruturar a proposta de patch');
  const parsed = JSON.parse(match[0]) as Record<string, unknown>;
  const patch: PatchConfiguracaoSugerido = {
    alvo: String(parsed.alvo || 'prompt_sistema') as AlvoPatchTreinamento,
    chave: parsed.chave ? String(parsed.chave) : null,
    operacao: String(parsed.operacao || 'append') as OperacaoPatchTreinamento,
    trechoAtual: parsed.trechoAtual ? String(parsed.trechoAtual) : null,
    textoProposto: String(parsed.textoProposto || '').trim(),
    resumo: String(parsed.resumo || '').trim(),
    justificativa: parsed.justificativa ? String(parsed.justificativa) : '',
    perguntaConfirmacao: parsed.perguntaConfirmacao ? String(parsed.perguntaConfirmacao) : '',
  };
  if (!patch.textoProposto || !patch.resumo) {
    throw new Error('A proposta veio incompleta para aplicar no treinador');
  }
  return patch;
}

export async function criarPropostaPatchConfiguracao(opts: {
  texto: string;
  telefoneAutor?: string;
  nomeAutor?: string;
  canal?: 'whatsapp' | 'dashboard';
}): Promise<PatchConfiguracaoPendente> {
  await inicializarTreinamentoConfigPatches();
  const patch = await sugerirPatchPorTexto(opts.texto);
  const aplicado = await simularPatchTreinamento(
    {
      alvo: patch.alvo,
      chave: patch.chave,
      operacao: patch.operacao,
      trechoAtual: patch.trechoAtual,
      textoProposto: patch.textoProposto,
    },
  ).catch((error) => {
    throw new Error(error instanceof Error ? error.message : 'Falha ao montar preview do patch');
  });
  const res = await pool.query<PatchConfiguracaoPendente>(
    `INSERT INTO whatsapp_config_patches_pendentes (
      canal, telefone_autor, nome_autor, alvo, chave_alvo, operacao, trecho_atual,
      texto_proposto, resumo, justificativa, pergunta_confirmacao, preview_antes,
      preview_depois, origem_texto, status, atualizado_em
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'pendente',NOW())
    RETURNING *`,
    [
      opts.canal || 'whatsapp',
      telefoneSeguro(opts.telefoneAutor),
      opts.nomeAutor?.trim() || null,
      patch.alvo,
      patch.chave || null,
      patch.operacao,
      patch.trechoAtual || null,
      patch.textoProposto,
      patch.resumo,
      patch.justificativa || null,
      patch.perguntaConfirmacao || null,
      cortar(aplicado.antes),
      cortar(aplicado.depois),
      opts.texto.trim(),
    ],
  );
  return res.rows[0];
}

export async function listarPatchesConfiguracaoPendentes(): Promise<PatchConfiguracaoPendente[]> {
  await inicializarTreinamentoConfigPatches();
  const res = await pool.query<PatchConfiguracaoPendente>(
    'SELECT * FROM whatsapp_config_patches_pendentes ORDER BY criado_em DESC, id DESC LIMIT 80',
  );
  return res.rows;
}

export async function obterUltimoPatchPendentePorTelefone(
  telefone: string,
): Promise<PatchConfiguracaoPendente | null> {
  await inicializarTreinamentoConfigPatches();
  const res = await pool.query<PatchConfiguracaoPendente>(
    `SELECT * FROM whatsapp_config_patches_pendentes
     WHERE telefone_autor = $1 AND status = 'pendente'
     ORDER BY criado_em DESC, id DESC LIMIT 1`,
    [telefoneSeguro(telefone)],
  );
  return res.rows[0] ?? null;
}

export async function obterPatchPendentePorId(id: number): Promise<PatchConfiguracaoPendente | null> {
  await inicializarTreinamentoConfigPatches();
  const res = await pool.query<PatchConfiguracaoPendente>(
    'SELECT * FROM whatsapp_config_patches_pendentes WHERE id = $1 LIMIT 1',
    [id],
  );
  return res.rows[0] ?? null;
}

export async function aprovarPatchConfiguracao(id: number, confirmadoPor: string) {
  const patch = await obterPatchPendentePorId(id);
  if (!patch) throw new Error('Patch pendente nao encontrado');
  if (patch.status !== 'pendente') throw new Error('O patch ja foi encerrado');
  await aplicarPatchTreinamento(
    {
      alvo: patch.alvo,
      chave: patch.chave_alvo,
      operacao: patch.operacao,
      trechoAtual: patch.trecho_atual,
      textoProposto: patch.texto_proposto,
    },
    `treinador_patch:${confirmadoPor}`,
  );
  await pool.query(
    `UPDATE whatsapp_config_patches_pendentes
     SET status = 'aprovado', confirmado_por = $2, atualizado_em = NOW()
     WHERE id = $1`,
    [id, confirmadoPor],
  );
}

export async function cancelarPatchConfiguracao(id: number, confirmadoPor: string) {
  const patch = await obterPatchPendentePorId(id);
  if (!patch) throw new Error('Patch pendente nao encontrado');
  if (patch.status !== 'pendente') throw new Error('O patch ja foi encerrado');
  await pool.query(
    `UPDATE whatsapp_config_patches_pendentes
     SET status = 'cancelado', confirmado_por = $2, atualizado_em = NOW()
     WHERE id = $1`,
    [id, confirmadoPor],
  );
}
