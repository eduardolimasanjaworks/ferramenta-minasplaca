/**
 * Calculadora comercial Minas Placa — Tabelas oficiais de preços (jun/2025).
 * Esta função é chamada como Tool pela IA com parâmetros estruturados.
 * Nunca extrai dados de texto — recebe os dados já validados.
 */

export interface ItemOrcamento {
  material: string;
  largura: number;
  comprimento: number;
  quantidade: number;
  precoUnitario: number;
  subtotal: number;
  observacoes: string[];
}

export interface Orcamento {
  itens: ItemOrcamento[];
  total: number;
  observacoes: string[];
}

export interface ParamsCalculo {
  material: string;
  largura: number;        // mm
  comprimento: number;    // mm
  quantidade: number;
  impressao_uv?: boolean; // só para poliéster e void
  inox_430?: boolean;     // desconto R$0,08 por unidade
  espessura_pvc?: string; // "1mm" ou "2mm"
}

// -----------------------------------------------------------------------------
// MATRIZES DE PREÇOS OFICIAIS (Tabelas originais Minas Placa)
// -----------------------------------------------------------------------------

interface FaixaPreco {
  min: number;
  max: number;
  precos: { [tamanho: string]: number };
}

// GRUPO DE TAMANHOS — chave de lookup para cada material
// Poliéster / Void / Vinil / Destrutível: grupos de tamanhos com mesmo preço
// 30x10 e 30x15 → mesmo grupo ("30x15")
// 40x20 e 50x20 → mesmo grupo ("40x20")
// 54x27 e 60x28 → mesmo grupo ("54x27")

// A) POLIÉSTER (Impressão Térmica; +R$0,05 por UV)
const TABELA_POLIESTER: FaixaPreco[] = [
  { min: 51,    max: 99,       precos: { "30x15": 2.00, "40x13": 2.02, "45x15": 2.03, "40x20": 2.05, "54x27": 2.08 } },
  { min: 100,   max: 199,      precos: { "30x15": 1.00, "40x13": 1.02, "45x15": 1.03, "40x20": 1.05, "54x27": 1.08 } },
  { min: 200,   max: 299,      precos: { "30x15": 0.70, "40x13": 0.72, "45x15": 0.73, "40x20": 0.75, "54x27": 0.78 } },
  { min: 300,   max: 499,      precos: { "30x15": 0.60, "40x13": 0.62, "45x15": 0.63, "40x20": 0.65, "54x27": 0.68 } },
  { min: 500,   max: 799,      precos: { "30x15": 0.45, "40x13": 0.47, "45x15": 0.48, "40x20": 0.50, "54x27": 0.53 } },
  { min: 800,   max: 999,      precos: { "30x15": 0.35, "40x13": 0.37, "45x15": 0.38, "40x20": 0.40, "54x27": 0.43 } },
  { min: 1000,  max: 1999,     precos: { "30x15": 0.29, "40x13": 0.31, "45x15": 0.32, "40x20": 0.34, "54x27": 0.37 } },
  { min: 2000,  max: 4999,     precos: { "30x15": 0.27, "40x13": 0.29, "45x15": 0.30, "40x20": 0.32, "54x27": 0.35 } },
  { min: 5000,  max: 7999,     precos: { "30x15": 0.25, "40x13": 0.27, "45x15": 0.28, "40x20": 0.30, "54x27": 0.33 } },
  { min: 8000,  max: 11999,    precos: { "30x15": 0.22, "40x13": 0.24, "45x15": 0.25, "40x20": 0.27, "54x27": 0.30 } },
  { min: 12000, max: 14999,    precos: { "30x15": 0.20, "40x13": 0.22, "45x15": 0.23, "40x20": 0.25, "54x27": 0.28 } },
  { min: 15000, max: 19999,    precos: { "30x15": 0.18, "40x13": 0.20, "45x15": 0.21, "40x20": 0.23, "54x27": 0.26 } },
  { min: 20000, max: Infinity, precos: { "30x15": 0.17, "40x13": 0.19, "45x15": 0.20, "40x20": 0.22, "54x27": 0.25 } },
];

