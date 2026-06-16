/**
 * Montagem de mensagem de oferta — texto fixo do ERP (nunca LLM).
 */
export interface DadosOfertaDisparo {
  origem: string;
  destino: string;
  operacao?: string;
  valorOfertado: number;
  produto?: string;
}

export function montarMensagemOferta(dados: DadosOfertaDisparo): string {
  const valor = Number(dados.valorOfertado);
  const valorFmt = Number.isFinite(valor)
    ? valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
    : '—';

  const linhas = [
    'Adriano - GMX / CargoX',
    '',
    `Temos carga ${dados.origem} → ${dados.destino}`,
  ];

  if (dados.produto?.trim()) {
    linhas.push(`Produto: ${dados.produto.trim()}`);
  }
  if (dados.operacao?.trim()) {
    linhas.push(`Operação: ${dados.operacao.trim()}`);
  }

  linhas.push(`Valor: ${valorFmt}`, '', 'Tem interesse?');

  return linhas.join('\n');
}
