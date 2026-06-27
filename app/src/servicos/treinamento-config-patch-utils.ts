/**
 * Reune utilitarios puros do patch trainer para manter a camada menor.
 * Faz saneamento de telefone, cortes de preview e parse de arrays persistidos.
 * Mantem a parte deterministica desacoplada do banco e das rotas.
 */
import type {
  AlvoPatchTreinamento,
  OperacaoPatchTreinamento,
  PatchTreinamentoAplicavel,
} from './treinamento-config-alvos.js';

export function telefoneSeguro(valor?: string): string {
  return String(valor || '').replace(/\D/g, '') || 'dashboard';
}

export function cortar(texto: string, limite = 900): string {
  const sane = String(texto || '').trim();
  return sane.length <= limite ? sane : `${sane.slice(0, limite)}...`;
}

export function parseLista<T>(valor: unknown): T[] {
  if (Array.isArray(valor)) return valor as T[];
  if (typeof valor === 'string' && valor.trim()) {
    try {
      const parsed = JSON.parse(valor);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function normalizarOperacoes(valor: unknown): PatchTreinamentoAplicavel[] {
  const lista = Array.isArray(valor) ? valor : [];
  return lista
    .map((item) => {
      const row = item as Record<string, unknown>;
      return {
        alvo: String(row.alvo || 'prompt_sistema') as AlvoPatchTreinamento,
        chave: row.chave ? String(row.chave) : null,
        operacao: String(row.operacao || 'append') as OperacaoPatchTreinamento,
        trechoAtual: row.trechoAtual ? String(row.trechoAtual) : null,
        textoProposto: String(row.textoProposto || '').trim(),
      };
    })
    .filter((item) => item.textoProposto);
}