// B) VOID (Impressão Térmica; +R$0,05 por UV)
const TABELA_VOID: FaixaPreco[] = [
  { min: 51,    max: 99,       precos: { "30x15": 2.02, "40x13": 2.04, "45x15": 2.05, "40x20": 2.07, "54x27": 2.10 } },
  { min: 100,   max: 199,      precos: { "30x15": 1.02, "40x13": 1.04, "45x15": 1.05, "40x20": 1.07, "54x27": 1.10 } },
  { min: 200,   max: 299,      precos: { "30x15": 0.72, "40x13": 0.74, "45x15": 0.75, "40x20": 0.77, "54x27": 0.80 } },
  { min: 300,   max: 499,      precos: { "30x15": 0.62, "40x13": 0.64, "45x15": 0.65, "40x20": 0.67, "54x27": 0.70 } },
  { min: 500,   max: 799,      precos: { "30x15": 0.47, "40x13": 0.49, "45x15": 0.50, "40x20": 0.52, "54x27": 0.55 } },
  { min: 800,   max: 999,      precos: { "30x15": 0.37, "40x13": 0.39, "45x15": 0.40, "40x20": 0.42, "54x27": 0.45 } },
  { min: 1000,  max: 1999,     precos: { "30x15": 0.31, "40x13": 0.33, "45x15": 0.34, "40x20": 0.36, "54x27": 0.39 } },
  { min: 2000,  max: 4999,     precos: { "30x15": 0.29, "40x13": 0.31, "45x15": 0.32, "40x20": 0.34, "54x27": 0.37 } },
  { min: 5000,  max: 7999,     precos: { "30x15": 0.27, "40x13": 0.29, "45x15": 0.30, "40x20": 0.32, "54x27": 0.35 } },
  { min: 8000,  max: 11999,    precos: { "30x15": 0.24, "40x13": 0.26, "45x15": 0.27, "40x20": 0.29, "54x27": 0.32 } },
  { min: 12000, max: 14999,    precos: { "30x15": 0.22, "40x13": 0.24, "45x15": 0.25, "40x20": 0.27, "54x27": 0.30 } },
  { min: 15000, max: 19999,    precos: { "30x15": 0.20, "40x13": 0.22, "45x15": 0.23, "40x20": 0.25, "54x27": 0.28 } },
  { min: 20000, max: Infinity, precos: { "30x15": 0.19, "40x13": 0.21, "45x15": 0.22, "40x20": 0.24, "54x27": 0.27 } },
];

// C) VINIL PREMIUM SEIWA (Impressão UV inclusa)
const TABELA_VINIL: FaixaPreco[] = [
  { min: 51,    max: 99,       precos: { "30x15": 2.04, "40x13": 2.06, "45x15": 2.07, "40x20": 2.09, "54x27": 2.12 } },
  { min: 100,   max: 199,      precos: { "30x15": 1.04, "40x13": 1.06, "45x15": 1.07, "40x20": 1.09, "54x27": 1.12 } },
  { min: 200,   max: 299,      precos: { "30x15": 0.74, "40x13": 0.76, "45x15": 0.77, "40x20": 0.79, "54x27": 0.82 } },
  { min: 300,   max: 499,      precos: { "30x15": 0.64, "40x13": 0.66, "45x15": 0.67, "40x20": 0.69, "54x27": 0.72 } },
  { min: 500,   max: 799,      precos: { "30x15": 0.49, "40x13": 0.51, "45x15": 0.52, "40x20": 0.54, "54x27": 0.57 } },
  { min: 800,   max: 999,      precos: { "30x15": 0.39, "40x13": 0.41, "45x15": 0.42, "40x20": 0.44, "54x27": 0.47 } },
  { min: 1000,  max: 1999,     precos: { "30x15": 0.33, "40x13": 0.35, "45x15": 0.36, "40x20": 0.38, "54x27": 0.41 } },
  { min: 2000,  max: 4999,     precos: { "30x15": 0.31, "40x13": 0.33, "45x15": 0.34, "40x20": 0.36, "54x27": 0.39 } },
  { min: 5000,  max: 7999,     precos: { "30x15": 0.29, "40x13": 0.31, "45x15": 0.32, "40x20": 0.34, "54x27": 0.37 } },
  { min: 8000,  max: 11999,    precos: { "30x15": 0.26, "40x13": 0.28, "45x15": 0.29, "40x20": 0.31, "54x27": 0.34 } },
  { min: 12000, max: 14999,    precos: { "30x15": 0.24, "40x13": 0.26, "45x15": 0.27, "40x20": 0.29, "54x27": 0.32 } },
  { min: 15000, max: 19999,    precos: { "30x15": 0.22, "40x13": 0.24, "45x15": 0.25, "40x20": 0.27, "54x27": 0.30 } },
  { min: 20000, max: Infinity, precos: { "30x15": 0.20, "40x13": 0.22, "45x15": 0.23, "40x20": 0.25, "54x27": 0.28 } },
];

