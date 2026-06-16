/**
 * Cenário 8 — cadastro de documentos (CNH → CRLV → ANTT → endereço → caminhão), sem LLM.
 */
import type { ItemDebounce } from '../tipos/evolution.js';
import { serializarBlocoFerramenta } from './ferramentas.js';
import { limparEstadoFluxo, obterEstadoFluxo, salvarEstadoFluxo } from './estado-fluxo-redis.js';
import {
  MSG_OCR_ESCALONAR,
  MSG_OCR_ILEGIVEL,
  textoOcrValido,
} from '../util/ocr-qualidade.js';

export type PassoCadastro = 'cnh' | 'crlv' | 'antt' | 'endereco' | 'caminhao';

const ENTRADA_CADASTRO =
  /^(cadastro|quero\s+(?:atualizar|atualiz)\w*\s+(?:o\s+)?(?:meu\s+)?cadastro|quero\s+cadastr|quero\s+me\s+cadastr|preciso\s+(?:atualizar\s+)?cadastr|fazer\s+cadastro|atualizar\s+(?:o\s+)?(?:meu\s+)?cadastro)/i;

const INICIO =
  'Beleza parceiro, vamos fazer seu cadastro, manda a foto da sua CNH por favor';

const FECHAMENTO =
  'Show parceiro, cadastro enviado pra análise da equipe, em breve te retornamos';

const REPROMPT: Record<PassoCadastro, string> = {
  cnh: 'Preciso da foto da CNH parceiro, manda aí por favor',
  crlv: 'Preciso da foto do CRLV do cavalo parceiro, manda aí por favor',
  antt: 'Preciso da foto ou PDF da ANTT parceiro, manda aí por favor',
  endereco: 'Preciso do comprovante de endereço parceiro, manda a foto ou PDF',
  caminhao: 'Preciso de uma foto do caminhão (cavalo) parceiro, manda aí por favor',
};

const CONFIRMACAO: Record<Exclude<PassoCadastro, 'caminhao'>, string> = {
  cnh: 'CNH recebida parceiro, agora manda a foto do CRLV do cavalo',
  crlv: 'Show parceiro, agora manda a foto ou PDF da ANTT',
  antt: 'Beleza, agora manda o comprovante de endereço parceiro',
  endereco: 'Recebido parceiro, agora manda uma foto do caminhão (cavalo)',
};

const TIPO_OCR: Record<PassoCadastro, string> = {
  cnh: 'cnh',
  crlv: 'crlv',
  antt: 'antt',
  endereco: 'endereco',
  caminhao: 'foto',
};

const ORDEM: PassoCadastro[] = ['cnh', 'crlv', 'antt', 'endereco', 'caminhao'];

export interface ResultadoFluxoCadastro {
  textoComFerramentas: string;
  visivel: string;
  passo: string;
  fragmentar: false;
}

interface EstadoC8 {
  fluxo: 'c8';
  passo: PassoCadastro;
  tentativasOcr?: Partial<Record<PassoCadastro, number>>;
}

