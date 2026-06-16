/**
 * Desambiguação semântica — sem listas fechadas de palavras.
 * Qdrant fornece exemplos de apoio; LLM interpreta gíria/jargão e audita ferramentas.
 */
import { chatCompletionRaw } from './openai.js';
import { extrairBlocosFerramenta } from './ferramentas.js';
import { buscarApoioIntencaoSimilar } from './qdrant-linguagem.js';
import { classificarEntrada } from '../util/entrada-confusa.js';
import {
  extrairRespostaMotorista,
  INSTRUCAO_AUDITORIA_COM_RACIOCINIO,
  type RaciocinioInterno,
} from './cadeia-pensamento.js';

export interface AnaliseDesambiguacao {
  intencao_provavel: string;
  ambiguo: boolean;
  confianca: 'alta' | 'media' | 'baixa';
  qualidade_entrada?: 'clara' | 'nonsense' | 'ilegivel' | 'vaga';
  falta_informacao: string[];
  perguntar_antes_de_ferramenta: boolean;
  pergunta_sugerida?: string;
  ferramentas_seguras: string[];
  notas: string;
}

const FERRAMENTAS_SENSIVEIS = new Set([
  'grava_ocr',
  'salvar_carreta',
  'atualizar_motorista',
  'grava_comprovante',
]);

const ANALISE_PADRAO: AnaliseDesambiguacao = {
  intencao_provavel: 'indefinido',
  ambiguo: false,
  confianca: 'media',
  falta_informacao: [],
  perguntar_antes_de_ferramenta: false,
  ferramentas_seguras: [],
  notas: '',
};

function parseJson<T>(texto: string): T | null {
  const match = texto.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}

/** Exemplos semânticos do Qdrant + princípios fixos (não são lista exclusiva). */
export async function montarBlocoApoioSemantico(mensagem: string): Promise<string> {
  const similares = await buscarApoioIntencaoSimilar(mensagem, 4);
  const linhas: string[] = [
    '=== APOIO SEMÂNTICO (exemplos reais — inspire-se, NÃO é lista fechada de palavras) ===',
    'Interprete intenção pelo sentido, gíria e contexto ERP. Se faltar dado para gravar no sistema, PERGUNTE antes.',
    'Troca de veículo/caminhão/carro/cavalo/bitrem/carroça sem especificar cavalo vs carreta → ambíguo.',
    'Sem foto/anexo quando a ferramenta exige mídia → pergunte, não invente grava_ocr/grava_comprovante.',
    'Teclado aleatório, frase sem nexo ou fora de frete → qualidade_entrada nonsense/ilegivel, pergunte com naturalidade.',
    'Assuma que você não entendeu — cite o trecho estranho se fizer sentido, sem tom robótico.',
  ];

  for (const s of similares) {
    if (s.score < 0.62) continue;
    linhas.push(
      `- Exemplo parecido: "${s.texto}" → intenção ${s.intencao}; ação ${s.acao_recomendada}: ${s.nota}`,
    );
  }

  return linhas.join('\n');
}

