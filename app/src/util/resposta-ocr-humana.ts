/**
 * Textos humanos para confirmação de leitura OCR — tom WhatsApp GMX.
 * Vírgulas separam bolhas no envio; sem ponto final.
 */
import type { PassoCadastro } from '../servicos/fluxo-cadastro.js';

const ROTULOS: Record<PassoCadastro, string> = {
  cnh: 'CNH',
  crlv: 'CRLV',
  antt: 'ANTT',
  endereco: 'comprovante de endereço',
  caminhao: 'foto do caminhão',
};

const ABERTURAS = [
  'Opa recebi a foto aqui',
  'Beleza deu pra ler sim',
  'Show recebi aqui',
  'Fechou vi aqui',
];

function escolherAbertura(semente: string): string {
  let n = 0;
  for (let i = 0; i < semente.length; i++) n += semente.charCodeAt(i);
  return ABERTURAS[n % ABERTURAS.length];
}

function fraseCampos(tipo: PassoCadastro, campos: Record<string, string>): string {
  const p: string[] = [];

  switch (tipo) {
    case 'cnh':
      if (campos.nome) p.push(`nome ${campos.nome}`);
      if (campos.cpf) p.push(`CPF ${campos.cpf}`);
      if (campos.registro) {
        p.push(
          campos.categoria
            ? `registro ${campos.registro} cat ${campos.categoria}`
            : `registro ${campos.registro}`,
        );
      } else if (campos.categoria) {
        p.push(`categoria ${campos.categoria}`);
      }
      if (campos.validade) p.push(`validade ${campos.validade}`);
      break;
    case 'crlv':
      if (campos.placa) p.push(`placa ${campos.placa}`);
      if (campos.renavam) p.push(`RENAVAM ${campos.renavam}`);
      if (campos.nome) p.push(`proprietário ${campos.nome}`);
      break;
    case 'antt':
      if (campos.rntrc) p.push(`RNTRC ${campos.rntrc}`);
      if (campos.nome) p.push(`transportador ${campos.nome}`);
      break;
    case 'endereco':
      if (campos.nome) p.push(`titular ${campos.nome}`);
      break;
    case 'caminhao':
      if (campos.placa) p.push(`placa ${campos.placa}`);
      break;
  }

  return p.join(', ');
}

/** Documento lido com confiança — prova o que entendeu e confirma gravação. */
export function montarRespostaDocumentoSalvo(opts: {
  tipo: PassoCadastro;
  campos: Record<string, string>;
  telefone: string;
}): string {
  const { tipo, campos, telefone } = opts;
  const doc = ROTULOS[tipo];
  const abertura = escolherAbertura(telefone);
  const detalhes = fraseCampos(tipo, campos);

  if (detalhes) {
    return `${abertura}, vi que é ${doc} — ${detalhes}, já subi pro cadastro da equipe`;
  }
  return `${abertura}, identifiquei ${doc} na imagem, já subi pro cadastro da equipe`;
}

/** OCR incerto — mostra o que leu e pede confirmação humana. */
export function montarRespostaConfirmacaoOcr(opts: {
  tipo: PassoCadastro;
  campos: Record<string, string>;
  telefone: string;
}): string {
  const { tipo, campos, telefone } = opts;
  const doc = ROTULOS[tipo];
  const abertura = escolherAbertura(telefone);
  const detalhes = fraseCampos(tipo, campos);

  if (detalhes) {
    return `${abertura}, acho que é ${doc} — ${detalhes}, confirma pra mim se é isso que você quer atualizar no cadastro`;
  }
  return `${abertura}, parece ser ${doc} mas não peguei todos os dados direito, confirma se é isso que você quer atualizar`;
}

/** Após motorista confirmar leitura incerta. */
export function montarRespostaConfirmada(opts: {
  tipo: PassoCadastro;
  campos: Record<string, string>;
}): string {
  const doc = ROTULOS[opts.tipo];
  const detalhes = fraseCampos(opts.tipo, opts.campos);
  if (detalhes) {
    return `Fechou então, ${doc} — ${detalhes}, já salvei no cadastro`;
  }
  return `Fechou, ${doc} salva no cadastro então`;
}

export const MSG_FOTO_ILEGIVEL =
  'Eita ficou meio embaçada a foto parceiro, manda de novo com boa luz sem cortar o documento';

export const MSG_OCR_RECUSA =
  'Deu um problema técnico na leitura aqui do meu lado, manda a foto de novo que eu tento outra vez';

export const MSG_TIPO_INCERTO_COM_TEXTO = (trecho: string) =>
  `Li um pedaço assim: ${trecho}, mas não fechei qual documento é — me fala se é CNH, CRLV ou outro`;

export const MSG_TIPO_INCERTO =
  'Recebi a foto mas não fechei o tipo de documento, me fala se é CNH, CRLV ou outro que eu salvo certinho';

export const MSG_CONFIRMACAO_NEGADA =
  'Beleza sem problema, manda a foto certa que eu leio de novo';

export const MSG_PEDIR_FOTO =
  'Beleza parceiro, manda a foto do documento que você quer atualizar';
