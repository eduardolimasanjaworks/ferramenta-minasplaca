/**
 * Formata a resposta do treinador para WhatsApp.
 * Amigavel, curta, com emojis e nomes humanos para os alvos.
 * Sem termos tecnicos (lexical, vetorial, score, nomes internos).
 */
import type { TrechoTreinamentoRelacionado } from './treinamento-config-busca.js';
import type { PreviewPatchTreinamento } from './treinamento-config-lote.js';

function resumir(texto: string, limite = 420): string {
  const base = String(texto || '').trim();
  return base.length <= limite ? base : `${base.slice(0, limite - 3)}...`;
}

function nomeAlvoAmigavel(alvo: string, chave: string | null): string {
  const nomes: Record<string, string> = {
    prompt_sistema: 'Prompt principal',
    orquestracao_texto: 'Regras de tom e formatacao',
    mensagens_fluxo: 'Mensagens do fluxo',
    ocr_prompt: 'Prompt de OCR',
    ocr_prompt_forcado: 'Prompt OCR forcado',
    ocr_documentos_schema: 'Documentos OCR',
  };
  const base = nomes[alvo] || alvo;
  if (alvo === 'orquestracao_texto' && chave) {
    if (chave === 'camadaHumana') return 'Regras de tom e WhatsApp';
    if (chave === 'instrucaoFormatacao') return 'Formatacao de mensagens';
  }
  if (alvo === 'mensagens_fluxo' && chave) return `Mensagem: ${chave}`;
  if (alvo === 'ocr_documentos_schema' && chave) return `Documento OCR: ${chave}`;
  return base;
}

export function montarResumoPreviewTexto(
  previews: PreviewPatchTreinamento[],
  campo: 'antes' | 'depois',
): string {
  return previews
    .map((item) => {
      const titulo = nomeAlvoAmigavel(item.alvo, item.chave);
      return `[${titulo}]\n${resumir(item[campo], 700)}`;
    })
    .join('\n\n');
}

function extrairLinhasRelevantes(texto: string, limite = 5): string {
  const linhas = String(texto || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  return linhas.slice(0, limite).join('\n');
}

export function montarRespostaHumanaPatch(opts: {
  id?: number;
  resumo: string;
  justificativa?: string | null;
  perguntaConfirmacao?: string | null;
  trechos: TrechoTreinamentoRelacionado[];
  previews: PreviewPatchTreinamento[];
}): string {
  const linhas: string[] = [];

  linhas.push(`*Encontrado!* 🔍 Analisei as instrucoes atuais...`);
  linhas.push('');
  linhas.push(`Encontrei os trechos relacionados ao seu pedido. ${opts.resumo}`);

  if (opts.justificativa) {
    linhas.push(opts.justificativa);
  }

  if (opts.previews.length) {
    for (const item of opts.previews.slice(0, 3)) {
      const nome = nomeAlvoAmigavel(item.alvo, item.chave);
      linhas.push('');
      linhas.push(`*${nome}*`);
      linhas.push('');
      linhas.push('*COMO ESTA HOJE:*');
      linhas.push(extrairLinhasRelevantes(item.antes, 4));
      linhas.push('');
      linhas.push('*COMO VAI FICAR:*');
      linhas.push(extrairLinhasRelevantes(item.depois, 4));
    }
  }

  linhas.push('');
  linhas.push(
    opts.perguntaConfirmacao ||
      (opts.id
        ? `Posso confirmar e aplicar essa atualizacao? 👍\n\nResponda "Confirmar patch #${opts.id}" ou "Cancelar patch #${opts.id}".`
        : 'Posso confirmar e aplicar essa atualizacao? 👍'),
  );

  return linhas.join('\n');
}