/** Passada LLM dedicada: entender intenção e detectar ambiguidade antes do rascunho. */
export async function analisarIntencaoMotorista(opts: {
  mensagem: string;
  historico: Array<{ role: string; content: string }>;
  contextoErp?: string;
  temMidia: boolean;
  blocoApoio: string;
}): Promise<AnaliseDesambiguacao> {
  const heuristica = classificarEntrada(opts.mensagem, { temMidia: opts.temMidia });
  if (heuristica.qualidade !== 'clara' && heuristica.respostaSugerida) {
    return {
      intencao_provavel: 'entrada_confusa',
      ambiguo: true,
      confianca: 'alta',
      qualidade_entrada: heuristica.qualidade,
      falta_informacao: [heuristica.motivo],
      perguntar_antes_de_ferramenta: true,
      pergunta_sugerida: heuristica.respostaSugerida,
      ferramentas_seguras: [],
      notas: `heuristica:${heuristica.motivo}`,
    };
  }

  const hist = opts.historico
    .slice(-6)
    .map((h) => `${h.role}: ${h.content}`)
    .join('\n');

  const texto = await chatCompletionRaw(
    [
      {
        role: 'system',
        content: `${opts.blocoApoio}

PASSO 1b — ANÁLISE DE INTENÇÃO (não responda ao motorista).
Você interpreta mensagens de motoristas de caminhão no WhatsApp (gírias, erros, abreviações).
Os exemplos acima APOIAM o raciocínio — motoristas falam de infinitas formas, não dependa de palavra exata.

Responda SOMENTE JSON:
{
  "intencao_provavel": "troca_veiculo|atualizar_documento|atualizar_dados|disponibilidade|oferta|cadastro|canhoto|saudacao|entrada_confusa|outro",
  "ambiguo": true,
  "confianca": "alta|media|baixa",
  "qualidade_entrada": "clara|nonsense|ilegivel|vaga",
  "falta_informacao": ["o que falta para agir com segurança"],
  "perguntar_antes_de_ferramenta": true,
  "pergunta_sugerida": "pergunta curta estilo WhatsApp, sem ponto final",
  "ferramentas_seguras": [],
  "notas": "breve"
}

Regras:
- ambiguo=true se não der para executar ferramenta com segurança (ex: "mudei de carro" sem saber cavalo/carreta).
- qualidade_entrada nonsense/ilegivel/vaga → intencao entrada_confusa, pergunte com naturalidade, ferramentas_seguras=[].
- Frase bizarra ou sem nexo com frete → assuma que você não entendeu, não invente cenário.
- perguntar_antes_de_ferramenta=true → ferramentas_seguras deve ser [] ou só as óbvias (ex: registrar_disponibilidade com local explícito).
- temMidia=${opts.temMidia} — sem mídia, não inclua grava_ocr nem grava_comprovante em ferramentas_seguras.
- Se confianca=alta e intenção clara com dados na mensagem ou anexo, perguntar_antes_de_ferramenta pode ser false.`,
      },
      {
        role: 'user',
        content: `CONTEXTO ERP:\n${opts.contextoErp?.slice(0, 2500) || '(indisponível)'}

HISTÓRICO:\n${hist || '(vazio)'}

MENSAGEM ATUAL:\n${opts.mensagem}`,
      },
    ],
    { temperature: 0.05, max_tokens: 450 },
  );

  const parsed = parseJson<AnaliseDesambiguacao>(texto);
  if (!parsed) return { ...ANALISE_PADRAO, notas: texto.slice(0, 120) };

  const qualidade =
    parsed.qualidade_entrada ??
  (parsed.intencao_provavel === 'entrada_confusa' ? 'vaga' : 'clara');

  const ambiguo =
    parsed.ambiguo === true ||
    qualidade === 'nonsense' ||
    qualidade === 'ilegivel' ||
    qualidade === 'vaga';

  return {
    intencao_provavel: parsed.intencao_provavel ?? 'indefinido',
    ambiguo,
    confianca: parsed.confianca ?? 'media',
    qualidade_entrada: qualidade,
    falta_informacao: Array.isArray(parsed.falta_informacao) ? parsed.falta_informacao : [],
    perguntar_antes_de_ferramenta:
      parsed.perguntar_antes_de_ferramenta === true || ambiguo,
    pergunta_sugerida: parsed.pergunta_sugerida,
    ferramentas_seguras: Array.isArray(parsed.ferramentas_seguras) ? parsed.ferramentas_seguras : [],
    notas: parsed.notas ?? '',
  };
}

