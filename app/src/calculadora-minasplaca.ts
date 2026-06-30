/**
 * Calculadora comercial Minas Placa.
 */

export interface Produto {
  nome: string;
  sku: string;
  precoUnitario: number;
  quantidadeMinima: number;
  unidade: string;
  observacao?: string;
}

export interface ItemOrcamento {
  produto: Produto;
  quantidade: number;
  total: number;
}

export interface Orcamento {
  itens: ItemOrcamento[];
  total: number;
  observacoes: string[];
}

const PRODUTOS_PADRAO: Produto[] = [
  { nome: 'Placa de sinalizacao', sku: 'PLACA-SINAL', precoUnitario: 45.0, quantidadeMinima: 1, unidade: 'un' },
  { nome: 'Placa de aluminio', sku: 'PLACA-ALU', precoUnitario: 120.0, quantidadeMinima: 1, unidade: 'un' },
  { nome: 'Placa de PVC', sku: 'PLACA-PVC', precoUnitario: 35.0, quantidadeMinima: 5, unidade: 'un' },
  { nome: 'Adesivo refletivo', sku: 'ADES-REF', precoUnitario: 15.0, quantidadeMinima: 10, unidade: 'm' },
];

let produtos: Produto[] = [...PRODUTOS_PADRAO];

export function definirProdutos(novos: Produto[]): void {
  produtos = [...novos];
}

export function listarProdutos(): Produto[] {
  return [...produtos];
}

export function calcularOrcamento(solicitacao: Array<{ nome: string; quantidade: number }>): Orcamento {
  const itens: ItemOrcamento[] = [];
  const observacoes: string[] = [];
  let total = 0;

  for (const s of solicitacao) {
    const produto = produtos.find(
      (p) => p.nome.toLowerCase() === s.nome.toLowerCase() || p.sku.toLowerCase() === s.nome.toLowerCase(),
    );
    if (!produto) {
      observacoes.push(`Produto "${s.nome}" nao encontrado.`);
      continue;
    }
    const qtd = Math.max(s.quantidade, produto.quantidadeMinima);
    if (s.quantidade < produto.quantidadeMinima) {
      observacoes.push(`Quantidade de "${produto.nome}" ajustada para minimo ${produto.quantidadeMinima} ${produto.unidade}.`);
    }
    const itemTotal = qtd * produto.precoUnitario;
    itens.push({ produto, quantidade: qtd, total: itemTotal });
    total += itemTotal;
  }

  return { itens, total, observacoes };
}

export function textoOrcamento(orcamento: Orcamento): string {
  if (!orcamento.itens.length) return 'Nao consegui identificar os produtos. Pode reformular?';
  const linhas = orcamento.itens.map(
    (i) => `- ${i.produto.nome}: ${i.quantidade} ${i.produto.unidade} x R$ ${i.produto.precoUnitario.toFixed(2)} = R$ ${i.total.toFixed(2)}`,
  );
  const obs = orcamento.observacoes.length ? `\nObservacoes:\n${orcamento.observacoes.map((o) => `- ${o}`).join('\n')}` : '';
  return `Orcamento:\n${linhas.join('\n')}\n*Total: R$ ${orcamento.total.toFixed(2)}*${obs}`;
}
