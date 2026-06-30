export interface Produto {
    id: string;
    nome: string;
    sku: string;
    preco_unitario: number;
    quantidade_minima: number;
    unidade: string;
    observacao?: string;
}
export interface ItemOrcamento {
    produto: Produto;
    quantidade: number;
    subtotal: number;
    observacao?: string;
}
export interface Orcamento {
    itens: ItemOrcamento[];
    total: number;
    observacoes: string[];
}
export declare function calcularOrcamento(mensagem: string): Promise<Orcamento | null>;
export declare function formatarOrcamento(orcamento: Orcamento): string;