function normalizar(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function ultimaAssistant(historico: Array<{ role: string; content: string }>): string {
  return [...historico].reverse().find((h) => h.role === 'assistant')?.content ?? '';
}

function fluxoConcluido(texto: string): boolean {
  return /cadastro enviado.*an[aá]lise|enviado pra an[aá]lise/i.test(texto);
}

function perguntouDocumento(texto: string, passo: PassoCadastro): boolean {
  const t = texto.toLowerCase();
  switch (passo) {
    case 'cnh':
      return /cnh/.test(t) && /foto|manda|preciso/.test(t);
    case 'crlv':
      return /crlv/.test(t);
    case 'antt':
      return /antt/.test(t);
    case 'endereco':
      return /comprovante|endere[cç]o/.test(t);
    case 'caminhao':
      return /caminh[aã]o|cavalo/.test(t);
    default:
      return false;
  }
}

function proximoPasso(passo: PassoCadastro): PassoCadastro | null {
  const i = ORDEM.indexOf(passo);
  return i >= 0 && i < ORDEM.length - 1 ? ORDEM[i + 1] : null;
}

function extrairMidiaId(itens: ItemDebounce[]): string | undefined {
  for (const i of itens) {
    if ((i.tipo === 'imagem' || i.tipo === 'documento') && i.midiaId) {
      return i.midiaId;
    }
  }
  return undefined;
}

function extrairConteudoMidia(itens: ItemDebounce[]): string | undefined {
  for (const i of [...itens].reverse()) {
    if ((i.tipo === 'imagem' || i.tipo === 'documento') && i.conteudo) {
      return i.conteudo;
    }
  }
  return undefined;
}

function montarResultado(
  visivel: string,
  ferramentas: Array<{ ferramenta: string; dados: Record<string, unknown> }> = [],
  passo = 'ok',
): ResultadoFluxoCadastro {
  const blocos = ferramentas.map((f) => serializarBlocoFerramenta(f.ferramenta, f.dados));
  return {
    visivel,
    textoComFerramentas: blocos.length ? `${visivel}\n${blocos.join('\n')}` : visivel,
    passo,
    fragmentar: false,
  };
}

function inferirPasso(
  historico: Array<{ role: string; content: string }>,
  ultimaAssist: string,
  mensagem: string,
  estado: EstadoC8 | null,
): PassoCadastro | 'entrada' | null {
  if (fluxoConcluido(ultimaAssist)) return null;

  if (ENTRADA_CADASTRO.test(normalizar(mensagem))) return 'entrada';

  if (estado?.fluxo === 'c8' && estado.passo && ORDEM.includes(estado.passo)) {
    return estado.passo;
  }

  for (const passo of [...ORDEM].reverse()) {
    if (perguntouDocumento(ultimaAssist, passo)) return passo;
  }

  return null;
}

/**
 * Indica fluxo C8 ativo (para roteador — bloqueia menu e evita LLM).
 */
export function estaEmFluxoCadastro(
  historico: Array<{ role: string; content: string }>,
  ultimaAssistantMsg?: string,
): boolean {
  const u = ultimaAssistantMsg ?? ultimaAssistant(historico);
  if (fluxoConcluido(u)) return false;
  return ORDEM.some((p) => perguntouDocumento(u, p));
}

/**
 * Tenta responder pelo fluxo C8 (null = fora do cadastro).
 */
export async function tentarFluxoCadastro(opts: {
  telefone: string;
  mensagem: string;
  historico: Array<{ role: string; content: string }>;
  itens?: ItemDebounce[];
}): Promise<ResultadoFluxoCadastro | null> {
  const { telefone, mensagem, historico, itens = [] } = opts;
  const ultimaAssist = ultimaAssistant(historico);
  const estado = await obterEstadoFluxo<EstadoC8>(telefone);
  const passoAtual = inferirPasso(historico, ultimaAssist, mensagem, estado);

  if (!passoAtual) return null;

  if (passoAtual === 'entrada') {
    await salvarEstadoFluxo(telefone, { fluxo: 'c8', passo: 'cnh' } satisfies EstadoC8);
    return montarResultado(
      INICIO,
      [
        {
          ferramenta: 'atualizar_motorista',
          dados: { status_cadastro: 'FALTA DOCS', telefone },
        },
      ],
      'cadastro_inicio',
    );
  }

  const midiaId = extrairMidiaId(itens);
  if (!midiaId) {
    return montarResultado(REPROMPT[passoAtual], [], `reprompt_${passoAtual}`);
  }

  const conteudoOcr = extrairConteudoMidia(itens);
  if (!textoOcrValido(conteudoOcr)) {
    const tentativas = (estado?.tentativasOcr?.[passoAtual] ?? 0) + 1;
    await salvarEstadoFluxo(telefone, {
      fluxo: 'c8',
      passo: passoAtual,
      tentativasOcr: { ...estado?.tentativasOcr, [passoAtual]: tentativas },
    } satisfies EstadoC8);

    if (tentativas >= 2) {
      await limparEstadoFluxo(telefone);
      return montarResultado(
        MSG_OCR_ESCALONAR,
        [
          {
            ferramenta: 'escalonar_negociacao',
            dados: {
              motivo: 'ocr_ilegivel',
              tipo_documento: TIPO_OCR[passoAtual],
              telefone,
            },
          },
        ],
        'ocr_escalonar',
      );
    }

    return montarResultado(MSG_OCR_ILEGIVEL, [], `ocr_reprompt_${passoAtual}`);
  }

  if (passoAtual === 'caminhao') {
    await limparEstadoFluxo(telefone);
    return montarResultado(
      FECHAMENTO,
      [
        {
          ferramenta: 'grava_ocr',
          dados: { tipo: TIPO_OCR.caminhao, midia_id: midiaId, telefone },
        },
        {
          ferramenta: 'atualizar_motorista',
          dados: { status_cadastro: 'AGUARDANDO VALIDACAO', telefone },
        },
      ],
      'cadastro_concluido',
    );
  }

  const proximo = proximoPasso(passoAtual)!;
  await salvarEstadoFluxo(telefone, { fluxo: 'c8', passo: proximo } satisfies EstadoC8);
  return montarResultado(
    CONFIRMACAO[passoAtual],
    [
      {
        ferramenta: 'grava_ocr',
        dados: { tipo: TIPO_OCR[passoAtual], midia_id: midiaId, telefone },
      },
    ],
    `${passoAtual}_ok`,
  );
}
