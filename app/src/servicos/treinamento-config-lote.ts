/**
 * Agrupa operacoes de patch por alvo real para simular e aplicar em lote.
 * Evita salvar varias vezes o mesmo texto quando o treinador pede varios ajustes.
 * Mantem previews por alvo para a UI e para o modo treinador no WhatsApp.
 */
import {
  obterConfigMensagensFluxo,
  salvarConfigMensagensFluxo,
} from './config-mensagens-fluxo.js';
import {
  obterConfigOrquestracaoTexto,
  salvarConfigOrquestracaoTexto,
} from './config-orquestracao-texto.js';
import { obterPromptBruto, salvarPrompt } from './prompt.js';
import {
  aplicarTextoPatchParaTeste,
  type AlvoPatchTreinamento,
  type PatchTreinamentoAplicavel,
} from './treinamento-config-alvos.js';
import {
  obterPromptOcr,
  obterPromptOcrForcado,
  salvarPromptOcr,
  salvarPromptOcrForcado,
} from './config-ocr.js';
import {
  listarOcrDocumentos,
  salvarOcrDocumentos,
  type OcrDocumentoConfig,
} from './config-ocr-documentos.js';

export interface PreviewPatchTreinamento {
  alvo: AlvoPatchTreinamento;
  chave: string | null;
  antes: string;
  depois: string;
}

function chaveGrupo(item: Pick<PatchTreinamentoAplicavel, 'alvo' | 'chave'>): string {
  return `${item.alvo}:${item.chave || ''}`;
}

function textoValorAtual(valor: unknown): string {
  if (Array.isArray(valor)) return valor.map((item) => String(item).trim()).filter(Boolean).join('\n');
  return String(valor ?? '').trim();
}

async function obterTextoAtual(
  alvo: AlvoPatchTreinamento,
  chave: string | null | undefined,
): Promise<string> {
  if (alvo === 'prompt_sistema') return obterPromptBruto();
  if (alvo === 'ocr_prompt') return obterPromptOcr();
  if (alvo === 'ocr_prompt_forcado') return obterPromptOcrForcado();
  if (alvo === 'ocr_documentos_schema') {
    const docs = await listarOcrDocumentos();
    return JSON.stringify(docs, null, 2);
  }
  if (alvo === 'orquestracao_texto') {
    const atual = await obterConfigOrquestracaoTexto();
    return textoValorAtual(atual[chave as keyof typeof atual]);
  }
  const atual = await obterConfigMensagensFluxo();
  return textoValorAtual(atual[chave as keyof typeof atual]);
}

export async function salvarTextoAtualizado(
  alvo: AlvoPatchTreinamento,
  chave: string | null,
  texto: string,
  origem: string,
): Promise<void> {
  if (alvo === 'prompt_sistema') {
    await salvarPrompt(texto, origem);
    return;
  }
  if (alvo === 'ocr_prompt') {
    await salvarPromptOcr(texto, origem);
    return;
  }
  if (alvo === 'ocr_prompt_forcado') {
    await salvarPromptOcrForcado(texto, origem);
    return;
  }
  if (alvo === 'ocr_documentos_schema') {
    try {
      const docs = JSON.parse(texto) as OcrDocumentoConfig[];
      await salvarOcrDocumentos(docs, origem);
    } catch {
      throw new Error('Schema OCR invalido: JSON malformado');
    }
    return;
  }
  if (alvo === 'orquestracao_texto') {
    await salvarConfigOrquestracaoTexto({ [String(chave)]: texto }, origem);
    return;
  }
  const base = await obterConfigMensagensFluxo();
  const valorAtual = base[String(chave) as keyof typeof base];
  const salvo = Array.isArray(valorAtual)
    ? { [String(chave)]: texto.split('\n').map((item) => item.trim()).filter(Boolean) }
    : { [String(chave)]: texto };
  await salvarConfigMensagensFluxo(salvo, origem);
}

export async function simularLotePatchesTreinamento(
  operacoes: PatchTreinamentoAplicavel[],
): Promise<PreviewPatchTreinamento[]> {
  const grupos = new Map<string, PatchTreinamentoAplicavel[]>();
  for (const operacao of operacoes) {
    const chave = chaveGrupo(operacao);
    grupos.set(chave, [...(grupos.get(chave) || []), operacao]);
  }
  const previews: PreviewPatchTreinamento[] = [];

  for (const ops of grupos.values()) {
    const primeira = ops[0];
    const antes = await obterTextoAtual(primeira.alvo, primeira.chave);
    const depois = ops.reduce(
      (texto, operacao) => aplicarTextoPatchParaTeste(texto, operacao),
      antes,
    );
    previews.push({
      alvo: primeira.alvo,
      chave: primeira.chave ?? null,
      antes,
      depois,
    });
  }

  return previews;
}

export async function aplicarLotePatchesTreinamento(
  operacoes: PatchTreinamentoAplicavel[],
  origem: string,
): Promise<PreviewPatchTreinamento[]> {
  const previews = await simularLotePatchesTreinamento(operacoes);
  for (const item of previews) {
    await salvarTextoAtualizado(item.alvo, item.chave, item.depois, origem);
  }
  return previews;
}
