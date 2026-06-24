/**
 * Testes deterministas da leitura da oferta e do aceite curto.
 * Garante que o formato real atual da mensagem da GMX seja reconhecido.
 * Evita que "sim tenho" escape do fluxo programatico e caia no LLM.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { extrairOfertaGmX } from './ferramentas-contexto.js';
import { motoristaAceitou } from './motor-negociacao.js';

test('extrai oferta no formato atual da GMX com origem, destino, operacao e valor', () => {
  const oferta = extrairOfertaGmX([
    {
      role: 'assistant',
      content: [
        'Adriano - GMX / CargoX',
        '',
        'Temos carga ARROZEIRA INDUSTRIA E COMERCIO DE CEREAIS LTDA -> F. Uberlandia, MG',
        '',
        'Operacao: ARROZ',
        'Valor: R$ 16.400',
        '',
        'Tem interesse?',
      ].join('\n'),
    },
  ]);

  assert.ok(oferta);
  assert.equal(oferta?.origem, 'ARROZEIRA INDUSTRIA E COMERCIO DE CEREAIS LTDA');
  assert.equal(oferta?.destino, 'F. Uberlandia, MG');
  assert.equal(oferta?.operacao, 'ARROZ');
  assert.equal(oferta?.valor, 16400);
});

test('trata aceite curto do motorista como aceite de oferta', () => {
  assert.equal(motoristaAceitou('Sim tenho'), true);
  assert.equal(motoristaAceitou('tenho interesse'), true);
  assert.equal(motoristaAceitou('quero sim'), true);
  assert.equal(motoristaAceitou('sem interesse'), false);
});