function textoSemFerramentas(texto: string): string {
  return texto
    .replace(/\{[\s\S]*?"ferramenta"[\s\S]*?\}/g, '')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/** Remove ferramentas sensíveis quando análise pediu clarificação. */
export function aplicarTravaFerramentasAmbiguas(
  texto: string,
  analise: AnaliseDesambiguacao,
): { texto: string; removidas: string[] } {
  if (!analise.perguntar_antes_de_ferramenta && !analise.ambiguo) {
    return { texto, removidas: [] };
  }

  const blocos = extrairBlocosFerramenta(texto);
  const removidas = blocos
    .filter((b) => FERRAMENTAS_SENSIVEIS.has(b.ferramenta))
    .map((b) => b.ferramenta);

  if (removidas.length === 0) return { texto, removidas: [] };

  let limpo = texto;
  for (const b of blocos) {
    if (FERRAMENTAS_SENSIVEIS.has(b.ferramenta)) {
      limpo = limpo.replace(b.raw, '');
    }
  }

  const pergunta =
    analise.pergunta_sugerida?.trim() ||
    'Me explica melhor parceiro, é cavalo ou carreta? Manda o CRLV ou a foto que eu atualizo';

  const visivel = textoSemFerramentas(limpo);
  const saida = visivel.length > 15 ? visivel : pergunta;

  return { texto: saida.trim(), removidas };
}

/** Passada 4 — auditoria crítica da resposta + ferramentas antes de enviar. */
export async function auditarRespostaEFerramentas(opts: {
  mensagem: string;
  rascunho: string;
  analise: AnaliseDesambiguacao;
  planoFerramentas: string[];
  blocoApoio: string;
  temMidia: boolean;
}): Promise<{ texto: string; ajustes: string[]; raciocinio?: RaciocinioInterno }> {
  const blocos = extrairBlocosFerramenta(opts.rascunho);
  const ferramentasPresentes = blocos.map((b) => b.ferramenta);

  if (ferramentasPresentes.length === 0 && !opts.analise.perguntar_antes_de_ferramenta) {
    return { texto: opts.rascunho, ajustes: [] };
  }

  const bruto = await chatCompletionRaw(
    [
      {
        role: 'system',
        content: `${opts.blocoApoio}

${INSTRUCAO_AUDITORIA_COM_RACIOCINIO}

ANÁLISE PRÉVIA:
${JSON.stringify(opts.analise)}

FERRAMENTAS NO PLANO: ${opts.planoFerramentas.join(', ') || 'nenhuma'}
FERRAMENTAS NO RASCUNHO: ${ferramentasPresentes.join(', ') || 'nenhuma'}
TEM MÍDIA NO LOTE: ${opts.temMidia}

Se qualquer ferramenta sensível (grava_ocr, salvar_carreta, atualizar_motorista, grava_comprovante) for prematura ou ambígua:
- resposta_motorista = só a pergunta humana de esclarecimento (sem JSON ferramenta)
Se estiver seguro, resposta_motorista pode incluir JSON intactos.`,
      },
      {
        role: 'user',
        content: `Mensagem motorista: ${opts.mensagem}\n\nRascunho:\n${opts.rascunho}`,
      },
    ],
    { temperature: 0.05, max_tokens: 800 },
  );

  const ajustes: string[] = ['auditoria-pass4'];
  const { resposta, registro } = extrairRespostaMotorista(bruto, 'passo4-auditoria');
  let saida = resposta;

  const trava = aplicarTravaFerramentasAmbiguas(saida, opts.analise);
  if (trava.removidas.length > 0) {
    saida = trava.texto;
    ajustes.push(`trava:${trava.removidas.join(',')}`);
  }

  return { texto: saida, ajustes, raciocinio: registro };
}

export function montarInstrucaoAnaliseNoRascunho(analise: AnaliseDesambiguacao): string {
  if (!analise.perguntar_antes_de_ferramenta && !analise.ambiguo) return '';

  const falta = analise.falta_informacao.length
    ? `Falta: ${analise.falta_informacao.join('; ')}.`
    : '';
  const pergunta = analise.pergunta_sugerida
    ? `Use esta ideia de pergunta: ${analise.pergunta_sugerida}`
    : 'Pergunte o que falta de forma natural.';

  const entradaConfusa =
    analise.intencao_provavel === 'entrada_confusa' ||
    analise.qualidade_entrada === 'nonsense' ||
    analise.qualidade_entrada === 'ilegivel' ||
    analise.qualidade_entrada === 'vaga';

  const tomConfuso = entradaConfusa
    ? 'Tom: assuma que você não entendeu, sem culpar o motorista, sem inventar intenção.'
    : '';

  return `
=== ANÁLISE DE INTENÇÃO (obrigatório) ===
Intenção provável: ${analise.intencao_provavel} | Ambíguo: ${analise.ambiguo} | Confiança: ${analise.confianca}
Qualidade entrada: ${analise.qualidade_entrada ?? 'clara'}
${falta}
${tomConfuso}
NÃO inclua JSON de grava_ocr, salvar_carreta, atualizar_motorista nem grava_comprovante nesta resposta.
${pergunta}`;
}
