/**
 * Formata a resposta do treinador com trechos encontrados e previews comparativos.
 * Reaproveita a mesma narrativa no WhatsApp e no painel do /phone.
 * Mantem o texto objetivo, mas com cara de conversa humana de operador.
 */
import type { TrechoTreinamentoRelacionado } from './treinamento-config-busca.js';
import type { PreviewPatchTreinamento } from './treinamento-config-lote.js';

function resumir(texto: string, limite = 420): string {
  const base = String(texto || '').trim();
  return base.length <= limite ? base : `${base.slice(0, limite - 3)}...`;
}

function nomeAlvo(alvo: string, chave: string | null): string {
  return chave ? `${alvo}.${chave}` : alvo;
}

export function montarResumoPreviewTexto(
  previews: PreviewPatchTreinamento[],
  campo: 'antes' | 'depois',
): string {
  return previews
    .map((item) => {
      const titulo = nomeAlvo(item.alvo, item.chave);
      return `[${titulo}]\n${resumir(item[campo], 700)}`;
    })
    .join('\n\n');
}

export function montarRespostaHumanaPatch(opts: {
  id?: number;
  resumo: string;
  justificativa?: string | null;
  perguntaConfirmacao?: string | null;
  trechos: TrechoTreinamentoRelacionado[];
  previews: PreviewPatchTreinamento[];
}): string {
  const linhas = [
    opts.id
      ? `Eu encontrei estes trechos relacionados e preparei o patch #${opts.id}.`
      : 'Eu encontrei estes trechos relacionados e preparei uma proposta de patch.',
    'Para chegar no comportamento que voce pediu, eu sugiro estes ajustes:',
    `- ${opts.resumo}`,
  ];

  if (opts.justificativa) linhas.push(`- ${opts.justificativa}`);
  if (opts.trechos.length) {
    linhas.push('', 'Trechos encontrados:');
    for (const trecho of opts.trechos.slice(0, 4)) {
      linhas.push(
        `- ${nomeAlvo(trecho.alvo, trecho.chave)}: ${resumir(trecho.texto, 180)} (${trecho.motivo})`,
      );
    }
  }

  if (opts.previews.length) {
    linhas.push('', 'Antes e depois sugeridos:');
    for (const item of opts.previews.slice(0, 4)) {
      linhas.push(`- ${nomeAlvo(item.alvo, item.chave)}`);
      linhas.push(`ANTES: ${resumir(item.antes, 220)}`);
      linhas.push(`DEPOIS: ${resumir(item.depois, 220)}`);
    }
  }

  linhas.push(
    '',
    opts.perguntaConfirmacao ||
      (opts.id
        ? `Se fizer sentido, responda "Confirmar patch #${opts.id}". Se nao quiser aplicar, responda "Cancelar patch #${opts.id}".`
        : 'Se fizer sentido, confirme para eu aplicar a mudanca.'),
  );

  return linhas.join('\n');
}
