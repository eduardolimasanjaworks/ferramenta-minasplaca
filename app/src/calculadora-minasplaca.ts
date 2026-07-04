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
  { min: 51,    max: 99,       precos: { "30x15": 2.00, "40x13": 2.03, "45x15": 2.03, "40x20": 2.05, "50x20": 2.05, "54x27": 2.08, "60x28": 2.08 } },
  { min: 100,   max: 199,      precos: { "30x15": 1.00, "40x13": 1.03, "45x15": 1.03, "40x20": 1.05, "50x20": 1.05, "54x27": 1.08, "60x28": 1.08 } },
  { min: 200,   max: 299,      precos: { "30x15": 0.70, "40x13": 0.73, "45x15": 0.73, "40x20": 0.75, "50x20": 0.75, "54x27": 0.78, "60x28": 0.78 } },
  { min: 300,   max: 499,      precos: { "30x15": 0.60, "40x13": 0.63, "45x15": 0.63, "40x20": 0.65, "50x20": 0.65, "54x27": 0.68, "60x28": 0.68 } },
  { min: 500,   max: 799,      precos: { "30x15": 0.45, "40x13": 0.48, "45x15": 0.48, "40x20": 0.50, "50x20": 0.50, "54x27": 0.53, "60x28": 0.53 } },
  { min: 800,   max: 999,      precos: { "30x15": 0.35, "40x13": 0.38, "45x15": 0.38, "40x20": 0.40, "50x20": 0.40, "54x27": 0.43, "60x28": 0.43 } },
  { min: 1000,  max: 1999,     precos: { "30x15": 0.29, "40x13": 0.32, "45x15": 0.32, "40x20": 0.34, "50x20": 0.34, "54x27": 0.37, "60x28": 0.37 } },
  { min: 2000,  max: 4999,     precos: { "30x15": 0.27, "40x13": 0.30, "45x15": 0.30, "40x20": 0.32, "50x20": 0.32, "54x27": 0.35, "60x28": 0.35 } },
  { min: 5000,  max: 7999,     precos: { "30x15": 0.25, "40x13": 0.27, "45x15": 0.27, "40x20": 0.28, "50x20": 0.30, "54x27": 0.33, "60x28": 0.33 } },
  { min: 8000,  max: 11999,    precos: { "30x15": 0.22, "40x13": 0.24, "45x15": 0.25, "40x20": 0.27, "50x20": 0.27, "54x27": 0.30, "60x28": 0.30 } },
  { min: 12000, max: 14999,    precos: { "30x15": 0.20, "40x13": 0.22, "45x15": 0.22, "40x20": 0.25, "50x20": 0.25, "54x27": 0.28, "60x28": 0.28 } },
  { min: 15000, max: Infinity, precos: { "30x15": 0.17, "40x13": 0.19, "45x15": 0.19, "40x20": 0.20, "50x20": 0.20, "54x27": 0.22, "60x28": 0.22 } },
];

