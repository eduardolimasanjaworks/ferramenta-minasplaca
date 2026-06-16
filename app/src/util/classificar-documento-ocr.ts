/**
 * Classifica documento a partir do texto OCR — sem perguntar "CNH ou CRLV?".
 */
import type { PassoCadastro } from '../servicos/fluxo-cadastro.js';
import { extrairCorpoOcr } from './ocr-qualidade.js';

export interface ClassificacaoDocumento {
  tipo: PassoCadastro | null;
  confianca: number;
  rotulo: string;
  resumo: string;
  campos: Record<string, string>;
}

function extrairCampo(texto: string, regex: RegExp): string | undefined {
  const m = texto.match(regex);
  return m?.[1]?.trim();
}

/** CNH brasileira costuma ter rótulo e valor em linhas separadas. */
function extrairCamposCnh(texto: string, campos: Record<string, string>): void {
  const flat = texto.replace(/\r\n/g, '\n');

  if (!campos.nome) {
    const nome =
      extrairCampo(flat, /(?:^|\n)\s*NOME\s*\n\s*([A-ZÁÉÍÓÚÃÕÇ][A-ZÁÉÍÓÚÃÕÇa-záéíóúãõç\s]{4,50})/im) ??
      extrairCampo(flat, /(?:nome|name)[:\s]+([A-ZÁÉÍÓÚÃÕÇ][A-ZÁÉÍÓÚÃÕÇa-záéíóúãõç\s]{4,50})/i) ??
      extrairCampo(flat, /(?:^|\n)\s*([A-ZÁÉÍÓÚÃÕÇ][A-ZÁÉÍÓÚÃÕÇ\s]{8,45})\s*\n/im);
    if (nome) campos.nome = nome;
  }

  if (!campos.cpf) {
    const cpf =
      extrairCampo(flat, /(?:^|\n)\s*CPF\s*\n\s*([\d.\-]{11,14})/im) ??
      extrairCampo(flat, /cpf[:\s]*([\d.\-]{11,14})/i) ??
      extrairCampo(flat, /\b(\d{3}\.\d{3}\.\d{3}-\d{2})\b/);
    if (cpf) campos.cpf = cpf;
  }

  if (!campos.registro) {
    const registro =
      extrairCampo(flat, /(?:n[°º.]?\s*registro|registro)\s*\n\s*(\d{9,11})/im) ??
      extrairCampo(flat, /(?:registro|n[°º.]?\s*reg)[:\s]*(\d{9,11})/i);
    if (registro) campos.registro = registro;
  }

  if (!campos.categoria) {
    const categoria =
      extrairCampo(flat, /(?:cat\.?\s*hab\.?|categoria)\s*\n\s*([A-E]+)/im) ??
      extrairCampo(flat, /(?:cat\.?|categoria)[:\s]*([A-E]+)/i);
    if (categoria) campos.categoria = categoria;
  }

  if (!campos.validade) {
    const validade =
      extrairCampo(flat, /(?:validade|vencimento)\s*\n\s*(\d{2}\/\d{2}\/\d{2,4})/im) ??
      extrairCampo(flat, /(?:validade|vencimento)[:\s]*(\d{2}\/\d{2}\/\d{2,4})/i);
    if (validade) campos.validade = validade;
  }
}

function montarResumo(tipo: PassoCadastro, campos: Record<string, string>): string {
  const partes: string[] = [];
  if (campos.nome) partes.push(`nome ${campos.nome}`);
  if (campos.cpf) partes.push(`CPF ${campos.cpf}`);
  if (campos.registro) partes.push(`registro ${campos.registro}`);
  if (campos.categoria) partes.push(`cat. ${campos.categoria}`);
  if (campos.validade) partes.push(`validade ${campos.validade}`);
  if (campos.placa) partes.push(`placa ${campos.placa}`);
  if (campos.renavam) partes.push(`RENAVAM ${campos.renavam}`);
  if (campos.rntrc) partes.push(`RNTRC ${campos.rntrc}`);

  const rotulos: Record<PassoCadastro, string> = {
    cnh: 'CNH',
    crlv: 'CRLV',
    antt: 'ANTT',
    endereco: 'comprovante de endereço',
    caminhao: 'foto do caminhão',
  };

  if (partes.length === 0) {
    return `Identifiquei ${rotulos[tipo]} na imagem`;
  }
  return `Li ${rotulos[tipo]} — ${partes.join(', ')}`;
}

