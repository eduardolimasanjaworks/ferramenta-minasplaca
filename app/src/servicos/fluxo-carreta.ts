/**
 * Carreta 1/2/3 — atualização programática (texto ou foto CRLV).
 */
import type { ItemDebounce } from '../tipos/evolution.js';
import { serializarBlocoFerramenta } from './ferramentas.js';
import { limparEstadoFluxo, obterEstadoFluxo, salvarEstadoFluxo } from './estado-fluxo-redis.js';

interface EstadoCarreta {
  modo: 'carreta';
  indice?: 1 | 2 | 3;
  aguardando?: 'indice' | 'dados';
}

export interface ResultadoFluxoCarreta {
  textoComFerramentas: string;
  visivel: string;
  passo: string;
  fragmentar: false;
}

const ENTRADA = /carreta|reboque|atualizar carreta|dados da carreta|crlv carreta/i;

const PERGUNTA_INDICE =
  'Qual carreta parceiro? Manda 1, 2 ou 3 (ou escreve carreta 1, carreta 2...)';

const REPROMPT =
  'Manda a placa e renavam da carreta, ou envia foto do CRLV da carreta por favor';

function normalizar(s: string): string {
  return s.trim().toLowerCase();
}

function ultimaAssistant(historico: Array<{ role: string; content: string }>): string {
  return [...historico].reverse().find((h) => h.role === 'assistant')?.content ?? '';
}

function perguntouIndice(texto: string): boolean {
  return /qual carreta/i.test(texto);
}

function detectarIndice(mensagem: string): 1 | 2 | 3 | null {
  const t = normalizar(mensagem);
  if (/\b1\b|carreta\s*1|primeira/.test(t)) return 1;
  if (/\b2\b|carreta\s*2|segunda/.test(t)) return 2;
  if (/\b3\b|carreta\s*3|terceira/.test(t)) return 3;
  return null;
}

function extrairPlaca(mensagem: string): string | null {
  const m = mensagem.toUpperCase().match(/\b([A-Z]{3}\d[A-Z0-9]\d{2}|[A-Z]{3}\d{4})\b/);
  return m?.[1] ?? null;
}

function extrairRenavam(mensagem: string): string | null {
  const m = mensagem.replace(/\D/g, '');
  if (m.length >= 9 && m.length <= 11) return m;
  return null;
}

function extrairMidiaId(itens: ItemDebounce[]): string | undefined {
  for (const i of itens) {
    if ((i.tipo === 'imagem' || i.tipo === 'documento') && i.midiaId) return i.midiaId;
  }
  return undefined;
}

function montar(
  visivel: string,
  ferramentas: Array<{ ferramenta: string; dados: Record<string, unknown> }> = [],
  passo = 'ok',
): ResultadoFluxoCarreta {
  const blocos = ferramentas.map((f) => serializarBlocoFerramenta(f.ferramenta, f.dados));
  return {
    visivel,
    textoComFerramentas: blocos.length ? `${visivel}\n${blocos.join('\n')}` : visivel,
    passo,
    fragmentar: false,
  };
}

export function estaEmFluxoCarreta(
  historico: Array<{ role: string; content: string }>,
  ultimaAssistantMsg?: string,
): boolean {
  const u = ultimaAssistantMsg ?? ultimaAssistant(historico);
  return perguntouIndice(u) || /placa e renavam da carreta|crlv da carreta/i.test(u);
}

export async function tentarFluxoCarreta(opts: {
  telefone: string;
  mensagem: string;
  historico: Array<{ role: string; content: string }>;
  itens?: ItemDebounce[];
}): Promise<ResultadoFluxoCarreta | null> {
  const { telefone, mensagem, historico, itens = [] } = opts;
  const estado = await obterEstadoFluxo<EstadoCarreta>(telefone);
  const ultima = ultimaAssistant(historico);
  const entrada = ENTRADA.test(normalizar(mensagem));
  const emFluxo = estado?.modo === 'carreta' || estaEmFluxoCarreta(historico, ultima);

  if (!entrada && !emFluxo) return null;

  let indice = estado?.indice ?? detectarIndice(mensagem);
  if (!indice) {
    await salvarEstadoFluxo(telefone, { modo: 'carreta', aguardando: 'indice' } satisfies EstadoCarreta);
    return montar(PERGUNTA_INDICE, [], 'carreta_pergunta_indice');
  }

  const midiaId = extrairMidiaId(itens);
  const placa = extrairPlaca(mensagem);
  const renavam = extrairRenavam(mensagem);

  if (midiaId) {
    await limparEstadoFluxo(telefone);
    return montar(
      `Carreta ${indice} atualizada parceiro, CRLV salvo no sistema`,
      [
        {
          ferramenta: 'salvar_carreta',
          dados: {
            indice,
            midia_id: midiaId,
            telefone,
            tipo: `carreta_${indice}`,
          },
        },
      ],
      `carreta_${indice}_foto_ok`,
    );
  }

  if (placa || renavam) {
    const campos: Record<string, unknown> = {};
    if (placa) campos.placa = placa;
    if (renavam) campos.renavam = renavam;
    await limparEstadoFluxo(telefone);
    return montar(
      `Show parceiro, carreta ${indice} atualizada`,
      [{ ferramenta: 'salvar_carreta', dados: { indice, telefone, campos } }],
      `carreta_${indice}_texto_ok`,
    );
  }

  await salvarEstadoFluxo(telefone, { modo: 'carreta', indice, aguardando: 'dados' } satisfies EstadoCarreta);
  return montar(REPROMPT, [], `carreta_${indice}_reprompt`);
}
