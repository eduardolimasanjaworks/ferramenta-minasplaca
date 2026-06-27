/**
 * Testa a busca lexical do treinador sem depender do banco.
 * Garante que os trechos mais relacionados subam para o topo.
 * Mantem a recuperacao deterministica antes da camada de runtime.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buscarTrechosRelacionadosEmCatalogoParaTeste } from './treinamento-config-busca.js';

test('prioriza trechos com cidade e estado antes de escalar para humano', () => {
  const itens = buscarTrechosRelacionadosEmCatalogoParaTeste(
    'troque os textos para pedir cidade e estado antes de escalar para humano',
    [
      {
        alvo: 'mensagens_fluxo',
        chave: 'c7_local_invalida',
        rotulo: 'mensagens_fluxo.c7_local_invalida',
        texto: 'Antes de escalar, confirme cidade e estado com o motorista.',
      },
      {
        alvo: 'orquestracao_texto',
        chave: 'camadaHumana',
        rotulo: 'orquestracao_texto.camadaHumana',
        texto: 'Escalone para o humano somente depois de validar dados essenciais.',
      },
      {
        alvo: 'mensagens_fluxo',
        chave: 'oferta_proativa_template',
        rotulo: 'mensagens_fluxo.oferta_proativa_template',
        texto: 'Tenho uma oferta para seu perfil.',
      },
    ],
  );

  assert.equal(itens[0]?.chave, 'c7_local_invalida');
  assert.equal(itens[1]?.chave, 'camadaHumana');
  assert.equal(itens.length, 2);
});