// B) VOID (Impressão Térmica; +R$0,05 por UV)
const TABELA_VOID: FaixaPreco[] = [
  { min: 51,    max: 99,       precos: { "30x10": 2.02, "30x15": 2.02, "40x13": 2.04, "45x15": 2.05, "40x20": 2.07, "50x20": 2.07, "54x27": 2.07, "60x28": 2.07 } },
  { min: 100,   max: 199,      precos: { "30x10": 1.02, "30x15": 1.02, "40x13": 1.04, "45x15": 1.05, "40x20": 1.07, "50x20": 1.07, "54x27": 1.07, "60x28": 1.07 } },
  { min: 200,   max: 299,      precos: { "30x10": 0.72, "30x15": 0.72, "40x13": 0.74, "45x15": 0.75, "40x20": 0.77, "50x20": 0.77, "54x27": 0.77, "60x28": 0.77 } },
  { min: 300,   max: 499,      precos: { "30x10": 0.62, "30x15": 0.62, "40x13": 0.64, "45x15": 0.65, "40x20": 0.67, "50x20": 0.67, "54x27": 0.67, "60x28": 0.67 } },
  { min: 500,   max: 799,      precos: { "30x10": 0.47, "30x15": 0.47, "40x13": 0.49, "45x15": 0.50, "40x20": 0.52, "50x20": 0.52, "54x27": 0.52, "60x28": 0.52 } },
  { min: 800,   max: 999,      precos: { "30x10": 0.37, "30x15": 0.37, "40x13": 0.39, "45x15": 0.40, "40x20": 0.42, "50x20": 0.42, "54x27": 0.42, "60x28": 0.42 } },
  { min: 1000,  max: 1999,     precos: { "30x10": 0.31, "30x15": 0.31, "40x13": 0.33, "45x15": 0.34, "40x20": 0.36, "50x20": 0.36, "54x27": 0.36, "60x28": 0.36 } },
  { min: 2000,  max: 4999,     precos: { "30x10": 0.29, "30x15": 0.29, "40x13": 0.31, "45x15": 0.32, "40x20": 0.34, "50x20": 0.34, "54x27": 0.37, "60x28": 0.37 } },
  { min: 5000,  max: 7999,     precos: { "30x10": 0.27, "30x15": 0.27, "40x13": 0.29, "45x15": 0.30, "40x20": 0.30, "50x20": 0.30, "54x27": 0.32, "60x28": 0.32 } },
  { min: 8000,  max: 11999,    precos: { "30x10": 0.24, "30x15": 0.24, "40x13": 0.26, "45x15": 0.27, "40x20": 0.29, "50x20": 0.29, "54x27": 0.32, "60x28": 0.32 } },
  { min: 12000, max: 14999,    precos: { "30x10": 0.22, "30x15": 0.22, "40x13": 0.24, "45x15": 0.25, "40x20": 0.27, "50x20": 0.27, "54x27": 0.30, "60x28": 0.30 } },
  { min: 15000, max: Infinity, precos: { "30x10": 0.20, "30x15": 0.22, "40x13": 0.23, "45x15": 0.23, "40x20": 0.25, "50x20": 0.25, "54x27": 0.28, "60x28": 0.28 } },
];

// C) VINIL PREMIUM SEIWA (Impressão UV inclusa)
const TABELA_VINIL: FaixaPreco[] = [
  { min: 51,    max: 99,       precos: { "30x10": 2.04, "30x15": 2.04, "40x13": 2.06, "45x15": 2.07, "40x20": 2.09, "50x20": 2.09, "54x27": 2.12, "60x28": 2.12 } },
  { min: 100,   max: 199,      precos: { "30x10": 1.04, "30x15": 1.04, "40x13": 1.06, "45x15": 1.07, "40x20": 1.09, "50x20": 1.09, "54x27": 1.12, "60x28": 1.12 } },
  { min: 200,   max: 299,      precos: { "30x10": 0.74, "30x15": 0.74, "40x13": 0.76, "45x15": 0.77, "40x20": 0.79, "50x20": 0.79, "54x27": 0.82, "60x28": 0.82 } },
  { min: 300,   max: 499,      precos: { "30x10": 0.64, "30x15": 0.64, "40x13": 0.66, "45x15": 0.67, "40x20": 0.69, "50x20": 0.69, "54x27": 0.72, "60x28": 0.72 } },
  { min: 500,   max: 799,      precos: { "30x10": 0.49, "30x15": 0.49, "40x13": 0.51, "45x15": 0.52, "40x20": 0.54, "50x20": 0.54, "54x27": 0.57, "60x28": 0.57 } },
  { min: 800,   max: 999,      precos: { "30x10": 0.39, "30x15": 0.39, "40x13": 0.41, "45x15": 0.42, "40x20": 0.44, "50x20": 0.44, "54x27": 0.47, "60x28": 0.47 } },
  { min: 1000,  max: 1999,     precos: { "30x10": 0.33, "30x15": 0.33, "40x13": 0.35, "45x15": 0.36, "40x20": 0.38, "50x20": 0.38, "54x27": 0.41, "60x28": 0.41 } },
  { min: 2000,  max: 4999,     precos: { "30x10": 0.31, "30x15": 0.31, "40x13": 0.33, "45x15": 0.34, "40x20": 0.36, "50x20": 0.36, "54x27": 0.39, "60x28": 0.39 } },
  { min: 5000,  max: 7999,     precos: { "30x10": 0.29, "30x15": 0.29, "40x13": 0.31, "45x15": 0.32, "40x20": 0.34, "50x20": 0.34, "54x27": 0.37, "60x28": 0.37 } },
  { min: 8000,  max: 11999,    precos: { "30x10": 0.26, "30x15": 0.26, "40x13": 0.28, "45x15": 0.29, "40x20": 0.31, "50x20": 0.31, "54x27": 0.34, "60x28": 0.34 } },
  { min: 12000, max: 14999,    precos: { "30x10": 0.24, "30x15": 0.24, "40x13": 0.26, "45x15": 0.27, "40x20": 0.29, "50x20": 0.29, "54x27": 0.32, "60x28": 0.32 } },
  { min: 15000, max: Infinity, precos: { "30x10": 0.22, "30x15": 0.22, "40x13": 0.24, "45x15": 0.25, "40x20": 0.27, "50x20": 0.27, "54x27": 0.30, "60x28": 0.30 } },
];

