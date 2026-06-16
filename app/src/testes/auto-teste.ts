/**
 * Testes automáticos executáveis em runtime (diagnóstico).
 */
import { dividirResposta } from '../servicos/mensagem.js';
import {
  extrairBlocosFerramenta,
  mesclarFerramentasPreservadas,
  serializarBlocoFerramenta,
} from '../servicos/ferramentas.js';
import {
  anexarFerramentasProgramaticas,
  extrairLocalizacaoTexto,
  extrairOfertaGmX,
} from '../servicos/ferramentas-contexto.js';
import { aleatorioEntre } from '../servicos/config-humanizacao.js';
import { normalizarTelefone, telefoneParaJid } from '../util/telefone.js';
import { obterContextoHorarioBrasilia } from '../util/horario-brasilia.js';
import {
  classificarEntrada,
  tentarRespostaEntradaConfusa,
} from '../util/entrada-confusa.js';
import {
  extrairRespostaMotorista,
  sanitizarVazamentoPensamento,
} from '../servicos/cadeia-pensamento.js';

export interface ResultadoTeste {
  nome: string;
  ok: boolean;
  detalhe?: string;
}

function assert(nome: string, cond: boolean, detalhe?: string): ResultadoTeste {
  return { nome, ok: cond, detalhe: cond ? undefined : detalhe };
}

function ehMensagemRecebida(evento: string | undefined): boolean {
  const e = (evento ?? '').toLowerCase().replace(/\./g, '_');
  return e === 'messages_upsert';
}

export async function executarTestesUnidade(): Promise<ResultadoTeste[]> {
  const r: ResultadoTeste[] = [];

  const partes = dividirResposta('Oi parceiro, tudo bem, sou da GMX.');
  r.push(assert('dividirResposta remove pontos', !partes.some((p) => p.endsWith('.'))));
  r.push(assert('dividirResposta divide por vírgula', partes.length >= 2));

  const umaLinha = dividirResposta('Linha1.\n\nLinha2.');
  r.push(assert('dividirResposta achata quebras', umaLinha.length >= 1));

  const blocos = extrairBlocosFerramenta(
    'Ok parceiro {"ferramenta":"registrar_disponibilidade","dados":{"disponivel":true}}',
  );
  r.push(assert('extrairBlocosFerramenta', blocos.length === 1 && blocos[0].ferramenta === 'registrar_disponibilidade'));

  const comMarkdown = extrairBlocosFerramenta(
    'Ok\n```json\n{"ferramenta":"resposta_oferta_carga","dados":{"aceite":true}}\n```',
  );
  r.push(assert('extrairBlocosFerramenta markdown', comMarkdown.length === 1));

  const mesclado = mesclarFerramentasPreservadas(
    ['texto {"ferramenta":"registrar_disponibilidade","dados":{"disponivel":true}}'],
    'só texto visível',
  );
  r.push(assert('mesclarFerramentasPreservadas', mesclado.includes('registrar_disponibilidade')));

  r.push(assert('extrairLocalizacaoTexto', extrairLocalizacaoTexto('to em Campinas SP') === 'Campinas SP'));

  const oferta = extrairOfertaGmX([
    {
      role: 'assistant',
      content: 'retirada Guarulhos SP, entrega Curitiba PR, valor R$ 4.500,00',
    },
  ]);
  r.push(assert('extrairOfertaGmX', oferta?.valor === 4500 && oferta.origem.includes('Guarulhos')));

  const prog = await anexarFerramentasProgramaticas(
    'beleza parceiro',
    ['registrar_disponibilidade'],
    {
      telefone: '5511999887766',
      mensagem: 'Campinas SP',
      historico: [{ role: 'user', content: 'to vazio' }],
    },
    [],
  );
  r.push(assert('anexarFerramentasProgramaticas', prog.includes('registrar_disponibilidade')));

  r.push(assert('serializarBlocoFerramenta', serializarBlocoFerramenta('teste', { a: 1 }).includes('teste')));

  r.push(assert('ehMensagemRecebida v2', ehMensagemRecebida('messages.upsert')));
  r.push(assert('ehMensagemRecebida v1', ehMensagemRecebida('MESSAGES_UPSERT')));
  r.push(assert('ignora connection', !ehMensagemRecebida('connection.update')));

  r.push(assert('normalizarTelefone', normalizarTelefone('+55 (12) 99791-8525') === '5512997918525'));
  r.push(assert('telefoneParaJid', telefoneParaJid('5512997918525') === '5512997918525@s.whatsapp.net'));

  const a = aleatorioEntre(100, 100);
  const b = aleatorioEntre(50, 200);
  r.push(assert('aleatorioEntre fixo', a === 100));
  r.push(assert('aleatorioEntre range', b >= 50 && b <= 200));

  const horario = obterContextoHorarioBrasilia();
  r.push(assert('horario Brasilia', horario.includes('Brasília') && horario.includes('America/Sao_Paulo')));

  const spam = classificarEntrada('hshshsh asdfgh');
  r.push(assert('entrada nonsense spam', spam.qualidade === 'nonsense'));

  const ilegivel = classificarEntrada('gostaria de saber sobr hshshsh');
  r.push(assert('entrada ilegivel', ilegivel.qualidade === 'ilegivel'));

  const clara = classificarEntrada('mudei de carro');
  r.push(assert('entrada operacional clara', clara.qualidade === 'clara'));

  const confusaProg = tentarRespostaEntradaConfusa('asdfghjkl', {
    historico: [{ role: 'assistant', content: 'Fala parceiro, sou da GMX, me conta no que você precisa' }],
  });
  r.push(assert('resposta programatica confusa', Boolean(confusaProg)));

  const jsonPensamento = extrairRespostaMotorista(
    '{"raciocinio":{"o_que_motorista_quis":"teste"},"resposta_motorista":"Beleza parceiro, manda o CRLV"}',
    'teste',
  );
  r.push(
    assert(
      'extrai só resposta_motorista',
      jsonPensamento.resposta.includes('CRLV') && !jsonPensamento.resposta.includes('raciocinio'),
    ),
  );

  const vazamento = sanitizarVazamentoPensamento(
    'PASSO 2 — rascunho\nCENÁRIO 7 ativo\nBeleza parceiro, manda a localização',
  );
  r.push(assert('sanitiza vazamento pensamento', vazamento === 'Beleza parceiro, manda a localização'));

  return r;
}