// D) VINIL DESTRUTÍVEL / CASCA DE OVO (Mínimo 500 un; UV incluso)
const TABELA_DESTRUTIVEL: FaixaPreco[] = [
  { min: 51,    max: 99,       precos: { "30x15": 2.06, "40x13": 2.08, "45x15": 2.09, "40x20": 2.11, "54x27": 2.14 } },
  { min: 100,   max: 199,      precos: { "30x15": 1.06, "40x13": 1.08, "45x15": 1.09, "40x20": 1.11, "54x27": 1.14 } },
  { min: 200,   max: 299,      precos: { "30x15": 0.76, "40x13": 0.78, "45x15": 0.79, "40x20": 0.81, "54x27": 0.84 } },
  { min: 300,   max: 499,      precos: { "30x15": 0.66, "40x13": 0.68, "45x15": 0.69, "40x20": 0.71, "54x27": 0.74 } },
  { min: 500,   max: 799,      precos: { "30x15": 0.51, "40x13": 0.53, "45x15": 0.54, "40x20": 0.56, "54x27": 0.59 } },
  { min: 800,   max: 999,      precos: { "30x15": 0.41, "40x13": 0.43, "45x15": 0.44, "40x20": 0.46, "54x27": 0.49 } },
  { min: 1000,  max: 1999,     precos: { "30x15": 0.35, "40x13": 0.37, "45x15": 0.38, "40x20": 0.40, "54x27": 0.43 } },
  { min: 2000,  max: 4999,     precos: { "30x15": 0.33, "40x13": 0.35, "45x15": 0.36, "40x20": 0.38, "54x27": 0.41 } },
  { min: 5000,  max: 7999,     precos: { "30x15": 0.31, "40x13": 0.33, "45x15": 0.34, "40x20": 0.36, "54x27": 0.39 } },
  { min: 8000,  max: 11999,    precos: { "30x15": 0.28, "40x13": 0.30, "45x15": 0.31, "40x20": 0.33, "54x27": 0.36 } },
  { min: 12000, max: 14999,    precos: { "30x15": 0.26, "40x13": 0.28, "45x15": 0.29, "40x20": 0.31, "54x27": 0.34 } },
  { min: 15000, max: 19999,    precos: { "30x15": 0.24, "40x13": 0.26, "45x15": 0.27, "40x20": 0.29, "54x27": 0.32 } },
  { min: 20000, max: Infinity, precos: { "30x15": 0.23, "40x13": 0.25, "45x15": 0.26, "40x20": 0.28, "54x27": 0.31 } },
];