// D) VINIL DESTRUTÍVEL / CASCA DE OVO (Mínimo 500 un; UV incluso)
const TABELA_DESTRUTIVEL: FaixaPreco[] = [
  { min: 51,    max: 99,       precos: { "30x10": 2.06, "30x15": 2.06, "40x13": 2.08, "45x15": 2.09, "40x20": 2.11, "50x20": 2.11, "54x27": 2.14, "60x28": 2.14 } },
  { min: 100,   max: 199,      precos: { "30x10": 1.06, "30x15": 1.06, "40x13": 1.08, "45x15": 1.09, "40x20": 1.11, "50x20": 1.11, "54x27": 1.14, "60x28": 1.14 } },
  { min: 200,   max: 499,      precos: { "30x10": 0.66, "30x15": 0.66, "40x13": 0.68, "45x15": 0.69, "40x20": 0.71, "50x20": 0.71, "54x27": 0.74, "60x28": 0.74 } },
  { min: 500,   max: 799,      precos: { "30x10": 0.51, "30x15": 0.51, "40x13": 0.53, "45x15": 0.54, "40x20": 0.56, "50x20": 0.56, "54x27": 0.59, "60x28": 0.59 } },
  { min: 800,   max: 999,      precos: { "30x10": 0.41, "30x15": 0.41, "40x13": 0.43, "45x15": 0.44, "40x20": 0.46, "50x20": 0.46, "54x27": 0.49, "60x28": 0.49 } },
  { min: 1000,  max: 1999,     precos: { "30x10": 0.35, "30x15": 0.35, "40x13": 0.37, "45x15": 0.38, "40x20": 0.40, "50x20": 0.40, "54x27": 0.43, "60x28": 0.43 } },
  { min: 2000,  max: 4999,     precos: { "30x10": 0.33, "30x15": 0.33, "40x13": 0.35, "45x15": 0.36, "40x20": 0.38, "50x20": 0.38, "54x27": 0.41, "60x28": 0.41 } },
  { min: 5000,  max: 7999,     precos: { "30x10": 0.31, "30x15": 0.31, "40x13": 0.33, "45x15": 0.34, "40x20": 0.36, "50x20": 0.36, "54x27": 0.39, "60x28": 0.39 } },
  { min: 8000,  max: 11999,    precos: { "30x10": 0.28, "30x15": 0.28, "40x13": 0.30, "45x15": 0.31, "40x20": 0.33, "50x20": 0.33, "54x27": 0.36, "60x28": 0.36 } },
  { min: 12000, max: 14999,    precos: { "30x10": 0.26, "30x15": 0.26, "40x13": 0.28, "45x15": 0.29, "40x20": 0.31, "50x20": 0.31, "54x27": 0.34, "60x28": 0.34 } },
  { min: 15000, max: Infinity, precos: { "30x10": 0.24, "30x15": 0.24, "40x13": 0.26, "45x15": 0.27, "40x20": 0.29, "50x20": 0.29, "54x27": 0.32, "60x28": 0.32 } },
];

