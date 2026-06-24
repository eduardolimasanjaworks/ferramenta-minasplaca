/**
 * Testes deterministicos para roteamento de instance -> servidor Evolution.
 * Garante que o oficial use o servidor externo correto sem quebrar o fallback
 * do auxiliar/local quando a instance nao estiver mapeada.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolverDestinoEvolutionPorInstancia } from './evolution-destino.js';

const alvos = [
  {
    nomeLogico: 'auxiliar_teste',
    url: 'http://local-evolution:8080',
    apiKey: 'local-key',
    instancia: 'gmx-atendimento-v2',
    origem: 'local_auxiliar',
  },
  {
    nomeLogico: 'oficial_gmx',
    url: 'https://evolution.117.sanjaworks.com',
    apiKey: 'oficial-key',
    instancia: 'gmx-chatwoot',
    origem: 'chatwoot_oficial',
  },
];

const fallback = {
  nomeLogico: null,
  url: 'http://local-evolution:8080',
  apiKey: 'fallback-key',
  instanciaPadrao: 'gmx-atendimento-v2',
  origem: 'local',
};

test('resolve o alvo oficial pela instance recebida', () => {
  const destino = resolverDestinoEvolutionPorInstancia('gmx-chatwoot', alvos, fallback);
  assert.deepEqual(destino, {
    nomeLogico: 'oficial_gmx',
    url: 'https://evolution.117.sanjaworks.com',
    apiKey: 'oficial-key',
    instancia: 'gmx-chatwoot',
    origem: 'chatwoot_oficial',
  });
});

test('resolve ignorando diferenca de maiusculas e espacos', () => {
  const destino = resolverDestinoEvolutionPorInstancia('  GMX-CHATWOOT  ', alvos, fallback);
  assert.equal(destino.url, 'https://evolution.117.sanjaworks.com');
  assert.equal(destino.apiKey, 'oficial-key');
});

test('mantem fallback local quando a instance nao estiver mapeada', () => {
  const destino = resolverDestinoEvolutionPorInstancia('instancia-desconhecida', alvos, fallback);
  assert.deepEqual(destino, {
    nomeLogico: null,
    url: 'http://local-evolution:8080',
    apiKey: 'fallback-key',
    instancia: 'instancia-desconhecida',
    origem: 'local',
  });
});
