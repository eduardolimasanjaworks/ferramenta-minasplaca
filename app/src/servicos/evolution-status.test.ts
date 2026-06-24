/**
 * Testes deterministas para reconciliar estados inconsistentes da Evolution.
 * Garantem que o painel nao force QR quando a instancia ja aparece aberta.
 * Mantem a regra pequena, previsivel e sem dependencia externa.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolverStatusEvolution } from './evolution-status.js';

test('mantem open quando connectionState ja confirma conexao', () => {
  const resultado = resolverStatusEvolution({
    connectionState: 'open',
    fetchConnectionStatus: 'connecting',
  });

  assert.deepEqual(resultado, {
    state: 'open',
    conectado: true,
    fonte: 'connectionState',
  });
});

test('nao promove para open quando connectionState diverge e ha marcador de desconexao residual', () => {
  const resultado = resolverStatusEvolution({
    connectionState: 'connecting',
    fetchConnectionStatus: 'open',
    hasOwnerJid: true,
    fetchDisconnectionReasonCode: 401,
    hasDisconnectionObject: true,
  });

  assert.deepEqual(resultado, {
    state: 'stale_open',
    conectado: false,
    fonte: 'connectionState',
  });
});

test('mantem connecting quando fetchInstances nao confirma sessao utilizavel', () => {
  const resultado = resolverStatusEvolution({
    connectionState: 'connecting',
    fetchConnectionStatus: 'open',
    hasOwnerJid: false,
    hasProfileName: false,
  });

  assert.deepEqual(resultado, {
    state: 'connecting',
    conectado: false,
    fonte: 'connectionState',
  });
});

test('aceita fetchInstances como fallback apenas quando connectionState nao veio e nao ha desconexao residual', () => {
  const resultado = resolverStatusEvolution({
    connectionState: '',
    fetchConnectionStatus: 'open',
    hasOwnerJid: true,
    hasDisconnectionObject: false,
  });

  assert.deepEqual(resultado, {
    state: 'open',
    conectado: true,
    fonte: 'fetchInstances',
  });
});
