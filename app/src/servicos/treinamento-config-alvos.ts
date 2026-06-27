/**
 * Resolve e aplica patches nos alvos reais de configuracao da IA.
 * Mantem o treinador conectado ao prompt, estilo e mensagens editaveis.
 * Usa os mesmos servicos ja existentes para salvar com historico e efeito imediato.
 */
import {
  obterConfigMensagensFluxo,
  type ConfigMensagensFluxo,
  salvarConfigMensagensFluxo,
} from './config-mensagens-fluxo.js';
import {
  obterConfigOrquestracaoTexto,
  type ConfigOrquestracaoTexto,
  salvarConfigOrquestracaoTexto,
} from './config-orquestracao-texto.js';
import { obterPromptBruto, salvarPrompt } from './prompt.js';
import {
  obterPromptOcr,
  obterPromptOcrForcado,
  salvarPromptOcr,
  salvarPromptOcrForcado,
} from './config-ocr.js';

export type AlvoPatchTreinamento =
  | 'prompt_sistema'
  | 'orquestracao_texto'
  | 'mensagens_fluxo'
  | 'ocr_prompt'
  | 'ocr_prompt_forcado';
export type OperacaoPatchTreinamento = 'replace' | 'append' | 'prepend';

export interface PatchTreinamentoAplicavel {
  alvo: AlvoPatchTreinamento;
  chave?: string | null;
  operacao: OperacaoPatchTreinamento;
  trechoAtual?: string | null;
  textoProposto: string;
}

export interface AlvoTreinamentoAtual {
  alvo: AlvoPatchTreinamento;
  chave: string | null;
  textoAtual: string;
}

function textoValorAtual(valor: unknown): string {
  if (Array.isArray(valor)) return valor.map((item) => String(item).trim()).filter(Boolean).join('\n');
  return String(valor ?? '').trim();
}

function aplicarTextoPatch(textoAtual: string, patch: PatchTreinamentoAplicavel): string {
  const atual = String(textoAtual ?? '');
  const proposto = String(patch.textoProposto ?? '').trim();
  const trecho = String(patch.trechoAtual ?? '').trim();
  if (!proposto) throw new Error('textoProposto e obrigatorio para aplicar o patch');

  if (patch.operacao === 'replace') {
    if (trecho && atual.includes(trecho)) return atual.replace(trecho, proposto);
    if (trecho) {
      // Fallback: regex flexivel para espacos e quebras de linha que o LLM tenha errado
      const regexSource = trecho
        .split(/\s+/)
        .filter(Boolean)
        .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('\\s+');
      if (regexSource) {
        const trechoRegex = new RegExp(regexSource);
        if (trechoRegex.test(atual)) {
          return atual.replace(trechoRegex, proposto);
        }
      }
    }
    if (!trecho) return proposto;
    throw new Error('trechoAtual nao foi encontrado no alvo real');
  }

  if (patch.operacao === 'prepend') {
    return atual.trim() ? `${proposto}\n\n${atual}` : proposto;
  }

  return atual.trim() ? `${atual}\n\n${proposto}` : proposto;
}

export function aplicarTextoPatchParaTeste(
  textoAtual: string,
  patch: PatchTreinamentoAplicavel,
): string {
  return aplicarTextoPatch(textoAtual, patch);
}

function garantirChaveMensagem(
  chave: string | null | undefined,
): keyof ConfigMensagensFluxo {
  if (!chave) throw new Error('chave da mensagem de fluxo e obrigatoria');
  return chave as keyof ConfigMensagensFluxo;
}

function garantirChaveOrquestracao(
  chave: string | null | undefined,
): keyof ConfigOrquestracaoTexto {
  if (chave === 'camadaHumana' || chave === 'instrucaoFormatacao') return chave;
  throw new Error('chave da orquestracao deve ser camadaHumana ou instrucaoFormatacao');
}

export async function obterAlvoTreinamentoAtual(
  alvo: AlvoPatchTreinamento,
  chave?: string | null,
): Promise<AlvoTreinamentoAtual> {
  if (alvo === 'prompt_sistema') {
    return { alvo, chave: null, textoAtual: await obterPromptBruto() };
  }
  if (alvo === 'ocr_prompt') {
    return { alvo, chave: null, textoAtual: await obterPromptOcr() };
  }
  if (alvo === 'ocr_prompt_forcado') {
    return { alvo, chave: null, textoAtual: await obterPromptOcrForcado() };
  }

  if (alvo === 'orquestracao_texto') {
    const campo = garantirChaveOrquestracao(chave);
    const atual = await obterConfigOrquestracaoTexto();
    return { alvo, chave: campo, textoAtual: textoValorAtual(atual[campo]) };
  }

  const campo = garantirChaveMensagem(chave);
  const atual = await obterConfigMensagensFluxo();
  return { alvo, chave: campo, textoAtual: textoValorAtual(atual[campo]) };
}

export async function aplicarPatchTreinamento(
  patch: PatchTreinamentoAplicavel,
  origem: string,
): Promise<{
  alvo: AlvoPatchTreinamento;
  chave: string | null;
  antes: string;
  depois: string;
}> {
  const atual = await obterAlvoTreinamentoAtual(patch.alvo, patch.chave);
  const depois = aplicarTextoPatch(atual.textoAtual, patch);
  return aplicarPatchTreinamentoComTextoAtual(patch, atual, depois, origem);
}

async function aplicarPatchTreinamentoComTextoAtual(
  patch: PatchTreinamentoAplicavel,
  atual: AlvoTreinamentoAtual,
  depois: string,
  origem: string,
): Promise<{
  alvo: AlvoPatchTreinamento;
  chave: string | null;
  antes: string;
  depois: string;
}> {
  if (patch.alvo === 'prompt_sistema') {
    await salvarPrompt(depois, origem);
    return { alvo: patch.alvo, chave: null, antes: atual.textoAtual, depois };
  }
  if (patch.alvo === 'ocr_prompt') {
    await salvarPromptOcr(depois, origem);
    return { alvo: patch.alvo, chave: null, antes: atual.textoAtual, depois };
  }
  if (patch.alvo === 'ocr_prompt_forcado') {
    await salvarPromptOcrForcado(depois, origem);
    return { alvo: patch.alvo, chave: null, antes: atual.textoAtual, depois };
  }

  if (patch.alvo === 'orquestracao_texto') {
    const campo = garantirChaveOrquestracao(patch.chave);
    await salvarConfigOrquestracaoTexto({ [campo]: depois }, origem);
    return { alvo: patch.alvo, chave: campo, antes: atual.textoAtual, depois };
  }

  const campo = garantirChaveMensagem(patch.chave);
  const base = await obterConfigMensagensFluxo();
  const valorAtual = base[campo];
  const salvo = Array.isArray(valorAtual)
    ? { [campo]: depois.split('\n').map((item) => item.trim()).filter(Boolean) }
    : { [campo]: depois };
  await salvarConfigMensagensFluxo(salvo, origem);
  return { alvo: patch.alvo, chave: campo, antes: atual.textoAtual, depois };
}

export async function simularPatchTreinamento(
  patch: PatchTreinamentoAplicavel,
): Promise<{ alvo: AlvoPatchTreinamento; chave: string | null; antes: string; depois: string }> {
  const atual = await obterAlvoTreinamentoAtual(patch.alvo, patch.chave);
  const depois = aplicarTextoPatch(atual.textoAtual, patch);
  return { alvo: patch.alvo, chave: atual.chave, antes: atual.textoAtual, depois };
}

