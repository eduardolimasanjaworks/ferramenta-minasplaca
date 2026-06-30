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
export declare function definirProdutos(novos: Produto[]): void;
export declare function listarProdutos(): Produto[];
export declare function calcularOrcamento(solicitacao: Array<{
    nome: string;
    quantidade: number;
}>): Orcamento;
export declare function textoOrcamento(orcamento: Orcamento): string;
