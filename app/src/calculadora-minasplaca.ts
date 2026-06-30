/**
 * Calculadora comercial Minas Placa — busca produtos do Directus.
 */
import { config } from './config.js';

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

let tokenDirectus: string | null = null;
let tokenExpiraEm = 0;

async function obterTokenDirectus(): Promise<string | null> {
  if (tokenDirectus && Date.now() < tokenExpiraEm - 60_000) return tokenDirectus;
  try {
    const res = await fetch(`${config.directusUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: config.directusAdminEmail, password: config.directusAdminPassword }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { data?: { access_token?: string; expires?: number } };
    if (data.data?.access_token) {
      tokenDirectus = data.data.access_token;
      tokenExpiraEm = Date.now() + (data.data.expires ?? 900_000);
      return tokenDirectus;
    }
  } catch (err) {
    console.error('[calculadora] erro login Directus:', err);
  }
  return null;
}

async function buscarProdutosDirectus(): Promise<Produto[]> {
  const token = await obterTokenDirectus();
  if (!token) return produtosPadrao();
  try {
    const res = await fetch(`${config.directusUrl}/items/minasplaca_produtos`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Directus ${res.status}`);
    const data = await res.json() as { data?: Produto[] };
    return data.data ?? [];
  } catch (err) {
    console.error('[calculadora] erro ao buscar produtos do Directus:', err);
    return produtosPadrao();
  }
}

function produtosPadrao(): Produto[] {
  return [
    { id: '1', nome: 'Placa de sinalizacao', sku: 'PLACA-SINAL', preco_unitario: 45, quantidade_minima: 1, unidade: 'un', observacao: 'Placas padrao de sinalizacao' },
    { id: '2', nome: 'Placa de aluminio', sku: 'PLACA-ALU', preco_unitario: 120, quantidade_minima: 1, unidade: 'un', observacao: 'Aluminio resistente' },
    { id: '3', nome: 'Placa de PVC', sku: 'PLACA-PVC', preco_unitario: 35, quantidade_minima: 5, unidade: 'un', observacao: 'PVC economico' },
    { id: '4', nome: 'Adesivo refletivo', sku: 'ADES-REF', preco_unitario: 15, quantidade_minima: 10, unidade: 'm', observacao: 'Por metro linear' },
  ];
}

function limpar(texto: string): string {
  return texto
    .toLowerCase()
    .replace(/[\u0300-\u030f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function singularizar(texto: string): string {
  return texto
    .replace(/\bplacas\b/g, 'placa')
    .replace(/\betiquetas\b/g, 'etiqueta')
    .replace(/\badesivos\b/g, 'adesivo')
    .replace(/\bmateriais\b/g, 'material')
    .replace(/\brefletivos\b/g, 'refletivo')
    .replace(/\b(\w{3,})s\b/g, '$1');
}

function termosProduto(produto: Produto): string[] {
  const base = singularizar(limpar(produto.nome));
  const semDe = base.replace(/\b(de|do|da)\b/g, '').replace(/\s+/g, ' ').trim();
  const sku = limpar(produto.sku);
  return [...new Set([base, semDe, sku])].filter(Boolean);
}

function produtoMencionado(texto: string, produto: Produto): boolean {
  const t = ' ' + singularizar(limpar(texto)) + ' ';
  const termos = termosProduto(produto);
  for (const termo of termos) {
    if (termo.length >= 3 && t.includes(' ' + termo + ' ')) return true;
  }
  return false;
}

export async function calcularOrcamento(mensagem: string): Promise<Orcamento | null> {
  const produtos = await buscarProdutosDirectus();
  const itens: ItemOrcamento[] = [];
  const observacoes: string[] = [];

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

  if (itens.length === 0) return null;
  return { itens, total: itens.reduce((s, i) => s + i.subtotal, 0), observacoes };
}

function extrairQuantidade(texto: string, produto: Produto): number {
  const t = singularizar(limpar(texto));
  const termos = termosProduto(produto);
  let melhorQtd = 1;
  let melhorDist = Infinity;

  for (const termo of termos) {
    if (termo.length < 3) continue;
    const regex = new RegExp(`${termo}`, 'gi');
    let match: RegExpExecArray | null;
    while ((match = regex.exec(t)) !== null) {
      const trecho = t.substring(Math.max(0, match.index - 30), match.index);
      const nums = trecho.match(/(\d+)\s*(?:un|unidade|und|metro|metros|m|peca|pecas|placa|placas|etiqueta|etiquetas|adesivo|adesivos)?\b/gi);
      if (nums && nums.length) {
        const q = parseInt(nums[nums.length - 1].match(/\d+/)![0], 10);
        const dist = match.index - (trecho.lastIndexOf(String(q)) + Math.max(0, match.index - 30));
        if (dist < melhorDist && q > 0 && q < 1000000) {
          melhorDist = dist;
          melhorQtd = q;
        }
      }
    }
  }
  return melhorQtd;
}

export function formatarOrcamento(orcamento: Orcamento): string {
  const linhas = orcamento.itens.map((i) =>
    `- ${i.quantidade} ${i.produto.unidade} x ${i.produto.nome} (R$ ${i.produto.preco_unitario.toFixed(2)}/${i.produto.unidade}) = R$ ${i.subtotal.toFixed(2)}`
  );
  let texto = `Orcamento:\n${linhas.join('\n')}\n*Total: R$ ${orcamento.total.toFixed(2)}*`;
  if (orcamento.observacoes.length) {
    texto += `\n\nObservacoes:\n${orcamento.observacoes.join('\n')}`;
  }
  return texto;
}
