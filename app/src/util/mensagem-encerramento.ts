/**
 * Detecta mensagens do motorista que não exigem resposta (agradecimento, emoji, ack).
 * Não pausa a IA — apenas evita gerar/enviar resposta desnecessária.
 */

export interface AvaliacaoEncerramento {
  encerrar: boolean;
  motivo?: string;
  confianca?: 'alta' | 'media';
}

/** Padrões aprendidos do histórico Chatwoot (atualizados via script Fase 7) */
let padroesHistoricoEncerramento: RegExp[] = [];

export function registrarPadroesEncerramentoHistorico(frases: string[]): void {
  padroesHistoricoEncerramento = frases
    .map((f) => f.trim().toLowerCase())
    .filter((f) => f.length > 0 && f.length <= 60)
    .map((f) => new RegExp(`^${escapeRegex(f)}[\\s!.]*$`, 'i'));
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const EMOJI_ONLY =
  /^[\s\p{Emoji}\p{Emoji_Presentation}\p{Extended_Pictographic}\u200d\ufe0f👍🙏✅👊💪🤝😊😉🙂]+$/u;

const INDICIO_PERGUNTA_OU_PEDIDO =
  /\?|quanto|quando|onde|como|tem carga|preciso|cadastr|manda|envia|quero|pode|valor|frete|documento|cnh|crlv/i;

const DESPEDIDAS_ASSISTENTE = [
  /boa viagem/i,
  /dados atualizados/i,
  /fica para a próxima/i,
  /fica pra próxima/i,
  /equipe te chama/i,
  /vai com deus/i,
  /até mais/i,
  /já anotei/i,
  /anotei aqui/i,
  /pra análise/i,
  /para análise/i,
  /enviado para análise/i,
  /combinado.*viagem/i,
];

const ACK_ENCERRAMENTO =
  /^(ok|okay|blz|beleza|bele|valeu|vlw|obrigad[oa]?|obg|brigad[oa]?|tmj|show|perfeito|combinado|certo|certinho|fechou|isso|pode ser|tá bom|ta bom|entendi|entendido|de boa|sucesso|falou|flw|agradeço|grato|tá certo|ta certo|tranquilo|tranquila|maravilha|ótimo|otimo|top|topzera)([\s,!.]+(obrigad[oa]?|valeu|vlw|tmj|show|parceiro|brother))?[\s!.]*$/i;

function assistenteJaEncerrou(ultimaRespostaAssistente?: string): boolean {
  if (!ultimaRespostaAssistente?.trim()) return false;
  return DESPEDIDAS_ASSISTENTE.some((p) => p.test(ultimaRespostaAssistente));
}

export function assistenteEncerrouConversa(ultimaRespostaAssistente?: string): boolean {
  return assistenteJaEncerrou(ultimaRespostaAssistente);
}

function batePadraoHistorico(texto: string): boolean {
  const t = texto.trim();
  return padroesHistoricoEncerramento.some((p) => p.test(t));
}

/**
 * Retorna true quando a mensagem é obviamente final e não precisa de resposta.
 * Exige que a última mensagem da GMX tenha sido de encerramento (evita ignorar "ok" no meio do fluxo).
 */
export function mensagemObviamenteEncerramento(
  textoMotorista: string,
  ultimaRespostaAssistente?: string,
): AvaliacaoEncerramento {
  const t = textoMotorista.trim();
  if (!t) return { encerrar: false };

  if (INDICIO_PERGUNTA_OU_PEDIDO.test(t)) return { encerrar: false };
  if (t.length > 90) return { encerrar: false };

  const contextoFechado = assistenteJaEncerrou(ultimaRespostaAssistente);
  if (!contextoFechado) return { encerrar: false };

  if (EMOJI_ONLY.test(t)) {
    return { encerrar: true, motivo: 'emoji_apos_despedida', confianca: 'alta' };
  }

  const norm = t
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (ACK_ENCERRAMENTO.test(norm) || ACK_ENCERRAMENTO.test(t)) {
    return { encerrar: true, motivo: 'agradecimento_apos_despedida', confianca: 'alta' };
  }

  if (batePadraoHistorico(t)) {
    return { encerrar: true, motivo: 'padrao_historico_chatwoot', confianca: 'media' };
  }

  const palavras = norm.split(/\s+/).filter(Boolean);
  if (palavras.length <= 4 && palavras.length > 0) {
    const soAck = palavras.every((p) =>
      /^(ok|blz|beleza|valeu|vlw|obrigad|obg|show|tmj|perfeito|combinado|certo|fechou|entendi|tranquilo|top)$/.test(
        p,
      ),
    );
    if (soAck) {
      return { encerrar: true, motivo: 'ack_curto_apos_despedida', confianca: 'media' };
    }
  }

  return { encerrar: false };
}