// E) FLEXTAG (UV incluso; tamanhos especiais: área cm² × R$0,08)
// Grupos: 30x15 | 40x13 | 45x15/45x13 | 40x20/46x18 | 50x20 | 54x27 | 60x28
const TABELA_FLEXTAG: FaixaPreco[] = [
  { min: 51,    max: 99,       precos: { "30x15": 2.90, "40x13": 2.92, "45x15": 2.95, "40x20": 2.97, "50x20": 3.01, "54x27": 3.02, "60x28": 3.07 } },
  { min: 100,   max: 199,      precos: { "30x15": 1.80, "40x13": 1.82, "45x15": 1.85, "40x20": 1.87, "50x20": 1.91, "54x27": 1.92, "60x28": 1.97 } },
  { min: 200,   max: 299,      precos: { "30x15": 1.40, "40x13": 1.42, "45x15": 1.45, "40x20": 1.47, "50x20": 1.51, "54x27": 1.52, "60x28": 1.57 } },
  { min: 300,   max: 499,      precos: { "30x15": 0.85, "40x13": 0.87, "45x15": 0.90, "40x20": 0.92, "50x20": 0.96, "54x27": 0.97, "60x28": 1.02 } },
  { min: 500,   max: 799,      precos: { "30x15": 0.78, "40x13": 0.80, "45x15": 0.83, "40x20": 0.85, "50x20": 0.89, "54x27": 0.90, "60x28": 0.95 } },
  { min: 800,   max: 999,      precos: { "30x15": 0.65, "40x13": 0.67, "45x15": 0.70, "40x20": 0.72, "50x20": 0.76, "54x27": 0.77, "60x28": 0.82 } },
  { min: 1000,  max: 1999,     precos: { "30x15": 0.55, "40x13": 0.57, "45x15": 0.60, "40x20": 0.62, "50x20": 0.66, "54x27": 0.67, "60x28": 0.72 } },
  { min: 2000,  max: 4999,     precos: { "30x15": 0.48, "40x13": 0.50, "45x15": 0.53, "40x20": 0.55, "50x20": 0.59, "54x27": 0.60, "60x28": 0.65 } },
  { min: 5000,  max: 7999,     precos: { "30x15": 0.45, "40x13": 0.47, "45x15": 0.50, "40x20": 0.52, "50x20": 0.56, "54x27": 0.57, "60x28": 0.62 } },
  { min: 8000,  max: 11999,    precos: { "30x15": 0.40, "40x13": 0.42, "45x15": 0.45, "40x20": 0.47, "50x20": 0.51, "54x27": 0.52, "60x28": 0.57 } },
  { min: 12000, max: 14999,    precos: { "30x15": 0.38, "40x13": 0.40, "45x15": 0.43, "40x20": 0.45, "50x20": 0.49, "54x27": 0.50, "60x28": 0.55 } },
  { min: 15000, max: 19999,    precos: { "30x15": 0.37, "40x13": 0.39, "45x15": 0.42, "40x20": 0.44, "50x20": 0.48, "54x27": 0.49, "60x28": 0.54 } },
  { min: 20000, max: Infinity, precos: { "30x15": 0.35, "40x13": 0.37, "45x15": 0.40, "40x20": 0.42, "50x20": 0.46, "54x27": 0.47, "60x28": 0.52 } },
];

// F) ALUMÍNIO (UV + verniz inclusos; tamanhos especiais: área cm² × R$0,08)
// Grupos: 30x15 | 40x13 | 45x15/45x13 | 40x20/46x18 | 50x20 | 54x27 | 60x28
const TABELA_ALUMINIO: FaixaPreco[] = [
  { min: 51,    max: 99,       precos: { "30x15": 2.92, "40x13": 2.94, "45x15": 2.97, "40x20": 2.99, "50x20": 3.03, "54x27": 3.04, "60x28": 3.09 } },
  { min: 100,   max: 199,      precos: { "30x15": 1.82, "40x13": 1.84, "45x15": 1.87, "40x20": 1.89, "50x20": 1.93, "54x27": 1.94, "60x28": 1.99 } },
  { min: 200,   max: 299,      precos: { "30x15": 1.42, "40x13": 1.44, "45x15": 1.47, "40x20": 1.49, "50x20": 1.53, "54x27": 1.54, "60x28": 1.59 } },
  { min: 300,   max: 499,      precos: { "30x15": 0.87, "40x13": 0.89, "45x15": 0.92, "40x20": 0.94, "50x20": 0.98, "54x27": 0.99, "60x28": 1.04 } },
  { min: 500,   max: 799,      precos: { "30x15": 0.80, "40x13": 0.82, "45x15": 0.85, "40x20": 0.87, "50x20": 0.91, "54x27": 0.92, "60x28": 0.97 } },
  { min: 800,   max: 999,      precos: { "30x15": 0.67, "40x13": 0.69, "45x15": 0.72, "40x20": 0.74, "50x20": 0.78, "54x27": 0.79, "60x28": 0.84 } },
  { min: 1000,  max: 1999,     precos: { "30x15": 0.57, "40x13": 0.59, "45x15": 0.62, "40x20": 0.64, "50x20": 0.68, "54x27": 0.69, "60x28": 0.74 } },
  { min: 2000,  max: 4999,     precos: { "30x15": 0.50, "40x13": 0.52, "45x15": 0.55, "40x20": 0.57, "50x20": 0.61, "54x27": 0.62, "60x28": 0.67 } },
  { min: 5000,  max: 7999,     precos: { "30x15": 0.47, "40x13": 0.49, "45x15": 0.52, "40x20": 0.54, "50x20": 0.58, "54x27": 0.59, "60x28": 0.64 } },
  { min: 8000,  max: 11999,    precos: { "30x15": 0.42, "40x13": 0.44, "45x15": 0.47, "40x20": 0.49, "50x20": 0.53, "54x27": 0.54, "60x28": 0.59 } },
  { min: 12000, max: 14999,    precos: { "30x15": 0.49, "40x13": 0.51, "45x15": 0.54, "40x20": 0.56, "50x20": 0.60, "54x27": 0.61, "60x28": 0.66 } },
  { min: 15000, max: 19999,    precos: { "30x15": 0.39, "40x13": 0.41, "45x15": 0.44, "40x20": 0.46, "50x20": 0.50, "54x27": 0.51, "60x28": 0.56 } },
  { min: 20000, max: Infinity, precos: { "30x15": 0.37, "40x13": 0.39, "45x15": 0.42, "40x20": 0.44, "50x20": 0.48, "54x27": 0.49, "60x28": 0.54 } },
];

