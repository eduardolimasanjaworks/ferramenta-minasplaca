/**
 * Calculadora comercial programática Minas Placa — Tabelas oficiais e fórmulas de cálculo.
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

// -----------------------------------------------------------------------------
// MATRIZES DE PREÇOS OFICIAIS
// -----------------------------------------------------------------------------

interface FaixaPreco {
  min: number;
  max: number;
  precos: { [tamanho: string]: number };
}

// A) Poliéster (Preço base para Impressão Térmica Preta. Impressão U.V. soma R$ 0.05)
const TABELA_POLIESTER: FaixaPreco[] = [
  { min: 51, max: 99, precos: { "30x15": 2.00, "40x13": 2.03, "45x15": 2.03, "40x20": 2.05, "50x20": 2.05, "54x27": 2.08, "60x28": 2.08 } },
  { min: 100, max: 199, precos: { "30x15": 1.00, "40x13": 1.03, "45x15": 1.03, "40x20": 1.05, "50x20": 1.05, "54x27": 1.08, "60x28": 1.08 } },
  { min: 200, max: 299, precos: { "30x15": 0.70, "40x13": 0.73, "45x15": 0.73, "40x20": 0.75, "50x20": 0.75, "54x27": 0.78, "60x28": 0.78 } },
  { min: 300, max: 499, precos: { "30x15": 0.60, "40x13": 0.63, "45x15": 0.63, "40x20": 0.65, "50x20": 0.65, "54x27": 0.68, "60x28": 0.68 } },
  { min: 500, max: 799, precos: { "30x15": 0.45, "40x13": 0.48, "45x15": 0.48, "40x20": 0.50, "50x20": 0.50, "54x27": 0.53, "60x28": 0.53 } },
  { min: 800, max: 999, precos: { "30x15": 0.35, "40x13": 0.38, "45x15": 0.38, "40x20": 0.40, "50x20": 0.40, "54x27": 0.43, "60x28": 0.43 } },
  { min: 1000, max: 1999, precos: { "30x15": 0.29, "40x13": 0.32, "45x15": 0.32, "40x20": 0.34, "50x20": 0.34, "54x27": 0.37, "60x28": 0.37 } },
  { min: 2000, max: 4999, precos: { "30x15": 0.27, "40x13": 0.30, "45x15": 0.30, "40x20": 0.32, "50x20": 0.32, "54x27": 0.35, "60x28": 0.35 } },
  { min: 5000, max: 7999, precos: { "30x15": 0.25, "40x13": 0.27, "45x15": 0.27, "40x20": 0.28, "50x20": 0.30, "54x27": 0.33, "60x28": 0.33 } },
  { min: 8000, max: 11999, precos: { "30x15": 0.22, "40x13": 0.24, "45x15": 0.25, "40x20": 0.27, "50x20": 0.27, "54x27": 0.30, "60x28": 0.30 } },
  { min: 12000, max: 14999, precos: { "30x15": 0.20, "40x13": 0.22, "45x15": 0.22, "40x20": 0.25, "50x20": 0.25, "54x27": 0.28, "60x28": 0.28 } },
  { min: 15000, max: Infinity, precos: { "30x15": 0.17, "40x13": 0.19, "45x15": 0.19, "40x20": 0.20, "50x20": 0.20, "54x27": 0.22, "60x28": 0.22 } }
];

// B) Void (Preço base para Impressão Térmica Preta. Impressão U.V. soma R$ 0.05)
const TABELA_VOID: FaixaPreco[] = [
  { min: 51, max: 99, precos: { "30x10": 2.02, "30x15": 2.02, "40x13": 2.04, "45x15": 2.05, "40x20": 2.07, "50x20": 2.07, "54x27": 2.07, "60x28": 2.07 } },
  { min: 100, max: 199, precos: { "30x10": 1.02, "30x15": 1.02, "40x13": 1.04, "45x15": 1.05, "40x20": 1.07, "50x20": 1.07, "54x27": 1.07, "60x28": 1.07 } },
  { min: 200, max: 299, precos: { "30x10": 0.72, "30x15": 0.72, "40x13": 0.74, "45x15": 0.75, "40x20": 0.77, "50x20": 0.77, "54x27": 0.77, "60x28": 0.77 } },
  { min: 300, max: 499, precos: { "30x10": 0.62, "30x15": 0.62, "40x13": 0.64, "45x15": 0.65, "40x20": 0.67, "50x20": 0.67, "54x27": 0.67, "60x28": 0.67 } },
  { min: 500, max: 799, precos: { "30x10": 0.47, "30x15": 0.47, "40x13": 0.49, "45x15": 0.50, "40x20": 0.52, "50x20": 0.52, "54x27": 0.52, "60x28": 0.52 } },
  { min: 800, max: 999, precos: { "30x10": 0.37, "30x15": 0.37, "40x13": 0.39, "45x15": 0.40, "40x20": 0.42, "50x20": 0.42, "54x27": 0.42, "60x28": 0.42 } },
  { min: 1000, max: 1999, precos: { "30x10": 0.31, "30x15": 0.31, "40x13": 0.33, "45x15": 0.34, "40x20": 0.36, "50x20": 0.36, "54x27": 0.36, "60x28": 0.36 } },
  { min: 2000, max: 4999, precos: { "30x10": 0.29, "30x15": 0.29, "40x13": 0.31, "45x15": 0.32, "40x20": 0.34, "50x20": 0.34, "54x27": 0.37, "60x28": 0.37 } },
  { min: 5000, max: 7999, precos: { "30x10": 0.27, "30x15": 0.27, "40x13": 0.29, "45x15": 0.30, "40x20": 0.30, "50x20": 0.30, "54x27": 0.32, "60x28": 0.32 } },
  { min: 8000, max: 11999, precos: { "30x10": 0.24, "30x15": 0.24, "40x13": 0.26, "45x15": 0.27, "40x20": 0.29, "50x20": 0.29, "54x27": 0.32, "60x28": 0.32 } },
  { min: 12000, max: 14999, precos: { "30x10": 0.22, "30x15": 0.22, "40x13": 0.24, "45x15": 0.25, "40x20": 0.27, "50x20": 0.27, "54x27": 0.30, "60x28": 0.30 } },
  { min: 15000, max: Infinity, precos: { "30x10": 0.20, "30x15": 0.22, "40x13": 0.23, "45x15": 0.23, "40x20": 0.25, "50x20": 0.25, "54x27": 0.28, "60x28": 0.28 } }
];

// C) Vinil Premium SEIWA (Impressão U.V. inclusa)
const TABELA_VINIL: FaixaPreco[] = [
  { min: 51, max: 99, precos: { "30x10": 2.04, "30x15": 2.04, "40x13": 2.06, "45x15": 2.07, "40x20": 2.09, "50x20": 2.09, "54x27": 2.12, "60x28": 2.12 } },
  { min: 100, max: 199, precos: { "30x10": 1.04, "30x15": 1.04, "40x13": 1.06, "45x15": 1.07, "40x20": 1.09, "50x20": 1.09, "54x27": 1.12, "60x28": 1.12 } },
  { min: 200, max: 299, precos: { "30x10": 0.74, "30x15": 0.74, "40x13": 0.76, "45x15": 0.77, "40x20": 0.79, "50x20": 0.79, "54x27": 0.82, "60x28": 0.82 } },
  { min: 300, max: 499, precos: { "30x10": 0.64, "30x15": 0.64, "40x13": 0.66, "45x15": 0.67, "40x20": 0.69, "50x20": 0.69, "54x27": 0.72, "60x28": 0.72 } },
  { min: 500, max: 799, precos: { "30x10": 0.49, "30x15": 0.49, "40x13": 0.51, "45x15": 0.52, "40x20": 0.54, "50x20": 0.54, "54x27": 0.57, "60x28": 0.57 } },
  { min: 800, max: 999, precos: { "30x10": 0.39, "30x15": 0.39, "40x13": 0.41, "45x15": 0.42, "40x20": 0.44, "50x20": 0.44, "54x27": 0.47, "60x28": 0.47 } },
  { min: 1000, max: 1999, precos: { "30x10": 0.33, "30x15": 0.33, "40x13": 0.35, "45x15": 0.36, "40x20": 0.38, "50x20": 0.38, "54x27": 0.41, "60x28": 0.41 } },
  { min: 2000, max: 4999, precos: { "30x10": 0.31, "30x15": 0.31, "40x13": 0.33, "45x15": 0.34, "40x20": 0.36, "50x20": 0.36, "54x27": 0.39, "60x28": 0.39 } },
  { min: 5000, max: 7999, precos: { "30x10": 0.29, "30x15": 0.29, "40x13": 0.31, "45x15": 0.32, "40x20": 0.34, "50x20": 0.34, "54x27": 0.37, "60x28": 0.37 } },
  { min: 8000, max: 11999, precos: { "30x10": 0.26, "30x15": 0.26, "40x13": 0.28, "45x15": 0.29, "40x20": 0.31, "50x20": 0.31, "54x27": 0.34, "60x28": 0.34 } },
  { min: 12000, max: 14999, precos: { "30x10": 0.24, "30x15": 0.24, "40x13": 0.26, "45x15": 0.27, "40x20": 0.29, "50x20": 0.29, "54x27": 0.32, "60x28": 0.32 } },
  { min: 15000, max: Infinity, precos: { "30x10": 0.22, "30x15": 0.22, "40x13": 0.24, "45x15": 0.25, "40x20": 0.27, "50x20": 0.27, "54x27": 0.30, "60x28": 0.30 } }
];

// D) Vinil Destrutível / Casca de Ovo (Mínimo: 500 unidades, menores são para referência)
const TABELA_DESTRUTIVEL: FaixaPreco[] = [
  { min: 51, max: 99, precos: { "30x10": 2.06, "30x15": 2.06, "40x13": 2.08, "45x15": 2.09, "40x20": 2.11, "50x20": 2.11, "54x27": 2.14, "60x28": 2.14 } },
  { min: 100, max: 199, precos: { "30x10": 1.06, "30x15": 1.06, "40x13": 1.08, "45x15": 1.09, "40x20": 1.11, "50x20": 1.11, "54x27": 1.14, "60x28": 1.14 } },
  { min: 200, max: 499, precos: { "30x10": 0.66, "30x15": 0.66, "40x13": 0.68, "45x15": 0.69, "40x20": 0.71, "50x20": 0.71, "54x27": 0.74, "60x28": 0.74 } },
  { min: 500, max: 799, precos: { "30x10": 0.51, "30x15": 0.51, "40x13": 0.53, "45x15": 0.54, "40x20": 0.56, "50x20": 0.56, "54x27": 0.59, "60x28": 0.59 } },
  { min: 800, max: 999, precos: { "30x10": 0.41, "30x15": 0.41, "40x13": 0.43, "45x15": 0.44, "40x20": 0.46, "50x20": 0.46, "54x27": 0.49, "60x28": 0.49 } },
  { min: 1000, max: 1999, precos: { "30x10": 0.35, "30x15": 0.35, "40x13": 0.37, "45x15": 0.38, "40x20": 0.40, "50x20": 0.40, "54x27": 0.43, "60x28": 0.43 } },
  { min: 2000, max: 4999, precos: { "30x10": 0.33, "30x15": 0.33, "40x13": 0.35, "45x15": 0.36, "40x20": 0.38, "50x20": 0.38, "54x27": 0.41, "60x28": 0.41 } },
  { min: 5000, max: 7999, precos: { "30x10": 0.31, "30x15": 0.31, "40x13": 0.33, "45x15": 0.34, "40x20": 0.36, "50x20": 0.36, "54x27": 0.39, "60x28": 0.39 } },
  { min: 8000, max: 11999, precos: { "30x10": 0.28, "30x15": 0.28, "40x13": 0.30, "45x15": 0.31, "40x20": 0.33, "50x20": 0.33, "54x27": 0.36, "60x28": 0.36 } },
  { min: 12000, max: 14999, precos: { "30x10": 0.26, "30x15": 0.26, "40x13": 0.28, "45x15": 0.29, "40x20": 0.31, "50x20": 0.31, "54x27": 0.34, "60x28": 0.34 } },
  { min: 15000, max: Infinity, precos: { "30x10": 0.24, "30x15": 0.24, "40x13": 0.26, "45x15": 0.27, "40x20": 0.29, "50x20": 0.29, "54x27": 0.32, "60x28": 0.32 } }
];

// E) Flextag
const TABELA_FLEXTAG: FaixaPreco[] = [
  { min: 51, max: 99, precos: { "30x15": 2.90, "40x13": 2.92, "45x15": 2.95, "40x20": 3.01, "50x20": 3.01, "54x27": 3.07, "60x28": 3.07 } },
  { min: 100, max: 199, precos: { "30x15": 1.80, "40x13": 1.82, "45x15": 1.85, "40x20": 1.91, "50x20": 1.91, "54x27": 1.97, "60x28": 1.97 } },
  { min: 200, max: 299, precos: { "30x15": 1.40, "40x13": 1.42, "45x15": 1.45, "40x20": 1.51, "50x20": 1.51, "54x27": 1.57, "60x28": 1.57 } },
  { min: 300, max: 499, precos: { "30x15": 0.85, "40x13": 0.87, "45x15": 0.90, "40x20": 0.96, "50x20": 0.96, "54x27": 1.02, "60x28": 1.02 } },
  { min: 500, max: 799, precos: { "30x15": 0.78, "40x13": 0.80, "45x15": 0.83, "40x20": 0.89, "50x20": 0.89, "54x27": 0.95, "60x28": 0.95 } },
  { min: 800, max: 999, precos: { "30x15": 0.65, "40x13": 0.67, "45x15": 0.70, "40x20": 0.76, "50x20": 0.76, "54x27": 0.82, "60x28": 0.82 } },
  { min: 1000, max: 1999, precos: { "30x15": 0.55, "40x13": 0.57, "45x15": 0.60, "40x20": 0.66, "50x20": 0.66, "54x27": 0.72, "60x28": 0.72 } },
  { min: 2000, max: 4999, precos: { "30x15": 0.48, "40x13": 0.50, "45x15": 0.53, "40x20": 0.56, "50x20": 0.56, "54x27": 0.58, "60x28": 0.58 } },
  { min: 5000, max: 7999, precos: { "30x15": 0.45, "40x13": 0.47, "45x15": 0.50, "40x20": 0.53, "50x20": 0.53, "54x27": 0.55, "60x28": 0.55 } },
  { min: 8000, max: 11999, precos: { "30x15": 0.43, "40x13": 0.45, "45x15": 0.48, "40x20": 0.50, "50x20": 0.50, "54x27": 0.54, "60x28": 0.54 } },
  { min: 12000, max: 14999, precos: { "30x15": 0.41, "40x13": 0.43, "45x15": 0.46, "40x20": 0.48, "50x20": 0.48, "54x27": 0.53, "60x28": 0.53 } },
  { min: 15000, max: Infinity, precos: { "30x15": 0.39, "40x13": 0.40, "45x15": 0.42, "40x20": 0.45, "50x20": 0.45, "54x27": 0.50, "60x28": 0.50 } }
];

// F) Alumínio
const TABELA_ALUMINIO: FaixaPreco[] = [
  { min: 51, max: 99, precos: { "30x15": 2.92, "40x13": 2.94, "45x15": 2.97, "45x13": 2.97, "40x20": 3.03, "50x20": 3.03, "54x27": 3.09, "60x28": 3.09 } },
  { min: 100, max: 199, precos: { "30x15": 1.82, "40x13": 1.84, "45x15": 1.87, "45x13": 1.87, "40x20": 1.93, "50x20": 1.93, "54x27": 1.99, "60x28": 1.99 } },
  { min: 200, max: 299, precos: { "30x15": 1.42, "40x13": 1.44, "45x15": 1.47, "45x13": 1.47, "40x20": 1.53, "50x20": 1.53, "54x27": 1.59, "60x28": 1.59 } },
  { min: 300, max: 499, precos: { "30x15": 0.87, "40x13": 0.89, "45x15": 0.92, "45x13": 0.92, "40x20": 0.98, "50x20": 0.98, "54x27": 1.04, "60x28": 1.04 } },
  { min: 500, max: 799, precos: { "30x15": 0.80, "40x13": 0.82, "45x15": 0.85, "45x13": 0.85, "40x20": 0.91, "50x20": 0.91, "54x27": 0.97, "60x28": 0.97 } },
  { min: 800, max: 999, precos: { "30x15": 0.67, "40x13": 0.69, "45x15": 0.72, "45x13": 0.72, "40x20": 0.78, "50x20": 0.78, "54x27": 0.84, "60x28": 0.84 } },
  { min: 1000, max: 1999, precos: { "30x15": 0.57, "40x13": 0.59, "45x15": 0.62, "45x13": 0.62, "40x20": 0.68, "50x20": 0.68, "54x27": 0.74, "60x28": 0.74 } },
  { min: 2000, max: 4999, precos: { "30x15": 0.50, "40x13": 0.52, "45x15": 0.59, "45x13": 0.59, "40x20": 0.64, "50x20": 0.64, "54x27": 0.70, "60x28": 0.70 } },
  { min: 5000, max: 7999, precos: { "30x15": 0.47, "40x13": 0.49, "45x15": 0.56, "45x13": 0.56, "40x20": 0.60, "50x20": 0.60, "54x27": 0.68, "60x28": 0.68 } },
  { min: 8000, max: 11999, precos: { "30x15": 0.45, "40x13": 0.47, "45x15": 0.54, "45x13": 0.54, "40x20": 0.57, "50x20": 0.57, "54x27": 0.66, "60x28": 0.66 } },
  { min: 12000, max: 14999, precos: { "30x15": 0.44, "40x13": 0.45, "45x15": 0.52, "45x13": 0.52, "40x20": 0.55, "50x20": 0.55, "54x27": 0.64, "60x28": 0.64 } },
  { min: 15000, max: Infinity, precos: { "30x15": 0.40, "40x13": 0.43, "45x15": 0.50, "45x13": 0.50, "40x20": 0.52, "50x20": 0.52, "54x27": 0.60, "60x28": 0.60 } }
];

// G) Aço Inox 304 (Medidas estritas: 45x15 e 50x20)
const TABELA_AÇO_INOX: FaixaPreco[] = [
  { min: 51, max: 100, precos: { "45x15": 4.00, "50x20": 4.10 } },
  { min: 101, max: 200, precos: { "45x15": 3.80, "50x20": 3.90 } },
  { min: 201, max: 300, precos: { "45x15": 2.80, "50x20": 2.90 } },
  { min: 301, max: 400, precos: { "45x15": 2.00, "50x20": 2.10 } },
  { min: 501, max: 700, precos: { "45x15": 1.79, "50x20": 1.89 } },
  { min: 701, max: 999, precos: { "45x15": 1.69, "50x20": 1.79 } },
  { min: 1000, max: 3000, precos: { "45x15": 1.55, "50x20": 1.65 } },
  { min: 3001, max: 4999, precos: { "45x15": 1.45, "50x20": 1.55 } },
  { min: 5000, max: 9999, precos: { "45x15": 1.35, "50x20": 1.45 } },
  { min: 10000, max: Infinity, precos: { "45x15": 1.20, "50x20": 1.30 } }
];

// -----------------------------------------------------------------------------
// LÓGICA DE PARSE E CÁLCULO
// -----------------------------------------------------------------------------

function encontrarFaixa(quantidade: number, tabela: FaixaPreco[]): FaixaPreco | null {
  return tabela.find(f => quantidade >= f.min && quantidade <= f.max) || null;
}

function calcularArea(l: number, c: number): number {
  return (l * c) / 100; // área em cm²
}

function obterPrecoTamanhoMaisProximo(tamanhoProcurado: string, faixa: FaixaPreco): { tamanho: string; preco: number; area: number } {
  const [lProc, cProc] = tamanhoProcurado.split('x').map(Number);
  const areaProc = lProc * cProc;
  
  let melhorTamanho = '';
  let melhorPreco = 0;
  let menorDiferenca = Infinity;
  let melhorArea = 1;

  for (const tam of Object.keys(faixa.precos)) {
    const [l, c] = tam.split('x').map(Number);
    const area = l * c;
    const diff = Math.abs(area - areaProc);
    if (diff < menorDiferenca) {
      menorDiferenca = diff;
      melhorTamanho = tam;
      melhorPreco = faixa.precos[tam];
      melhorArea = area;
    }
  }

  return { tamanho: melhorTamanho, preco: melhorPreco, area: melhorArea };
}

export async function calcularOrcamento(mensagem: string): Promise<Orcamento | null> {
  const msgLimpa = mensagem.toLowerCase();
  
  // 1. Identificar Material
  let material = '';
  if (msgLimpa.includes('poliester')) material = 'poliester';
  else if (msgLimpa.includes('void')) material = 'void';
  else if (msgLimpa.includes('vinil') && msgLimpa.includes('destrutivel') || msgLimpa.includes('ovo')) material = 'destrutivel';
  else if (msgLimpa.includes('vinil')) material = 'vinil';
  else if (msgLimpa.includes('flextag')) material = 'flextag';
  else if (msgLimpa.includes('aluminio')) material = 'aluminio';
  else if (msgLimpa.includes('inox') || msgLimpa.includes('aço')) material = 'inox';
  else if (msgLimpa.includes('acm')) material = 'acm';
  else if (msgLimpa.includes('pvc')) material = 'pvc';
  else if (msgLimpa.includes('ribbon') && msgLimpa.includes('resina')) material = 'ribbon_resina';
  else if (msgLimpa.includes('ribbon') && msgLimpa.includes('cera')) material = 'ribbon_cera';
  else if (msgLimpa.includes('cola')) material = 'cola';

  if (!material) return null;

  // 2. Extrair Quantidade
  let quantidade = 50; // MoQ padrão
  const matchQtd = msgLimpa.match(/(?:qtd|quantidade|de|com)\s*(\d+)/) || msgLimpa.match(/(\d+)\s*(?:un|unidades|peças|placas|etiquetas|adesivos)/);
  if (matchQtd) {
    quantidade = parseInt(matchQtd[1], 10);
  } else {
    const matchNumeroSolto = msgLimpa.match(/\b(\d+)\b/g);
    if (matchNumeroSolto) {
      // Pega o número que não pareça ser dimensão (evita pegar o 30 de 30x15)
      const filtrados = matchNumeroSolto.filter(n => {
        const idx = msgLimpa.indexOf(n);
        const charDepois = msgLimpa[idx + n.length];
        const charAntes = msgLimpa[idx - 1];
        return charDepois !== 'x' && charAntes !== 'x';
      });
      if (filtrados.length) {
        quantidade = parseInt(filtrados[0], 10);
      }
    }
  }

  // 3. Extrair Dimensões (Largura x Comprimento)
  let largura = 30;
  let comprimento = 15;
  const matchDim = msgLimpa.match(/(\d+)\s*x\s*(\d+)/);
  if (matchDim) {
    largura = parseInt(matchDim[1], 10);
    comprimento = parseInt(matchDim[2], 10);
  }

  // 4. Lógica de Precificação Baseada nas Regras
  let precoUnitario = 0;
  const observacoes: string[] = [];

  const tamanhoStr = `${largura}x${comprimento}`;
  const areaCm2 = calcularArea(largura, comprimento);

  if (material === 'poliester') {
    if (quantidade < 51) {
      quantidade = 51;
      observacoes.push("Quantidade mínima para Poliéster é de *51 unidades*.");
    }
    const faixa = encontrarFaixa(quantidade, TABELA_POLIESTER);
    if (faixa) {
      if (faixa.precos[tamanhoStr] !== undefined) {
        precoUnitario = faixa.precos[tamanhoStr];
      } else {
        const maisProximo = obterPrecoTamanhoMaisProximo(tamanhoStr, faixa);
        precoUnitario = (maisProximo.preco / (maisProximo.area / 100)) * areaCm2;
        observacoes.push(`Tamanho especial calculado proporcionalmente a partir de ${maisProximo.tamanho}.`);
      }
      // Adicional U.V. se solicitado na mensagem
      if (msgLimpa.includes('uv') || msgLimpa.includes('u.v')) {
        precoUnitario += 0.05;
        observacoes.push("Adicionado *R$ 0,05* unitário por Impressão Digital UV.");
      }
    }
  } 
  else if (material === 'void') {
    if (quantidade < 51) {
      quantidade = 51;
      observacoes.push("Quantidade mínima para VOID é de *51 unidades*.");
    }
    const faixa = encontrarFaixa(quantidade, TABELA_VOID);
    if (faixa) {
      if (faixa.precos[tamanhoStr] !== undefined) {
        precoUnitario = faixa.precos[tamanhoStr];
      } else {
        const maisProximo = obterPrecoTamanhoMaisProximo(tamanhoStr, faixa);
        precoUnitario = (maisProximo.preco / (maisProximo.area / 100)) * areaCm2;
        observacoes.push(`Tamanho especial calculado proporcionalmente a partir de ${maisProximo.tamanho}.`);
      }
      if (msgLimpa.includes('uv') || msgLimpa.includes('u.v')) {
        precoUnitario += 0.05;
        observacoes.push("Adicionado *R$ 0,05* unitário por Impressão Digital UV.");
      }
    }
  } 
  else if (material === 'vinil') {
    if (quantidade < 51) {
      quantidade = 51;
      observacoes.push("Quantidade mínima para Vinil é de *51 unidades*.");
    }
    const faixa = encontrarFaixa(quantidade, TABELA_VINIL);
    if (faixa) {
      if (faixa.precos[tamanhoStr] !== undefined) {
        precoUnitario = faixa.precos[tamanhoStr];
      } else {
        const maisProximo = obterPrecoTamanhoMaisProximo(tamanhoStr, faixa);
        precoUnitario = (maisProximo.preco / (maisProximo.area / 100)) * areaCm2;
        observacoes.push(`Tamanho especial calculado proporcionalmente a partir de ${maisProximo.tamanho}.`);
      }
    }
  } 
  else if (material === 'destrutivel') {
    if (quantidade < 500) {
      observacoes.push("⚠️ Nota: O pedido mínimo operacional para Vinil Destrutível (Casca de Ovo) é de *500 unidades*.");
    }
    const faixa = encontrarFaixa(quantidade, TABELA_DESTRUTIVEL);
    if (faixa) {
      if (faixa.precos[tamanhoStr] !== undefined) {
        precoUnitario = faixa.precos[tamanhoStr];
      } else {
        const maisProximo = obterPrecoTamanhoMaisProximo(tamanhoStr, faixa);
        precoUnitario = (maisProximo.preco / (maisProximo.area / 100)) * areaCm2;
        observacoes.push(`Tamanho especial calculado proporcionalmente a partir de ${maisProximo.tamanho}.`);
      }
    }
  } 
  else if (material === 'flextag') {
    if (quantidade < 51) {
      quantidade = 51;
      observacoes.push("Quantidade mínima para Flextag é de *51 unidades*.");
    }
    const faixa = encontrarFaixa(quantidade, TABELA_FLEXTAG);
    if (faixa) {
      if (faixa.precos[tamanhoStr] !== undefined) {
        precoUnitario = faixa.precos[tamanhoStr];
      } else {
        precoUnitario = areaCm2 * 0.08;
        observacoes.push("Tamanho especial calculado pela fórmula: *Área (cm²) * R$ 0,08*.");
      }
    }
  } 
  else if (material === 'aluminio') {
    if (quantidade < 51) {
      quantidade = 51;
      observacoes.push("Quantidade mínima para Alumínio é de *51 unidades*.");
    }
    const faixa = encontrarFaixa(quantidade, TABELA_ALUMINIO);
    if (faixa) {
      if (faixa.precos[tamanhoStr] !== undefined) {
        precoUnitario = faixa.precos[tamanhoStr];
      } else {
        precoUnitario = areaCm2 * 0.08;
        observacoes.push("Tamanho especial calculado pela fórmula: *Área (cm²) * R$ 0,08*.");
      }
    }
  } 
  else if (material === 'inox') {
    if (quantidade < 51) {
      quantidade = 51;
      observacoes.push("Quantidade mínima para Aço Inox é de *51 unidades*.");
    }
    const faixa = encontrarFaixa(quantidade, TABELA_AÇO_INOX);
    if (faixa) {
      // Aço Inox aceita apenas 45x15 ou 50x20
      if (tamanhoStr === '45x15' || tamanhoStr === '50x20') {
        precoUnitario = faixa.precos[tamanhoStr];
      } else {
        largura = 45;
        comprimento = 15;
        precoUnitario = faixa.precos["45x15"];
        observacoes.push("⚠️ O Aço Inox está disponível estritamente nas medidas *45x15mm* ou *50x20mm*. Consideramos a medida padrão *45x15mm*.");
      }
      // Desconto para Inox 430
      if (msgLimpa.includes('430')) {
        precoUnitario -= 0.08;
        observacoes.push("Aplicado desconto de *R$ 0,08* unitário para Aço Inox tipo 430.");
      }
    }
  } 
  else if (material === 'acm') {
    if (quantidade < 10) {
      quantidade = 10;
      observacoes.push("Quantidade mínima para ACM é de *10 unidades*.");
    }
    precoUnitario = areaCm2 * 0.08;
    observacoes.push("Calculado pela fórmula: *Área (cm²) * R$ 0,08*.");
  } 
  else if (material === 'pvc') {
    if (quantidade < 10) {
      quantidade = 10;
      observacoes.push("Quantidade mínima para PVC é de *10 unidades*.");
    }
    if (msgLimpa.includes('1mm') || msgLimpa.includes('1 mm')) {
      precoUnitario = areaCm2 * 0.02;
      observacoes.push("Calculado pela fórmula PVC 1mm: *Área (cm²) * R$ 0,02*.");
    } else {
      precoUnitario = areaCm2 * 0.03;
      observacoes.push("Calculado pela fórmula PVC 2mm (padrão): *Área (cm²) * R$ 0,03*.");
    }
  }
  else if (material === 'ribbon_resina') {
    precoUnitario = 39.00;
  }
  else if (material === 'ribbon_cera') {
    precoUnitario = 19.00;
  }
  else if (material === 'cola') {
    precoUnitario = 30.00;
  }

  if (precoUnitario <= 0) return null;

  const subtotal = quantidade * precoUnitario;
  const nomeMaterialFormatado = material.charAt(0).toUpperCase() + material.slice(1);

  const item: ItemOrcamento = {
    material: nomeMaterialFormatado,
    largura,
    comprimento,
    quantidade,
    precoUnitario,
    subtotal,
    observacoes
  };

  return {
    itens: [item],
    total: subtotal,
    observacoes
  };
}

export function formatarOrcamento(orcamento: Orcamento): string {
  const item = orcamento.itens[0];
  const tamanhoTexto = item.largura > 0 ? `Medida: *${item.largura}x${item.comprimento} mm* | ` : '';
  
  return `🛒 *SUA COTAÇÃO ATUAL:*
━━━━━━━━━━━━━━━━━━━━
Produto: *${item.material}*
${tamanhoTexto}Qtd: *${item.quantidade}* un.
Preço Unitário: *R$ ${item.precoUnitario.toFixed(2)}*
Total Item: *R$ ${item.subtotal.toFixed(2)}*
━━━━━━━━━━━━━━━━━━━━
*VALOR PARCIAL: R$ ${orcamento.total.toFixed(2)}*`;
}