// E) FLEXTAG (UV incluso; tamanhos especiais: área cm² × R$0,08)
// Grupos: 30x15 | 40x13 | 45x15/45x13 | 40x20/46x18 | 50x20 | 54x27 | 60x28
const TABELA_FLEXTAG: FaixaPreco[] = [
  { min: 51,    max: 99,       precos: { "30x15": 2.90, "40x13": 2.92, "45x15": 2.95, "40x20": 3.01, "50x20": 3.01, "54x27": 3.07, "60x28": 3.07 } },
  { min: 100,   max: 199,      precos: { "30x15": 1.80, "40x13": 1.82, "45x15": 1.85, "40x20": 1.91, "50x20": 1.91, "54x27": 1.97, "60x28": 1.97 } },
  { min: 200,   max: 299,      precos: { "30x15": 1.40, "40x13": 1.42, "45x15": 1.45, "40x20": 1.51, "50x20": 1.51, "54x27": 1.57, "60x28": 1.57 } },
  { min: 300,   max: 499,      precos: { "30x15": 0.85, "40x13": 0.87, "45x15": 0.90, "40x20": 0.96, "50x20": 0.96, "54x27": 1.02, "60x28": 1.02 } },
  { min: 500,   max: 799,      precos: { "30x15": 0.78, "40x13": 0.80, "45x15": 0.83, "40x20": 0.89, "50x20": 0.89, "54x27": 0.95, "60x28": 0.95 } },
  { min: 800,   max: 999,      precos: { "30x15": 0.65, "40x13": 0.67, "45x15": 0.70, "40x20": 0.76, "50x20": 0.76, "54x27": 0.82, "60x28": 0.82 } },
  { min: 1000,  max: 1999,     precos: { "30x15": 0.55, "40x13": 0.57, "45x15": 0.60, "40x20": 0.66, "50x20": 0.66, "54x27": 0.72, "60x28": 0.72 } },
  { min: 2000,  max: 4999,     precos: { "30x15": 0.48, "40x13": 0.50, "45x15": 0.53, "40x20": 0.56, "50x20": 0.56, "54x27": 0.58, "60x28": 0.58 } },
  { min: 5000,  max: 7999,     precos: { "30x15": 0.45, "40x13": 0.47, "45x15": 0.50, "40x20": 0.53, "50x20": 0.53, "54x27": 0.55, "60x28": 0.55 } },
  { min: 8000,  max: 11999,    precos: { "30x15": 0.43, "40x13": 0.45, "45x15": 0.48, "40x20": 0.50, "50x20": 0.50, "54x27": 0.54, "60x28": 0.54 } },
  { min: 12000, max: 14999,    precos: { "30x15": 0.41, "40x13": 0.43, "45x15": 0.46, "40x20": 0.48, "50x20": 0.48, "54x27": 0.53, "60x28": 0.53 } },
  { min: 15000, max: Infinity, precos: { "30x15": 0.39, "40x13": 0.40, "45x15": 0.42, "40x20": 0.45, "50x20": 0.45, "54x27": 0.50, "60x28": 0.50 } },
];