// G) AÇO INOX 304 (apenas 45x15 e 50x20; Inox 430: -R$0,08/un)
const TABELA_AÇO_INOX: FaixaPreco[] = [
  { min: 51,   max: 100,      precos: { "45x15": 4.00, "50x20": 4.10 } },
  { min: 101,  max: 200,      precos: { "45x15": 3.80, "50x20": 3.90 } },
  { min: 201,  max: 300,      precos: { "45x15": 2.80, "50x20": 2.90 } },
  { min: 301,  max: 400,      precos: { "45x15": 2.00, "50x20": 2.10 } },
  { min: 501,  max: 700,      precos: { "45x15": 1.79, "50x20": 1.89 } },
  { min: 701,  max: 999,      precos: { "45x15": 1.69, "50x20": 1.79 } },
  { min: 1000, max: 3000,     precos: { "45x15": 1.55, "50x20": 1.65 } },
  { min: 3001, max: 4999,     precos: { "45x15": 1.45, "50x20": 1.55 } },
  { min: 5000, max: 9999,     precos: { "45x15": 1.35, "50x20": 1.45 } },
  { min: 10000, max: Infinity, precos: { "45x15": 1.20, "50x20": 1.30 } },
];

// -----------------------------------------------------------------------------
// FUNÇÕES AUXILIARES
// -----------------------------------------------------------------------------

function encontrarFaixa(quantidade: number, tabela: FaixaPreco[]): FaixaPreco | null {
  // Busca a faixa exata; se não encontrar, pega a mais próxima (menor)
  const faixa = tabela.find(f => quantidade >= f.min && quantidade <= f.max);
  if (faixa) return faixa;
  // Quantidade menor que o mínimo → usa a primeira faixa
  if (quantidade < tabela[0].min) return tabela[0];
  // Quantidade maior que o máximo → usa a última faixa
  return tabela[tabela.length - 1];
}

// Normaliza o tamanho para a chave da tabela (considera aliases de grupos)
function normalizarTamanho(largura: number, comprimento: number, material: string): string {
  // Garante sempre largura >= comprimento para lookup consistente
  const [l, c] = largura >= comprimento ? [largura, comprimento] : [comprimento, largura];
  const chave = `${l}x${c}`;

  // Aliases por material
  const aliasesComuns: Record<string, string> = {
    "30x10": "30x15",   // mesmo grupo
    "50x20": "50x20",   // coluna própria em flextag/alumínio
    "46x18": "40x20",   // alias flextag/alumínio
    "45x13": "45x15",   // alias flextag/alumínio
    "60x28": "60x28",   // coluna própria em flextag/alumínio
  };

  if (aliasesComuns[chave]) return aliasesComuns[chave];
  return chave;
}

