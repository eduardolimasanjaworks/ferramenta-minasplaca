/**
 * Atualização programática de dados cadastrais (sem depender do LLM).
 */
import { serializarBlocoFerramenta } from './ferramentas.js';
import { extrairLocalizacaoTexto } from './ferramentas-contexto.js';
import { limparEstadoFluxo, obterEstadoFluxo, salvarEstadoFluxo } from './estado-fluxo-redis.js';

export type CampoCadastro =
  | 'nome'
  | 'cidade'
  | 'estado'
  | 'cpf'
  | 'tipo_carroceria'
  | 'forma_pagamento'
  | 'cep_residencia'
  | 'observacao';

interface EstadoDados {
  modo: 'atualizar_dados';
  campo?: CampoCadastro;
}

export interface ResultadoFluxoDados {
  textoComFerramentas: string;
  visivel: string;
  passo: string;
  fragmentar: false;
}

const ENTRADA =
  /atualizar (meus )?dados|alterar (meus )?dados|mudar (minha )?cidade|trocar carroceria|atualizar (meu )?pix|mudar (meu )?nome|atualizar cadastro/i;

const PERGUNTA_CAMPO =
  'O que você quer atualizar parceiro? Nome, cidade, CPF, carroceria, PIX/pagamento, CEP ou observação?';

const ROTULO: Record<CampoCadastro, string> = {
  nome: 'nome',
  cidade: 'cidade',
  estado: 'estado (UF)',
  cpf: 'CPF',
  tipo_carroceria: 'tipo de carroceria',
  forma_pagamento: 'forma de pagamento / PIX',
  cep_residencia: 'CEP',
  observacao: 'observação',
};

function normalizar(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function ultimaAssistant(historico: Array<{ role: string; content: string }>): string {
  return [...historico].reverse().find((h) => h.role === 'assistant')?.content ?? '';
}

function perguntouCampo(texto: string): boolean {
  return /o que você quer atualizar/i.test(texto);
}

function detectarCampo(mensagem: string): CampoCadastro | null {
  const t = normalizar(mensagem);
  if (/\bnome\b/.test(t)) return 'nome';
  if (/\bcidade\b/.test(t) || /\bmudar de cidade\b/.test(t)) return 'cidade';
  if (/\buf\b/.test(t) && t.length < 15) return 'estado';
  if (/\bcpf\b/.test(t)) return 'cpf';
  if (/carroceria|bau|sider|graneleiro|cacamba/.test(t)) return 'tipo_carroceria';
  if (/pix|pagamento|chave pix|conta/.test(t)) return 'forma_pagamento';
  if (/\bcep\b/.test(t)) return 'cep_residencia';
  if (/observa/.test(t)) return 'observacao';
  return null;
}

function extrairValor(campo: CampoCadastro, mensagem: string): string | null {
  const t = mensagem.trim();
  if (campo === 'cpf') {
    const m = t.replace(/\D/g, '');
    if (m.length === 11) return m;
    return null;
  }
  if (campo === 'cep_residencia') {
    const m = t.replace(/\D/g, '');
    if (m.length === 8) return m;
    return null;
  }
  if (campo === 'estado') {
    const m = t.match(/\b([A-Z]{2})\b/i);
    if (m) return m[1].toUpperCase();
    return null;
  }
  if (campo === 'cidade') {
    const loc = extrairLocalizacaoTexto(t);
    if (loc) {
      const parts = loc.split(' ');
      return parts.slice(0, -1).join(' ') || loc;
    }
    if (t.length >= 3 && t.length < 80) return t;
    return null;
  }
  if (t.length < 2 || t.length > 200) return null;
  return t;
}

function montar(
  visivel: string,
  ferramenta?: { ferramenta: string; dados: Record<string, unknown> },
  passo = 'ok',
): ResultadoFluxoDados {
  const json = ferramenta ? serializarBlocoFerramenta(ferramenta.ferramenta, ferramenta.dados) : '';
  return {
    visivel,
    textoComFerramentas: json ? `${visivel}\n${json}` : visivel,
    passo,
    fragmentar: false,
  };
}

export function estaEmAtualizacaoDados(
  historico: Array<{ role: string; content: string }>,
  ultimaAssistantMsg?: string,
): boolean {
  return perguntouCampo(ultimaAssistantMsg ?? ultimaAssistant(historico));
}

export async function tentarAtualizacaoDados(opts: {
  telefone: string;
  mensagem: string;
  historico: Array<{ role: string; content: string }>;
}): Promise<ResultadoFluxoDados | null> {
  const { telefone, mensagem, historico } = opts;
  const estado = await obterEstadoFluxo<EstadoDados>(telefone);
  const ultima = ultimaAssistant(historico);
  const entrada = ENTRADA.test(normalizar(mensagem));
  const emFluxo = estado?.modo === 'atualizar_dados' || perguntouCampo(ultima);

  if (!entrada && !emFluxo) return null;

  let campo = estado?.campo ?? detectarCampo(mensagem);

  if (!campo) {
    await salvarEstadoFluxo(telefone, { modo: 'atualizar_dados' } satisfies EstadoDados);
    return montar(PERGUNTA_CAMPO, undefined, 'dados_pergunta_campo');
  }

  const valor = extrairValor(campo, mensagem);
  if (!valor) {
    await salvarEstadoFluxo(telefone, { modo: 'atualizar_dados', campo } satisfies EstadoDados);
    return montar(
      `Beleza, manda o novo ${ROTULO[campo]} por favor parceiro`,
      undefined,
      `dados_reprompt_${campo}`,
    );
  }

  const payload: Record<string, unknown> = { [campo]: valor, telefone };
  if (campo === 'cidade') {
    const loc = extrairLocalizacaoTexto(mensagem);
    if (loc) {
      const uf = loc.split(' ').pop();
      if (uf && uf.length === 2) payload.estado = uf;
    }
  }

  await limparEstadoFluxo(telefone);
  return montar(
    `Show parceiro, ${ROTULO[campo]} atualizado no sistema`,
    { ferramenta: 'atualizar_motorista', dados: payload },
    `dados_${campo}_ok`,
  );
}
