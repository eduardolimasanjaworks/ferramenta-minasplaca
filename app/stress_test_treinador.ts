import { processarMensagemTreinamentoWhatsapp, criarTelefoneTreinador, inicializarTreinamentoWhatsapp, listarPendenciasAprendizadoWhatsapp } from './src/servicos/treinamento-whatsapp.js';
import pg from 'pg';
import { config } from './src/config.js';

const pool = new pg.Pool({ connectionString: config.databaseUrl });

async function runTests() {
  await inicializarTreinamentoWhatsapp();

  const telefone = '5511999999999';
  const remoteJid = '5511999999999@s.whatsapp.net';
  const pushName = 'QA Tester';

  // Make sure trainer phone exists
  try {
    await criarTelefoneTreinador({ telefone, nome: pushName, ativo: true });
  } catch (e: any) {
    if (!e.message.includes('duplicate key value')) {
      console.log('Phone creation error (ignore if already exists):', e.message);
    }
  }

  const findings: any[] = [];
  let testId = 1;

  async function testCase(name: string, input: string, setup?: () => Promise<void>) {
    console.log(`\n--- Test ${testId++}: ${name} ---`);
    if (setup) await setup();
    try {
      const res = await processarMensagemTreinamentoWhatsapp({ telefone, remoteJid, textoUsuario: input, pushName });
      console.log('Result:', res);
      findings.push({ name, input, status: 'Success', result: res });
    } catch (e: any) {
      console.log('Error thrown:', e.message);
      findings.push({ name, input, status: 'Error', result: e.message });
    }
  }

  // 1. Confirm non-existent proposal
  await testCase('Confirm non-existent proposal', 'Confirmar #9999');

  // 2. Cancel non-existent proposal
  await testCase('Cancel non-existent proposal', 'Cancelar #9999');

  // 3. Very large rule
  const largeRule = 'Aprenda: ' + 'a '.repeat(5000);
  await testCase('Very large rule', largeRule);

  // 4. SQL Injection attempt
  await testCase('SQL Injection in rule', "Aprenda: '; DROP TABLE whatsapp_aprendizados; --");

  // 5. Empty rule
  await testCase('Empty rule', 'Aprenda: ');

  // 6. Ambiguous command (mix of aprenda, confirmar, cancelar)
  await testCase('Ambiguous command', 'Aprenda que cancelar a proposta confirmar #1 é proibido');

  // 7. Requesting patch without specifying exactly what
  await testCase('Vague patch request', 'substitua coisas');

  // 8. Confirming patch without number when no pending patch exists
  await testCase('Confirm patch without ID (none pending)', 'Confirmar patch');

  // 9. Double confirmation
  let proposalIdToConfirm = 0;
  await testCase('Create proposal for double confirm', 'Aprenda: O ceu é azul');
  // find the proposal id
  const pendencias = await listarPendenciasAprendizadoWhatsapp();
  if (pendencias.length > 0) {
    proposalIdToConfirm = pendencias[0].id;
    await testCase('First confirmation', `Confirmar #${proposalIdToConfirm}`);
    await testCase('Double confirmation', `Confirmar #${proposalIdToConfirm}`);
  }

  // 10. Weird characters in rule
  await testCase('Unicode/Emojis in rule', 'Aprenda: 👾 ¯\\_(ツ)_/¯ 💥💥💥');

  console.log('\n--- ALL FINDINGS ---');
  console.log(JSON.stringify(findings, null, 2));

  await pool.end();
  process.exit(0);
}

runTests().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
