import assert from 'node:assert/strict';

async function run() {
  const mod = await import('../app/dist/servicos/motor-negociacao.js');
  const { avaliarNegociacao, atualizarEstadoNegociacao } = mod;

  const faixa = {
    origem: 'Guarulhos SP',
    destino: 'Curitiba PR',
    valorOfertado: 4000,
    valorMinimo: 4000,
    valorMaximo: 5000,
    fonte: 'embarque',
  };

  let estado = { rodadas: 0, faixa, ultimoValorPedido: undefined, ultimaContraofertaIa: undefined };

  const a1 = avaliarNegociacao({ mensagem: 'só faço por 5 mil', faixa, estado });
  assert.equal(a1.tipo, 'contraproposta_ia');
  assert.ok(a1.valorProposto > 4000 && a1.valorProposto < 5000);
  estado = atualizarEstadoNegociacao(estado, a1, 'só faço por 5 mil');

  const a2 = avaliarNegociacao({ mensagem: 'não, 4800', faixa, estado });
  assert.equal(a2.tipo, 'contraproposta_ia');
  assert.ok(a2.valorProposto > (a1.valorProposto ?? 0));
  assert.ok(a2.valorProposto < 4800);
  estado = atualizarEstadoNegociacao(estado, a2, 'não, 4800');

  const a3 = avaliarNegociacao({ mensagem: 'fecho em 4800', faixa, estado });
  assert.equal(a3.tipo, 'aceite');
  assert.equal(a3.valorAceito, 4800);
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

