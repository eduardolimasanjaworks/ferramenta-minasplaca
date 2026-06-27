/**
 * Testa o nucleo puro de aplicacao dos patches do treinador.
 * Garante troca de trecho e reforco por append sem depender do banco.
 * Mantem a parte deterministica coberta antes do runtime completo.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { aplicarTextoPatchParaTeste } from './treinamento-config-alvos.js';

test('substitui um trecho existente no alvo', () => {
  const antes = 'Linha A\nLinha B\nLinha C';
  const depois = aplicarTextoPatchParaTeste(antes, {
    alvo: 'prompt_sistema',
    operacao: 'replace',
    trechoAtual: 'Linha B',
    textoProposto: 'Linha B corrigida',
  });
  assert.equal(depois, 'Linha A\nLinha B corrigida\nLinha C');
});

test('faz append de redundancia no fim do alvo', () => {
  const antes = 'Cidade e estado sao obrigatorios.';
  const depois = aplicarTextoPatchParaTeste(antes, {
    alvo: 'mensagens_fluxo',
    chave: 'c7_local_invalida',
    operacao: 'append',
    textoProposto: 'Repita cidade + UF antes de escalar.',
  });
  assert.equal(
    depois,
    'Cidade e estado sao obrigatorios.\n\nRepita cidade + UF antes de escalar.',
  );
});
