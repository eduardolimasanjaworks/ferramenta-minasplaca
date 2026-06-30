/**
 * Calculadora comercial Minas Placa — busca produtos do Directus.
 */
import { config } from './config.js';
let tokenDirectus = null;
let tokenExpiraEm = 0;
async function obterTokenDirectus() {
    if (tokenDirectus && Date.now() < tokenExpiraEm - 60_000)
        return tokenDirectus;
    try {
        const res = await fetch(`${config.directusUrl}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: config.directusAdminEmail, password: config.directusAdminPassword }),
        });
        if (!res.ok)
            return null;
        const data = await res.json();
        if (data.data?.access_token) {
            tokenDirectus = data.data.access_token;
            tokenExpiraEm = Date.now() + (data.data.expires ?? 900_000);
            return tokenDirectus;
        }
    }
    catch (err) {
        console.error('[calculadora] erro login Directus:', err);
    }
    return null;
}
async function buscarProdutosDirectus() {
    const token = await obterTokenDirectus();
    if (!token)
        return produtosPadrao();
    try {
        const res = await fetch(`${config.directusUrl}/items/minasplaca_produtos`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok)
            throw new Error(`Directus ${res.status}`);
        const data = await res.json();
        return data.data ?? [];
    }
    catch (err) {
        console.error('[calculadora] erro ao buscar produtos do Directus:', err);
        return produtosPadrao();
    }
}
function produtosPadrao() {
    return [
        { id: '1', nome: 'Placa de sinalizacao', sku: 'PLACA-SINAL', preco_unitario: 45, quantidade_minima: 1, unidade: 'un', observacao: 'Placas padrao de sinalizacao' },
        { id: '2', nome: 'Placa de aluminio', sku: 'PLACA-ALU', preco_unitario: 120, quantidade_minima: 1, unidade: 'un', observacao: 'Aluminio resistente' },
        { id: '3', nome: 'Placa de PVC', sku: 'PLACA-PVC', preco_unitario: 35, quantidade_minima: 5, unidade: 'un', observacao: 'PVC economico' },
        { id: '4', nome: 'Adesivo refletivo', sku: 'ADES-REF', preco_unitario: 15, quantidade_minima: 10, unidade: 'm', observacao: 'Por metro linear' },
    ];
}
function normalizar(texto) {
    return texto
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u030f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
function paraSingular(texto) {
    return texto
        .replace(/placas/g, 'placa')
        .replace(/etiquetas/g, 'etiqueta')
        .replace(/adesivos/g, 'adesivo')
        .replace(/materiais/g, 'material')
        .replace(/placas de/g, 'placa de');
}
function produtoMencionado(texto, produto) {
    const t = paraSingular(normalizar(texto));
    const nome = paraSingular(normalizar(produto.nome));
    const sku = normalizar(produto.sku);
    if (t.includes(nome))
        return true;
    if (t.includes(sku))
        return true;
    const partes = nome.split(' ').filter(p => p.length >= 3);
    if (partes.length >= 2 && partes.every(p => t.includes(p)))
        return true;
    return false;
}
export async function calcularOrcamento(mensagem) {
    const produtos = await buscarProdutosDirectus();
    const itens = [];
    const observacoes = [];
    for (const produto of produtos) {
        if (produtoMencionado(mensagem, produto)) {
            const qtdExtraida = extrairQuantidade(mensagem, produto);
            const quantidade = Math.max(qtdExtraida, produto.quantidade_minima);
            const subtotal = quantidade * produto.preco_unitario;
            if (qtdExtraida < produto.quantidade_minima) {
                observacoes.push(`Quantidade minima para ${produto.nome}: ${produto.quantidade_minima} ${produto.unidade}.`);
            }
            itens.push({ produto, quantidade, subtotal });
        }
    }
    if (itens.length === 0)
        return null;
    return { itens, total: itens.reduce((s, i) => s + i.subtotal, 0), observacoes };
}
function extrairQuantidade(texto, produto) {
    const nome = paraSingular(normalizar(produto.nome)).replace(/\s+/g, '\\s+');
    const regex = new RegExp(`(\\d+)\s*(?:un|unidade|und|metros?|m|peças?|pecas?|placas?|etiquetas?|adesivos?)?\s*(?:de|da|do)?\s*${nome}|${nome}\s*(?:de|da|do)?\s*(\\d+)\s*(?:un|unidade|und|metros?|m|peças?|pecas?|placas?|etiquetas?|adesivos?)?`, 'i');
    const match = texto.match(regex);
    if (match) {
        const num = match[1] ?? match[2];
        if (num)
            return parseInt(num, 10);
    }
    return 1;
}
export function formatarOrcamento(orcamento) {
    const linhas = orcamento.itens.map((i) => `- ${i.quantidade} ${i.produto.unidade} x ${i.produto.nome} (R$ ${i.produto.preco_unitario.toFixed(2)}/${i.produto.unidade}) = R$ ${i.subtotal.toFixed(2)}`);
    let texto = `Orcamento:\n${linhas.join('\n')}\n*Total: R$ ${orcamento.total.toFixed(2)}*`;
    if (orcamento.observacoes.length) {
        texto += `\n\nObservacoes:\n${orcamento.observacoes.join('\n')}`;
    }
    return texto;
}