/** Analisa OCR e infere tipo + campos principais. */
export function classificarDocumentoPorOcr(conteudoMidia: string): ClassificacaoDocumento {
  const texto = extrairCorpoOcr(conteudoMidia);
  const t = texto.toLowerCase();

  const campos: Record<string, string> = {};
  extrairCamposCnh(texto, campos);

  const placa = extrairCampo(texto, /(?:placa)[:\s]*([A-Z]{3}[\d][A-Z\d][\d]{2})/i);
  if (placa) campos.placa = placa;
  const renavam = extrairCampo(texto, /renavam[:\s]*([\d.\-]{9,14})/i);
  if (renavam) campos.renavam = renavam;
  const rntrc = extrairCampo(texto, /(?:rntrc|antt)[:\s]*([\d.\-\/]{6,20})/i);
  if (rntrc) campos.rntrc = rntrc;

  const scores: Record<PassoCadastro, number> = {
    cnh: 0,
    crlv: 0,
    antt: 0,
    endereco: 0,
    caminhao: 0,
  };

  if (
    /carteira nacional de habilita|cnh|habilita[cç][aã]o|cat\.?\s*hab|senatran|minist[eé]rio da infraestrutura|minist[eé]rio dos transportes|rep[uú]blica federativa do brasil/i.test(
      t,
    )
  ) {
    scores.cnh += 3;
  }
  if (campos.registro && campos.cpf) scores.cnh += 3;
  else if (campos.cpf && campos.nome) scores.cnh += 2;
  if (campos.categoria) scores.cnh += 2;
  if (campos.registro) scores.cnh += 1;

  if (/crlv|certificado de registro e licenciamento|licenciamento de ve[ií]culo/i.test(t)) {
    scores.crlv += 3;
  }
  if (campos.placa || campos.renavam) scores.crlv += 2;

  if (/antt|rntrc|transportador rodovi[aá]rio|daer/i.test(t)) scores.antt += 3;
  if (campos.rntrc) scores.antt += 2;

  if (/comprovante|endere[cç]o|cep[:\s]*\d{5}|conta de (luz|[aá]gua)|fatura/i.test(t)) {
    scores.endereco += 3;
  }

  if (/caminh[aã]o|cavalo mec[aâ]nico|bitrem|carreta/i.test(t) && scores.crlv < 2) {
    scores.caminhao += 2;
  }

  const ordenado = (Object.entries(scores) as [PassoCadastro, number][])
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1]);

  if (ordenado.length === 0 || ordenado[0][1] < 2) {
    // Heurística: CPF + nome em texto longo → provável CNH
    if (campos.cpf && campos.nome && texto.length > 80) {
      const resumo = montarResumo('cnh', campos);
      return { tipo: 'cnh', confianca: 0.5, rotulo: 'CNH', resumo, campos };
    }
    return {
      tipo: null,
      confianca: 0,
      rotulo: 'desconhecido',
      resumo: '',
      campos,
    };
  }

  const [tipo, pontos] = ordenado[0];
  const maxPossivel = 6;
  const confianca = Math.min(1, pontos / maxPossivel);
  const resumo = montarResumo(tipo, campos);

  const rotulos: Record<PassoCadastro, string> = {
    cnh: 'CNH',
    crlv: 'CRLV',
    antt: 'ANTT',
    endereco: 'comprovante de endereço',
    caminhao: 'foto do caminhão',
  };

  return { tipo, confianca, rotulo: rotulos[tipo], resumo, campos };
}
