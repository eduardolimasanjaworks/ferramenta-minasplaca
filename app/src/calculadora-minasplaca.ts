/**
 * Calculadora comercial Minas Placa — preços carregados do Postgres (painel).
 */
import type { FaixaPreco } from './precos-tabelas-padrao.js';
import { obterPrecosExtras, obterTabelasPrecos } from './precos-produtos-store.js';

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
// FUNÇÕES AUXILIARES
// -----------------------------------------------------------------------------

function tabelaMaterial(tabelas: Record<string, FaixaPreco[]>, slug: string): FaixaPreco[] {
  return tabelas[slug] ?? [];
}

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

  const tabelas = await obterTabelasPrecos();
  const extras = await obterPrecosExtras();
  const uvAdicional = extras.uv_adicional ?? 0.05;
  const flextagEspecial = extras.flextag_especial_cm2 ?? 0.08;
  const aluminioEspecial = extras.aluminio_especial_cm2 ?? 0.08;
  const acmTaxa = extras.acm_taxa_cm2 ?? 0.08;
  const pvc1mm = extras.pvc_1mm_cm2 ?? 0.02;
  const pvc2mm = extras.pvc_2mm_cm2 ?? 0.03;
  const inox430Desc = extras.inox_430_desconto ?? 0.08;
  const ribbonResina = extras.ribbon_resina ?? 39;
  const ribbonCera = extras.ribbon_cera ?? 19;
  const cola3m = extras.cola_3m ?? 30;

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
      const faixa = encontrarFaixa(qtd, tabelaMaterial(tabelas, "poliester"))!;
      if (faixa.precos[chaveNormalizada] !== undefined) {
        precoUnitario = faixa.precos[chaveNormalizada];
      } else {
        const prox = obterTamanhoMaisProximo(largura, comprimento, faixa);
        precoUnitario = (prox.preco / prox.area) * (largura * comprimento);
        obsItem.push(`Tamanho especial calculado proporcionalmente a ${prox.tamanho}.`);
      }
      if (impressao_uv) { precoUnitario += uvAdicional; obsItem.push('Adicionado *R$ ' + uvAdicional.toFixed(2).replace('.', ',') + '/un* por Impressão U.V.'); }
    }

    // -------------------------------------------------------------------------
    else if (material === 'void') {
      if (qtd < 51) { qtd = 51; obsItem.push('Quantidade mínima para VOID: *51 unidades*.'); }
      const faixa = encontrarFaixa(qtd, tabelaMaterial(tabelas, "void"))!;
      if (faixa.precos[chaveNormalizada] !== undefined) {
        precoUnitario = faixa.precos[chaveNormalizada];
      } else {
        const prox = obterTamanhoMaisProximo(largura, comprimento, faixa);
        precoUnitario = (prox.preco / prox.area) * (largura * comprimento);
        obsItem.push(`Tamanho especial calculado proporcionalmente a ${prox.tamanho}.`);
      }
      if (impressao_uv) { precoUnitario += uvAdicional; obsItem.push('Adicionado *R$ ' + uvAdicional.toFixed(2).replace('.', ',') + '/un* por Impressão U.V.'); }
    }

    // -------------------------------------------------------------------------
    else if (material === 'vinil') {
      if (qtd < 51) { qtd = 51; obsItem.push('Quantidade mínima para Vinil: *51 unidades*.'); }
      const faixa = encontrarFaixa(qtd, tabelaMaterial(tabelas, "vinil"))!;
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
      const faixa = encontrarFaixa(qtd, tabelaMaterial(tabelas, "destrutivel"))!;
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
      const faixa = encontrarFaixa(qtd, tabelaMaterial(tabelas, "flextag"))!;
      if (faixa.precos[chaveNormalizada] !== undefined) {
        precoUnitario = faixa.precos[chaveNormalizada];
      } else {
        precoUnitario = areaCm2 * flextagEspecial;
        obsItem.push('Tamanho especial: *Área (cm²) × R$ ' + flextagEspecial.toFixed(2).replace('.', ',') + '*. Corte com quinas vivas.');
      }
    }

    // -------------------------------------------------------------------------
    else if (material === 'aluminio') {
      if (qtd < 51) { qtd = 51; obsItem.push('Quantidade mínima para Alumínio: *51 unidades*.'); }
      const faixa = encontrarFaixa(qtd, tabelaMaterial(tabelas, "aluminio"))!;
      if (faixa.precos[chaveNormalizada] !== undefined) {
        precoUnitario = faixa.precos[chaveNormalizada];
      } else {
        precoUnitario = areaCm2 * aluminioEspecial;
        obsItem.push('Tamanho especial: *Área (cm²) × R$ ' + aluminioEspecial.toFixed(2).replace('.', ',') + '*. Corte com quinas vivas.');
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
      const faixa = encontrarFaixa(qtd, tabelaMaterial(tabelas, "inox"))!;
      precoUnitario = faixa.precos[chaveInox];
      if (inox_430) { precoUnitario -= inox430Desc; obsItem.push('Desconto *R$ ' + inox430Desc.toFixed(2).replace('.', ',') + '/un* aplicado para Inox 430.'); }
      obsItem.push('Prazo de produção: *10 a 12 dias úteis*.');
    }

    // -------------------------------------------------------------------------
    else if (material === 'acm') {
      if (qtd < 10) { qtd = 10; obsItem.push('Quantidade mínima para ACM: *10 unidades*.'); }
      precoUnitario = areaCm2 * acmTaxa;
      obsItem.push('Calculado: *Área (cm²) × R$ ' + acmTaxa.toFixed(2).replace('.', ',') + '*.');
    }

    // -------------------------------------------------------------------------
    else if (material === 'pvc') {
      if (qtd < 10) { qtd = 10; obsItem.push('Quantidade mínima para PVC: *10 unidades*.'); }
      const taxa = (espessura_pvc === '1mm') ? pvc1mm : pvc2mm;
      precoUnitario = areaCm2 * taxa;
      obsItem.push(`Calculado PVC ${espessura_pvc ?? '2mm'}: *Área (cm²) × R$ ${taxa.toFixed(2)}*.`);
    }

    // -------------------------------------------------------------------------
    else if (material === 'ribbon_resina') { precoUnitario = ribbonResina; }
    else if (material === 'ribbon_cera')   { precoUnitario = ribbonCera; }
    else if (material === 'cola')          { precoUnitario = cola3m; obsItem.push('Cola junta de motor 3M. Rende ~200 placas.'); }

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
