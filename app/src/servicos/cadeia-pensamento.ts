/**
 * Cadeia de pensamento INVISÍVEL — o modelo justifica em JSON interno;
 * só `resposta_motorista` segue para o WhatsApp.
 */
import { extrairBlocosFerramenta } from './ferramentas.js';

export interface RaciocinioInterno {
  etapa: string;
  raciocinio?: Record<string, unknown>;
  auto_checklist?: string[];
  auto_critica?: string[];
  correcoes_feitas?: string;
  aprovado?: boolean;
}

export interface SaidaComRaciocinio {
  raciocinio?: Record<string, unknown>;
  auto_checklist?: string[];
  auto_critica?: string[];
  correcoes_feitas?: string;
  aprovado?: boolean;
  resposta_motorista: string;
}

function parseJson<T>(texto: string): T | null {
  const match = texto.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}

const MARCADORES_VAZAMENTO =
  /^(?:PASSO\s*\d|CENÁRIO\s*\d|===|PLANO APROVADO|ANÁLISE DE INTENÇÃO|FERRAMENTAS?\s*(?:NO|INTERNAS)|raciocinio|auto_critica|auto_checklist|correcoes_feitas|intenção provável|qualidade entrada|o_que_motorista_quis|por_que_esta)/i;

/** Remove trechos de pensamento que vazaram para texto livre. */
export function sanitizarVazamentoPensamento(texto: string): string {
  let t = texto
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .replace(/[\s\S]*?<\/think>/gi, '')
  .trim();

  const blocosFerramenta = extrairBlocosFerramenta(t);
  const ferramentasRaw = blocosFerramenta.map((b) => b.raw);

  t = t.replace(/\{[\s\S]*?"raciocinio"[\s\S]*?\}/g, '');
  t = t.replace(/\{[\s\S]*?"auto_critica"[\s\S]*?"resposta_motorista"[\s\S]*?\}/g, '');

  const linhas = t
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !MARCADORES_VAZAMENTO.test(l));

  t = linhas.join(', ').replace(/,{2,}/g, ',').trim();

  for (const raw of ferramentasRaw) {
    if (!t.includes(raw)) t = `${t} ${raw}`.trim();
  }

  return t;
}

/** Extrai só a mensagem ao motorista de uma saída JSON ou texto misto. */
export function extrairRespostaMotorista(
  texto: string,
  etapa: string,
): { resposta: string; registro?: RaciocinioInterno } {
  const parsed = parseJson<
    SaidaComRaciocinio & { resposta_final?: string; resposta?: string }
  >(texto);

  if (parsed) {
    const resposta =
      parsed.resposta_motorista ?? parsed.resposta_final ?? parsed.resposta;
    if (typeof resposta === 'string' && resposta.trim()) {
      return {
        resposta: sanitizarVazamentoPensamento(resposta.trim()),
        registro: {
          etapa,
          raciocinio: parsed.raciocinio,
          auto_checklist: parsed.auto_checklist,
          auto_critica: parsed.auto_critica,
          correcoes_feitas: parsed.correcoes_feitas,
          aprovado: parsed.aprovado,
        },
      };
    }
  }

  return {
    resposta: sanitizarVazamentoPensamento(texto),
  };
}

export const INSTRUCAO_RASCUNHO_COM_RACIOCINIO = `
PASSO 2 — CADEIA DE PENSAMENTO INTERNA + RASCUNHO (INVISÍVEL AO MOTORISTA).

Você DEVE justificar internamente antes de responder. O motorista NUNCA vê raciocinio, checklist nem auto_crítica.

Responda SOMENTE JSON válido:
{
  "raciocinio": {
    "o_que_motorista_quis": "interpretação em 1 frase",
    "contexto_do_historico": "o que importa da conversa",
    "dados_faltantes": ["lista ou vazio"],
    "riscos_se_errar": ["ex: gravar cavalo quando era carreta"],
    "por_que_esta_abordagem": "justificativa da resposta escolhida"
  },
  "auto_checklist": [
    "cenário correto?",
    "tom WhatsApp sem SAC?",
    "ferramentas JSON necessárias?",
    "se oferta: despedida com boa viagem ou show?",
    "nada de instrução interna vazando?"
  ],
  "resposta_motorista": "ÚNICA parte visível — uma linha, vírgulas, sem ponto final, JSON ferramentas AO FINAL se precisar gravar"
}`;

export const INSTRUCAO_REVISAO_COM_AUTOCRITICA = `
PASSO 3 — AUTO-CRÍTICA INTERNA + RESPOSTA FINAL (INVISÍVEL AO MOTORISTA).

Critique o rascunho com rigor. Liste problemas antes de aprovar. O motorista só vê resposta_motorista.

Responda SOMENTE JSON válido:
{
  "auto_critica": ["problema 1 ou 'nenhum'"],
  "correcoes_feitas": "o que ajustou no rascunho",
  "aprovado": true,
  "resposta_motorista": "mensagem final ao motorista (pode incluir JSON ferramentas ao final)"
}`;

export const INSTRUCAO_AUDITORIA_COM_RACIOCINIO = `
AUDITORIA FINAL — raciocínio interno obrigatório, motorista só vê resposta_motorista.

Responda SOMENTE JSON:
{
  "raciocinio": {
    "ferramentas_prematuras": "sim/não e por quê",
    "ambiguidade_restante": "sim/não",
    "decisao": "manter ou substituir por pergunta"
  },
  "resposta_motorista": "mensagem final (sem raciocinio visível)"
}`;
