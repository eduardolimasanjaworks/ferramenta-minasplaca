/**
 * Testa o warm-up pos-boot sem depender de rede, Qdrant ou tempo real.
 * Garante que o boot nao bloqueia e que o estado fica observavel no health.
 * Mantem o comportamento previsivel para deploy e reinicio do app.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  agendarWarmupPosBoot,
  obterStatusWarmupPosBoot,
  resetWarmupPosBootParaTeste,
} from './warmup-pos-boot.js';

test('agenda e conclui o warm-up com transicao de estado', async () => {
  resetWarmupPosBootParaTeste();
  let executou = false;

  const promessa = agendarWarmupPosBoot(async () => {
    executou = true;
  }, 0);

  assert.equal(obterStatusWarmupPosBoot().status, 'scheduled');
  await promessa;

  const status = obterStatusWarmupPosBoot();
  assert.equal(executou, true);
  assert.equal(status.status, 'done');
  assert.ok(status.iniciadoEm);
  assert.ok(status.finalizadoEm);
});

test('nao agenda duas execucoes paralelas para o mesmo boot', async () => {
  resetWarmupPosBootParaTeste();
  let execucoes = 0;

  const job = async () => {
    execucoes += 1;
  };

  const a = agendarWarmupPosBoot(job, 0);
  const b = agendarWarmupPosBoot(job, 0);
  await Promise.all([a, b]);

  assert.equal(execucoes, 1);
  assert.equal(obterStatusWarmupPosBoot().status, 'done');
});
