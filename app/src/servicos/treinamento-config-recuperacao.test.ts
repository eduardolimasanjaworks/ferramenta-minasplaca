/**
 * Testa a mescla entre busca vetorial e lexical do treinador.
 * Garante prioridade para vetorial sem duplicar o mesmo trecho.
 * Mantem o ranking previsivel antes da camada de runtime.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mesclarTrechosTreinamentoParaTeste } from './treinamento-config-recuperacao.js';

test('mescla vetorial e lexical priorizando vetorial e removendo duplicados', () => {
  const itens = mesclarTrechosTreinamentoParaTeste(
    [
      {
        alvo: 'mensagens_fluxo',
        chave: 'c7_local_invalida',
        rotulo: 'mensagens_fluxo.c7_local_invalida',
        texto: 'Confirme cidade e estado antes de escalar.',
        score: 0.91,
        termos: [],
        motivo: 'busca vetorial score 0.910',
        origemBusca: 'vetorial',
      },
    ],
    [
      {
        alvo: 'mensagens_fluxo',
        chave: 'c7_local_invalida',
        rotulo: 'mensagens_fluxo.c7_local_invalida',
        texto: 'Confirme cidade e estado antes de escalar.',
        score: 12,
        termos: ['cidade', 'estado'],
        motivo: 'coincide com cidade, estado',
        origemBusca: 'lexical',
      },
      {
        alvo: 'orquestracao_texto',
        chave: 'camadaHumana',
        rotulo: 'orquestracao_texto.camadaHumana',
        texto: 'Evite escalar cedo demais para humano.',
        score: 7,
        termos: ['escalar'],
        motivo: 'coincide com escalar',
        origemBusca: 'lexical',
      },
    ],
  );

  assert.equal(itens.length, 2);
  assert.equal(itens[0]?.origemBusca, 'vetorial');
  assert.equal(itens[0]?.chave, 'c7_local_invalida');
  assert.equal(itens[1]?.chave, 'camadaHumana');
});
