/**
 * Runtime Fase 7 — padrões de linguagem do motorista + silêncio inteligente.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  mensagemObviamenteEncerramento,
  registrarPadroesEncerramentoHistorico,
  assistenteEncerrouConversa,
  type AvaliacaoEncerramento,
} from '../util/mensagem-encerramento.js';
import {
  buscarLinguagemSimilar,
  encerramentoPorSimilaridadeHistorico,
} from './qdrant-linguagem.js';

let padroesCarregados = false;

function carregarPadroesEncerramentoArquivo(): void {
  if (padroesCarregados) return;
  padroesCarregados = true;

  const caminhos = [
    resolve(process.cwd(), '../data/padroes-encerramento-motorista.json'),
    resolve(process.cwd(), 'data/padroes-encerramento-motorista.json'),
    '/app/data/padroes-encerramento-motorista.json',
  ];

  for (const caminho of caminhos) {
    if (!existsSync(caminho)) continue;
    try {
      const dados = JSON.parse(readFileSync(caminho, 'utf-8')) as { frases?: string[] };
      if (Array.isArray(dados.frases) && dados.frases.length > 0) {
        registrarPadroesEncerramentoHistorico(dados.frases);
        console.log(`[linguagem-motorista] ${dados.frases.length} padrões de encerramento carregados`);
      }
      return;
    } catch {
      /* tenta próximo */
    }
  }
}

export async function avaliarSeDeveResponder(
  textoMotorista: string,
  ultimaRespostaAssistente?: string,
): Promise<AvaliacaoEncerramento & { usarHistorico?: boolean }> {
  carregarPadroesEncerramentoArquivo();

  const regras = mensagemObviamenteEncerramento(textoMotorista, ultimaRespostaAssistente);
  if (regras.encerrar) return regras;

  if (!assistenteEncerrouConversa(ultimaRespostaAssistente)) {
    return { encerrar: false };
  }

  const similares = await buscarLinguagemSimilar(textoMotorista, 2);
  if (encerramentoPorSimilaridadeHistorico(textoMotorista, similares)) {
    return {
      encerrar: true,
      motivo: 'similar_encerramento_historico',
      confianca: 'media',
      usarHistorico: true,
    };
  }

  return { encerrar: false };
}

export async function contextoLinguagemMotoristaParaPrompt(mensagem: string): Promise<string> {
  const similares = await buscarLinguagemSimilar(mensagem, 2);
  if (similares.length === 0 || similares[0].score < 0.75) return '';

  const linhas = similares
    .filter((s) => s.score >= 0.75 && !s.encerramento)
    .map((s) => `- motoristas similares disseram: "${s.texto}" (${s.intencao})`);

  if (linhas.length === 0) return '';
  return `=== REFERÊNCIA — COMO MOTORISTAS FALAM (não copie literalmente) ===\n${linhas.join('\n')}`;
}