// F) ALUMÍNIO (UV + verniz inclusos; tamanhos especiais: área cm² × R$0,08)
// Grupos: 30x15 | 40x13 | 45x15/45x13 | 40x20/46x18 | 50x20 | 54x27 | 60x28
const TABELA_ALUMINIO: FaixaPreco[] = [
  { min: 51,    max: 99,       precos: { "30x15": 2.92, "40x13": 2.94, "45x15": 2.97, "45x13": 2.97, "40x20": 3.03, "50x20": 3.03, "54x27": 3.09, "60x28": 3.09 } },
  { min: 100,   max: 199,      precos: { "30x15": 1.82, "40x13": 1.84, "45x15": 1.87, "45x13": 1.87, "40x20": 1.93, "50x20": 1.93, "54x27": 1.99, "60x28": 1.99 } },
  { min: 200,   max: 299,      precos: { "30x15": 1.42, "40x13": 1.44, "45x15": 1.47, "45x13": 1.47, "40x20": 1.53, "50x20": 1.53, "54x27": 1.59, "60x28": 1.59 } },
  { min: 300,   max: 499,      precos: { "30x15": 0.87, "40x13": 0.89, "45x15": 0.92, "45x13": 0.92, "40x20": 0.98, "50x20": 0.98, "54x27": 1.04, "60x28": 1.04 } },
  { min: 500,   max: 799,      precos: { "30x15": 0.80, "40x13": 0.82, "45x15": 0.85, "45x13": 0.85, "40x20": 0.91, "50x20": 0.91, "54x27": 0.97, "60x28": 0.97 } },
  { min: 800,   max: 999,      precos: { "30x15": 0.67, "40x13": 0.69, "45x15": 0.72, "45x13": 0.72, "40x20": 0.78, "50x20": 0.78, "54x27": 0.84, "60x28": 0.84 } },
  { min: 1000,  max: 1999,     precos: { "30x15": 0.57, "40x13": 0.59, "45x15": 0.62, "45x13": 0.62, "40x20": 0.68, "50x20": 0.68, "54x27": 0.74, "60x28": 0.74 } },
  { min: 2000,  max: 4999,     precos: { "30x15": 0.50, "40x13": 0.52, "45x15": 0.59, "45x13": 0.59, "40x20": 0.64, "50x20": 0.64, "54x27": 0.70, "60x28": 0.70 } },
  { min: 5000,  max: 7999,     precos: { "30x15": 0.47, "40x13": 0.49, "45x15": 0.56, "45x13": 0.56, "40x20": 0.60, "50x20": 0.60, "54x27": 0.68, "60x28": 0.68 } },
  { min: 8000,  max: 11999,    precos: { "30x15": 0.45, "40x13": 0.47, "45x15": 0.54, "45x13": 0.54, "40x20": 0.57, "50x20": 0.57, "54x27": 0.66, "60x28": 0.66 } },
  { min: 12000, max: 14999,    precos: { "30x15": 0.44, "40x13": 0.45, "45x15": 0.52, "45x13": 0.52, "40x20": 0.55, "50x20": 0.55, "54x27": 0.64, "60x28": 0.64 } },
  { min: 15000, max: Infinity, precos: { "30x15": 0.40, "40x13": 0.43, "45x15": 0.50, "45x13": 0.50, "40x20": 0.52, "50x20": 0.52, "54x27": 0.60, "60x28": 0.60 } },
];

// G) AÇO INOX 304 (apenas 45x15 e 50x20; Inox 430: -R$0,08/un)
const TABELA_AÇO_INOX: FaixaPreco[] = [
  { min: 51,    max: 100,      precos: { "45x15": 4.00, "50x20": 4.10 } },
  { min: 101,   max: 200,      precos: { "45x15": 3.80, "50x20": 3.90 } },
  { min: 201,   max: 300,      precos: { "45x15": 2.80, "50x20": 2.90 } },
  { min: 301,   max: 400,      precos: { "45x15": 2.00, "50x20": 2.10 } },
  { min: 501,   max: 700,      precos: { "45x15": 1.79, "50x20": 1.89 } },
  { min: 701,   max: 999,      precos: { "45x15": 1.69, "50x20": 1.79 } },
  { min: 1000,  max: 3000,     precos: { "45x15": 1.55, "50x20": 1.65 } },
  { min: 3001,  max: 4999,     precos: { "45x15": 1.45, "50x20": 1.55 } },
  { min: 5000,  max: 9999,     precos: { "45x15": 1.35, "50x20": 1.45 } },
  { min: 10000, max: Infinity, precos: { "45x15": 1.20, "50x20": 1.30 } },
];

// -----------------------------------------------------------------------------
// FUNÇÕES AUXILIARES
// -----------------------------------------------------------------------------