// Encontra o tamanho mais próximo por área na tabela
function obterTamanhoMaisProximo(
  largura: number,
  comprimento: number,
  faixa: FaixaPreco
): { tamanho: string; preco: number; area: number } {
  const areaProcurada = largura * comprimento;
  let melhorTamanho = '';
  let melhorPreco = 0;
  let menorDiferenca = Infinity;
  let melhorArea = 1;

  for (const tam of Object.keys(faixa.precos)) {
    const [l, c] = tam.split('x').map(Number);
    const area = l * c;
    const diff = Math.abs(area - areaProcurada);
    if (diff < menorDiferenca) {
      menorDiferenca = diff;
      melhorTamanho = tam;
      melhorPreco = faixa.precos[tam];
      melhorArea = area;
    }
  }

  return { tamanho: melhorTamanho, preco: melhorPreco, area: melhorArea };
}

// -----------------------------------------------------------------------------
// FUNÇÃO PRINCIPAL DE CÁLCULO (chamada pelo agente via tool call)
// -----------------------------------------------------------------------------

export async function calcularOrcamento(
  inputOrParams: string | ParamsCalculo
): Promise<Orcamento | null> {

  let params: ParamsCalculo;

  // Suporte a chamada por string (legado) ou por objeto estruturado (tool call)
  if (typeof inputOrParams === 'string') {
    // Parse básico de string (fallback — a IA deve sempre passar objeto)
    const msg = inputOrParams.toLowerCase();
    let mat = '';
    if (msg.includes('poliester') || msg.includes('poliéster')) mat = 'poliester';
    else if (msg.includes('void')) mat = 'void';
    else if ((msg.includes('vinil') && msg.includes('destrutivel')) || msg.includes('ovo')) mat = 'destrutivel';
    else if (msg.includes('vinil')) mat = 'vinil';
    else if (msg.includes('flextag')) mat = 'flextag';
    else if (msg.includes('aluminio') || msg.includes('alumínio')) mat = 'aluminio';
    else if (msg.includes('inox')) mat = 'inox';
    else if (msg.includes('acm')) mat = 'acm';
    else if (msg.includes('pvc')) mat = 'pvc';
    else if (msg.includes('ribbon') && msg.includes('resina')) mat = 'ribbon_resina';
    else if (msg.includes('ribbon') && msg.includes('cera')) mat = 'ribbon_cera';
    else if (msg.includes('cola')) mat = 'cola';
    if (!mat) return null;

    const dimMatch = msg.match(/(\d+)\s*x\s*(\d+)/);
    const qtdMatch = msg.match(/(\d+)\s*(?:un|unidades?|peças?|placas?|etiquetas?)/i);
    const numeros = msg.match(/\b(\d+)\b/g) || [];

    const qtdEncontrada = numeros.find(n => !msg.includes(n + 'x') && !msg.includes('x' + n));

    params = {
      material: mat,
      largura: dimMatch ? parseInt(dimMatch[1]) : 30,
      comprimento: dimMatch ? parseInt(dimMatch[2]) : 15,
      quantidade: qtdMatch ? parseInt(qtdMatch[1]) : (qtdEncontrada ? parseInt(qtdEncontrada) : 50),
      impressao_uv: msg.includes('uv') || msg.includes('u.v'),
      inox_430: msg.includes('430'),
      espessura_pvc: msg.includes('1mm') ? '1mm' : '2mm',
    };
  } else {
    params = inputOrParams;
  }

  const { material, largura, comprimento, quantidade, impressao_uv, inox_430, espessura_pvc } = params;
  const areaCm2 = (largura * comprimento) / 100; // área em cm²
  const chaveNormalizada = normalizarTamanho(largura, comprimento, material);

  let precoUnitario = 0;
  let larguraFinal = largura;
  let comprimentoFinal = comprimento;
  const observacoes: string[] = [];
  let qtd = quantidade;

  // -------------------------------------------------------------------------
  if (material === 'poliester') {
    if (qtd < 51) { qtd = 51; observacoes.push('Quantidade mínima para Poliéster: *51 unidades*.'); }
    const faixa = encontrarFaixa(qtd, TABELA_POLIESTER)!;
    if (faixa.precos[chaveNormalizada] !== undefined) {
      precoUnitario = faixa.precos[chaveNormalizada];
    } else {
      const prox = obterTamanhoMaisProximo(largura, comprimento, faixa);
      precoUnitario = (prox.preco / prox.area) * (largura * comprimento);
      observacoes.push(`Tamanho especial calculado proporcionalmente a ${prox.tamanho}.`);
    }
    if (impressao_uv) { precoUnitario += 0.05; observacoes.push('Adicionado *R$ 0,05/un* por Impressão U.V.'); }
  }

  // -------------------------------------------------------------------------
  else if (material === 'void') {
    if (qtd < 51) { qtd = 51; observacoes.push('Quantidade mínima para VOID: *51 unidades*.'); }
    const faixa = encontrarFaixa(qtd, TABELA_VOID)!;
    if (faixa.precos[chaveNormalizada] !== undefined) {
      precoUnitario = faixa.precos[chaveNormalizada];
    } else {
      const prox = obterTamanhoMaisProximo(largura, comprimento, faixa);
      precoUnitario = (prox.preco / prox.area) * (largura * comprimento);
      observacoes.push(`Tamanho especial calculado proporcionalmente a ${prox.tamanho}.`);
    }
    if (impressao_uv) { precoUnitario += 0.05; observacoes.push('Adicionado *R$ 0,05/un* por Impressão U.V.'); }
  }

  // -------------------------------------------------------------------------
  else if (material === 'vinil') {
    if (qtd < 51) { qtd = 51; observacoes.push('Quantidade mínima para Vinil: *51 unidades*.'); }
    const faixa = encontrarFaixa(qtd, TABELA_VINIL)!;
    if (faixa.precos[chaveNormalizada] !== undefined) {
      precoUnitario = faixa.precos[chaveNormalizada];
    } else {
      const prox = obterTamanhoMaisProximo(largura, comprimento, faixa);
      precoUnitario = (prox.preco / prox.area) * (largura * comprimento);
      observacoes.push(`Tamanho especial calculado proporcionalmente a ${prox.tamanho}.`);
    }
  }

  // -------------------------------------------------------------------------
  else if (material === 'destrutivel') {
    if (qtd < 500) { observacoes.push('⚠️ Pedido mínimo para Vinil Destrutível: *500 unidades*.'); }
    const faixa = encontrarFaixa(qtd, TABELA_DESTRUTIVEL)!;
    if (faixa.precos[chaveNormalizada] !== undefined) {
      precoUnitario = faixa.precos[chaveNormalizada];
    } else {
      const prox = obterTamanhoMaisProximo(largura, comprimento, faixa);
      precoUnitario = (prox.preco / prox.area) * (largura * comprimento);
      observacoes.push(`Tamanho especial calculado proporcionalmente a ${prox.tamanho}.`);
    }
  }

  // -------------------------------------------------------------------------
  else if (material === 'flextag') {
    if (qtd < 51) { qtd = 51; observacoes.push('Quantidade mínima para Flextag: *51 unidades*.'); }
    const faixa = encontrarFaixa(qtd, TABELA_FLEXTAG)!;
    if (faixa.precos[chaveNormalizada] !== undefined) {
      precoUnitario = faixa.precos[chaveNormalizada];
    } else {
      precoUnitario = areaCm2 * 0.08;
      observacoes.push('Tamanho especial: *Área (cm²) × R$ 0,08*. Corte com quinas vivas.');
    }
  }

  // -------------------------------------------------------------------------
  else if (material === 'aluminio') {
    if (qtd < 51) { qtd = 51; observacoes.push('Quantidade mínima para Alumínio: *51 unidades*.'); }
    const faixa = encontrarFaixa(qtd, TABELA_ALUMINIO)!;
    if (faixa.precos[chaveNormalizada] !== undefined) {
      precoUnitario = faixa.precos[chaveNormalizada];
    } else {
      precoUnitario = areaCm2 * 0.08;
      observacoes.push('Tamanho especial: *Área (cm²) × R$ 0,08*. Corte com quinas vivas.');
    }
  }

  // -------------------------------------------------------------------------
  else if (material === 'inox') {
    if (qtd < 51) { qtd = 51; observacoes.push('Quantidade mínima para Aço Inox: *51 unidades*.'); }
    // Aço Inox aceita apenas 45x15 e 50x20
    let chaveInox = '45x15';
    if (largura === 50 && comprimento === 20 || largura === 20 && comprimento === 50) {
      chaveInox = '50x20';
      larguraFinal = 50; comprimentoFinal = 20;
    } else if (largura === 45 && comprimento === 15 || largura === 15 && comprimento === 45) {
      chaveInox = '45x15';
      larguraFinal = 45; comprimentoFinal = 15;
    } else {
      // Tamanho não disponível — retorna null para a IA informar ao cliente
      return null;
    }
    const faixa = encontrarFaixa(qtd, TABELA_AÇO_INOX)!;
    precoUnitario = faixa.precos[chaveInox];
    if (inox_430) { precoUnitario -= 0.08; observacoes.push('Desconto *R$ 0,08/un* aplicado para Inox 430.'); }
    observacoes.push('Prazo de produção: *10 a 12 dias úteis*.');
  }

  // -------------------------------------------------------------------------
  else if (material === 'acm') {
    if (qtd < 10) { qtd = 10; observacoes.push('Quantidade mínima para ACM: *10 unidades*.'); }
    precoUnitario = areaCm2 * 0.08;
    observacoes.push('Calculado: *Área (cm²) × R$ 0,08*.');
  }

  // -------------------------------------------------------------------------
  else if (material === 'pvc') {
    if (qtd < 10) { qtd = 10; observacoes.push('Quantidade mínima para PVC: *10 unidades*.'); }
    const taxa = (espessura_pvc === '1mm') ? 0.02 : 0.03;
    precoUnitario = areaCm2 * taxa;
    observacoes.push(`Calculado PVC ${espessura_pvc ?? '2mm'}: *Área (cm²) × R$ ${taxa.toFixed(2)}*.`);
  }

  // -------------------------------------------------------------------------
  else if (material === 'ribbon_resina') { precoUnitario = 39.00; }
  else if (material === 'ribbon_cera')   { precoUnitario = 19.00; }
  else if (material === 'cola')          { precoUnitario = 30.00; observacoes.push('Cola junta de motor 3M. Rende ~200 placas.'); }

  if (precoUnitario <= 0) return null;

  const subtotal = qtd * precoUnitario;
  const nomeMaterial = material.charAt(0).toUpperCase() + material.slice(1).replace(/_/g, ' ');

  const item: ItemOrcamento = {
    material: nomeMaterial,
    largura: larguraFinal,
    comprimento: comprimentoFinal,
    quantidade: qtd,
    precoUnitario,
    subtotal,
    observacoes,
  };

  return { itens: [item], total: subtotal, observacoes };
}

// -----------------------------------------------------------------------------
// FORMATA O CARRINHO NO LAYOUT IMUTÁVEL DO PROMPT
// -----------------------------------------------------------------------------

export function formatarOrcamento(orcamento: Orcamento): string {
  const item = orcamento.itens[0];
  const tamanhoTexto = item.largura > 0 ? `Medida: *${item.largura}x${item.comprimento} mm* | ` : '';
  const obsTexto = item.observacoes.length
    ? '\n' + item.observacoes.map(o => `ℹ️ ${o}`).join('\n')
    : '';

  return `🛒 *SUA COTAÇÃO ATUAL:*
━━━━━━━━━━━━━━━━━━━━
Produto: *${item.material}*
${tamanhoTexto}Qtd: *${item.quantidade}* un.
Preço Unitário: *R$ ${item.precoUnitario.toFixed(2)}*
Total Item: *R$ ${item.subtotal.toFixed(2)}*
━━━━━━━━━━━━━━━━━━━━
*VALOR PARCIAL: R$ ${orcamento.total.toFixed(2)}*${obsTexto}`;
}
