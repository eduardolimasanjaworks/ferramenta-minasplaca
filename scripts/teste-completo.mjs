#!/usr/bin/env node
/**
 * Smoke + unit tests leves para disparos proativos.
 * Uso: node scripts/teste-completo.mjs [--sem-llm]
 */
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appDist = join(__dirname, '../app/dist');

const BASE = process.env.TEST_BASE_URL || 'http://127.0.0.1:8095';
const semLlm = process.argv.includes('--sem-llm');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function testFiltros() {
  const filtros = await import(pathToFileURL(join(appDist, 'proativos-filtros.js')).href);
  const hoje = new Date(2026, 6, 9); // 9 jul 2026

  const contas = [
    { liquidado_rec: 'Nao', vencimento_rec: '2026-07-09', nome_conta: 'Teste', valor_rec: '100', id_conta_rec: 1, id_cliente: 1 },
    { liquidado_rec: 'Nao', vencimento_rec: '2026-07-12', nome_conta: 'Prev', valor_rec: '50', id_conta_rec: 2, id_cliente: 2 },
    { liquidado_rec: 'Sim', vencimento_rec: '2026-07-09', nome_conta: 'Pago', valor_rec: '10', id_conta_rec: 3 },
  ];
  const boleto = filtros.filtrarContasBoletoAVencer(contas, [0, 3], hoje);
  assert(boleto.length === 2, `boleto-a-vencer: esperado 2, got ${boleto.length}`);
  assert(boleto.some((c) => c.tipo_aviso === 'HOJE'), 'deve ter aviso HOJE');

  const vencidas = filtros.filtrarContasCobrancaVencidos(
    [{ liquidado_rec: 'Nao', vencimento_rec: '2026-07-08', nome_conta: 'Atraso1', valor_rec: '20', id_conta_rec: 4, id_cliente: 4 }],
    [1, 3, 5, 7],
    hoje,
  );
  assert(vencidas.length === 1 && vencidas[0].dias_atraso === 1, 'cobranca 1 dia atraso');

  const pedidos = filtros.filtrarPedidosRastreio([
    { status_pedido: 'Atendido', referencia_pedido: 'AA123456789BR', obs_interno_pedido: '', id_pedido: 99, id_cliente: 1 },
    { status_pedido: 'Atendido', referencia_pedido: 'RETIRA', obs_interno_pedido: '', id_pedido: 100 },
    { status_pedido: 'Atendido', referencia_pedido: 'BB987654321BR', obs_interno_pedido: '[RASTREIO_FINALIZADO]', id_pedido: 101 },
  ]);
  assert(pedidos.length === 1 && pedidos[0].rastreio_limpo === 'AA123456789BR', 'filtro rastreio');

  const entregas = filtros.filtrarEntregasPosVenda(
    [{ id: 1, id_pedido: 'P1', nome: 'A', telefone: '5531999999999', data_entrega: new Date(2026, 6, 7) }],
    2,
    hoje,
  );
  assert(entregas.length === 1, 'pos-venda 2 dias');

  console.log('[teste] filtros proativos OK');
}

async function testApi() {
  const res = await fetch(`${BASE}/api/ia/proativos`);
  const data = await res.json();
  assert(res.ok && data.ok, `GET proativos falhou: ${res.status}`);
  const slugs = (data.config?.abordagens || []).map((a) => a.slug);
  for (const s of ['boleto-a-vencer', 'envia-rastreamento', 'cobranca-vencidos', 'pesquisa-pos-venda']) {
    assert(slugs.includes(s), `slug ausente: ${s}`);
  }
  console.log('[teste] API proativos 4 jobs OK');

  const logsRes = await fetch(`${BASE}/api/ia/proativos/logs?limite=5`);
  const logsData = await logsRes.json();
  assert(logsRes.ok && logsData.ok, 'GET logs falhou');
  console.log('[teste] API logs OK');
}

async function main() {
  await testFiltros();
  try {
    await testApi();
  } catch (err) {
    if (semLlm) {
      console.warn('[teste] API indisponível (app parado?):', err.message);
    } else {
      throw err;
    }
  }
  console.log('[teste] completo — proativos OK');
}

main().catch((err) => {
  console.error('[teste] FALHA:', err.message);
  process.exit(1);
});