function encontrarFaixa(quantidade: number, tabela: FaixaPreco[]): FaixaPreco | null {
  // 1. Busca a faixa exata
  const faixa = tabela.find(f => quantidade >= f.min && quantidade <= f.max);
  if (faixa) return faixa;

  // 2. Se a quantidade for menor que o mínimo da primeira faixa, retorna a primeira
  if (quantidade < tabela[0].min) return tabela[0];

  // 3. Se for maior que o máximo da última faixa, retorna a última
  const ultimaFaixa = tabela[tabela.length - 1];
  if (quantidade > ultimaFaixa.max) return ultimaFaixa;

  // 4. Ajuste por Quantidade Próxima: Se cair em algum gap, encontra a faixa cuja borda (min ou max) está mais próxima
  let melhorFaixa = tabela[0];
  let menorDiferenca = Infinity;

  for (const f of tabela) {
    const diffMin = Math.abs(f.min - quantidade);
    const diffMax = Math.abs(f.max - quantidade);
    const menorDiffFaixa = Math.min(diffMin, diffMax);
    if (menorDiffFaixa < menorDiferenca) {
      menorDiferenca = menorDiffFaixa;
      melhorFaixa = f;
    }
  }

  return melhorFaixa;
}

// Normaliza o tamanho para a chave da tabela (considera aliases de grupos)
function normalizarTamanho(largura: number, comprimento: number, material: string): string {
  // Garante sempre largura >= comprimento para lookup consistente
  const [l, c] = largura >= comprimento ? [largura, comprimento] : [comprimento, largura];
  const chave = `${l}x${c}`;

  if (material === 'inox') {
    return chave;
  }

  // Definição dos aliases específicos por material para maior precisão
  const aliases: Record<string, Record<string, string>> = {
    poliester: {
      "30x10": "30x15",
      "46x18": "40x20",
      "45x13": "45x15",
    },
    void: {
      "46x18": "40x20",
      "45x13": "45x15",
    },
    vinil: {
      "46x18": "40x20",
      "45x13": "45x15",
    },
    destrutivel: {
      "46x18": "40x20",
      "45x13": "45x15",
    },
    flextag: {
      "30x10": "30x15",
      "46x18": "40x20",
      "45x13": "45x15",
    },
    aluminio: {
      "30x10": "30x15",
      "46x18": "40x20",
      // Alumínio possui coluna "45x13" própria na tabela
    }
  };

  const matAliases = aliases[material];
  if (matAliases && matAliases[chave]) {
    return matAliases[chave];
  }

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
  inputOrParams: string | ParamsCalculo | ParamsCalculo[]
): Promise<Orcamento | null> {

  let paramsArray: ParamsCalculo[] = [];

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

    paramsArray = [{
      material: mat,
      largura: dimMatch ? parseInt(dimMatch[1]) : 30,
      comprimento: dimMatch ? parseInt(dimMatch[2]) : 15,
      quantidade: qtdMatch ? parseInt(qtdMatch[1]) : (qtdEncontrada ? parseInt(qtdEncontrada) : 50),
      impressao_uv: msg.includes('uv') || msg.includes('u.v'),
      inox_430: msg.includes('430'),
      espessura_pvc: msg.includes('1mm') ? '1mm' : '2mm',
    }];
  } else if (Array.isArray(inputOrParams)) {
    paramsArray = inputOrParams;
  } else {
    paramsArray = [inputOrParams];
  }

  const orcamentoFinal: Orcamento = {
    itens: [],
    total: 0,
    observacoes: []
  };

  for (const params of paramsArray) {
    const { material, largura, comprimento, quantidade, impressao_uv, inox_430, espessura_pvc } = params;
    const areaCm2 = (largura * comprimento) / 100; // área em cm²
    const chaveNormalizada = normalizarTamanho(largura, comprimento, material);

    let precoUnitario = 0;
    let larguraFinal = largura;
    let comprimentoFinal = comprimento;
    const obsItem: string[] = [];
    let qtd = quantidade;

    // -------------------------------------------------------------------------
    if (material === 'poliester') {
      if (qtd < 51) { qtd = 51; obsItem.push('Quantidade mínima para Poliéster: *51 unidades*.'); }
      const faixa = encontrarFaixa(qtd, TABELA_POLIESTER)!;
      if (faixa.precos[chaveNormalizada] !== undefined) {
        precoUnitario = faixa.precos[chaveNormalizada];
      } else {
        const prox = obterTamanhoMaisProximo(largura, comprimento, faixa);
        precoUnitario = (prox.preco / prox.area) * (largura * comprimento);
        obsItem.push(`Tamanho especial calculado proporcionalmente a ${prox.tamanho}.`);
      }
      if (impressao_uv) { precoUnitario += 0.05; obsItem.push('Adicionado *R$ 0,05/un* por Impressão U.V.'); }
    }

    // -------------------------------------------------------------------------
    else if (material === 'void') {
      if (qtd < 51) { qtd = 51; obsItem.push('Quantidade mínima para VOID: *51 unidades*.'); }
      const faixa = encontrarFaixa(qtd, TABELA_VOID)!;
      if (faixa.precos[chaveNormalizada] !== undefined) {
        precoUnitario = faixa.precos[chaveNormalizada];
      } else {
        const prox = obterTamanhoMaisProximo(largura, comprimento, faixa);
        precoUnitario = (prox.preco / prox.area) * (largura * comprimento);
        obsItem.push(`Tamanho especial calculado proporcionalmente a ${prox.tamanho}.`);
      }
      if (impressao_uv) { precoUnitario += 0.05; obsItem.push('Adicionado *R$ 0,05/un* por Impressão U.V.'); }
    }

    // -------------------------------------------------------------------------
    else if (material === 'vinil') {
      if (qtd < 51) { qtd = 51; obsItem.push('Quantidade mínima para Vinil: *51 unidades*.'); }
      const faixa = encontrarFaixa(qtd, TABELA_VINIL)!;
      if (faixa.precos[chaveNormalizada] !== undefined) {
        precoUnitario = faixa.precos[chaveNormalizada];
      } else {
        const prox = obterTamanhoMaisProximo(largura, comprimento, faixa);
        precoUnitario = (prox.preco / prox.area) * (largura * comprimento);
        obsItem.push(`Tamanho especial calculado proporcionalmente a ${prox.tamanho}.`);
      }
    }

    // -------------------------------------------------------------------------
    else if (material === 'destrutivel') {
      if (qtd < 500) { obsItem.push('⚠️ Pedido mínimo para Vinil Destrutível: *500 unidades*.'); }
      const faixa = encontrarFaixa(qtd, TABELA_DESTRUTIVEL)!;
      if (faixa.precos[chaveNormalizada] !== undefined) {
        precoUnitario = faixa.precos[chaveNormalizada];
      } else {
        const prox = obterTamanhoMaisProximo(largura, comprimento, faixa);
        precoUnitario = (prox.preco / prox.area) * (largura * comprimento);
        obsItem.push(`Tamanho especial calculado proporcionalmente a ${prox.tamanho}.`);
      }
    }

    // -------------------------------------------------------------------------
    else if (material === 'flextag') {
      if (qtd < 51) { qtd = 51; obsItem.push('Quantidade mínima para Flextag: *51 unidades*.'); }
      const faixa = encontrarFaixa(qtd, TABELA_FLEXTAG)!;
      if (faixa.precos[chaveNormalizada] !== undefined) {
        precoUnitario = faixa.precos[chaveNormalizada];
      } else {
        precoUnitario = areaCm2 * 0.08;
        obsItem.push('Tamanho especial: *Área (cm²) × R$ 0,08*. Corte com quinas vivas.');
      }
    }

    // -------------------------------------------------------------------------
    else if (material === 'aluminio') {
      if (qtd < 51) { qtd = 51; obsItem.push('Quantidade mínima para Alumínio: *51 unidades*.'); }
      const faixa = encontrarFaixa(qtd, TABELA_ALUMINIO)!;
      if (faixa.precos[chaveNormalizada] !== undefined) {
        precoUnitario = faixa.precos[chaveNormalizada];
      } else {
        precoUnitario = areaCm2 * 0.08;
        obsItem.push('Tamanho especial: *Área (cm²) × R$ 0,08*. Corte com quinas vivas.');
      }
    }

    // -------------------------------------------------------------------------
    else if (material === 'inox') {
      if (qtd < 51) { qtd = 51; obsItem.push('Quantidade mínima para Aço Inox: *51 unidades*.'); }
      // Aço Inox aceita apenas 45x15 e 50x20
      let chaveInox = '45x15';
      if (largura === 50 && comprimento === 20 || largura === 20 && comprimento === 50) {
        chaveInox = '50x20';
        larguraFinal = 50; comprimentoFinal = 20;
      } else if (largura === 45 && comprimento === 15 || largura === 15 && comprimento === 45) {
        chaveInox = '45x15';
        larguraFinal = 45; comprimentoFinal = 15;
      } else {
        continue; // Ignora item se tamanho for inválido
      }
      const faixa = encontrarFaixa(qtd, TABELA_AÇO_INOX)!;
      precoUnitario = faixa.precos[chaveInox];
      if (inox_430) { precoUnitario -= 0.08; obsItem.push('Desconto *R$ 0,08/un* aplicado para Inox 430.'); }
      obsItem.push('Prazo de produção: *10 a 12 dias úteis*.');
    }

    // -------------------------------------------------------------------------
    else if (material === 'acm') {
      if (qtd < 10) { qtd = 10; obsItem.push('Quantidade mínima para ACM: *10 unidades*.'); }
      precoUnitario = areaCm2 * 0.08;
      obsItem.push('Calculado: *Área (cm²) × R$ 0,08*.');
    }

    // -------------------------------------------------------------------------
    else if (material === 'pvc') {
      if (qtd < 10) { qtd = 10; obsItem.push('Quantidade mínima para PVC: *10 unidades*.'); }
      const taxa = (espessura_pvc === '1mm') ? 0.02 : 0.03;
      precoUnitario = areaCm2 * taxa;
      obsItem.push(`Calculado PVC ${espessura_pvc ?? '2mm'}: *Área (cm²) × R$ ${taxa.toFixed(2)}*.`);
    }

    // -------------------------------------------------------------------------
    else if (material === 'ribbon_resina') { precoUnitario = 39.00; }
    else if (material === 'ribbon_cera')   { precoUnitario = 19.00; }
    else if (material === 'cola')          { precoUnitario = 30.00; obsItem.push('Cola junta de motor 3M. Rende ~200 placas.'); }

    if (precoUnitario <= 0) continue;

    const subtotal = qtd * precoUnitario;
    const nomeMaterial = material.charAt(0).toUpperCase() + material.slice(1).replace(/_/g, ' ');

    orcamentoFinal.itens.push({
      material: nomeMaterial,
      largura: larguraFinal,
      comprimento: comprimentoFinal,
      quantidade: qtd,
      precoUnitario,
      subtotal,
      observacoes: obsItem,
    });
    
    orcamentoFinal.total += subtotal;
    orcamentoFinal.observacoes.push(...obsItem);
  }

  if (orcamentoFinal.itens.length === 0) return null;

  return orcamentoFinal;
}

// -----------------------------------------------------------------------------
// FORMATA O CARRINHO NO LAYOUT IMUTÁVEL DO PROMPT
// -----------------------------------------------------------------------------

export function formatarOrcamento(orcamento: Orcamento): string {
  let output = `🛒 *SUA COTAÇÃO ATUAL:*\n━━━━━━━━━━━━━━━━━━━━\n`;
  
  for (const item of orcamento.itens) {
    const tamanhoTexto = item.largura > 0 ? `Medida: *${item.largura}x${item.comprimento} mm* | ` : '';
    output += `Produto: *${item.material}*\n`;
    output += `${tamanhoTexto}Qtd: *${item.quantidade}* un.\n`;
    output += `Preço Unitário: *R$ ${item.precoUnitario.toFixed(2)}*\n`;
    output += `Subtotal Item: *R$ ${item.subtotal.toFixed(2)}*\n`;
    output += `━━━━━━━━━━━━━━━━━━━━\n`;
  }
  
  // Deduplica observações se houver repetidas
  const obsUnicas = [...new Set(orcamento.observacoes)];
  const obsTexto = obsUnicas.length
    ? '\n' + obsUnicas.map(o => `ℹ️ ${o}`).join('\n')
    : '';

  output += `*VALOR TOTAL DA COTAÇÃO: R$ ${orcamento.total.toFixed(2)}*${obsTexto}`;
  return output;
}
