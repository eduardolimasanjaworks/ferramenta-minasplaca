/**
 * Ponto de entrada — Minas Placa clean.
 */
import { config } from './config.js';
import { iniciarServidor } from './servidor.js';
import { inicializarBancoPrompt } from './prompt-minasplaca.js';
import { inicializarBancoHistorico } from './historico-minasplaca.js';
import { garantirColecaoConhecimento } from './rag-minasplaca.js';
import { iniciarWorkerDebounce } from './debounce-minasplaca.js';
import { iniciarWorkerFollowup } from './followup-minasplaca.js';
import { obterRedis } from './lib/redis.js';
import { inicializarBancoEstado } from './estado-minasplaca.js';
import { inicializarBancoPausa } from './pausa-minasplaca.js';
import { inicializarBancoNotificacao } from './notificacao-minasplaca.js';
import { inicializarBancoFollowup } from './followup-config.js';
import { inicializarBancoDelay } from './delay-config.js';
import { inicializarCredenciais } from './auth-store.js';
import { inicializarBancoUsuarios } from './usuarios-store.js';
import { inicializarBancoProativos } from './proativos-config.js';
import { inicializarTabelasProativos } from './proativos-store.js';
import { iniciarWorkerProativos } from './proativos-minasplaca.js';
import { inicializarBancoPrecos } from './precos-produtos-store.js';
import { inicializarBancoCrm } from './crm-store.js';

async function aguardarDependencias(): Promise<void> {
  const redis = obterRedis();
  for (let i = 0; i < 40; i++) {
    try {
      await redis.ping();
      const { default: pg } = await import('pg');
      const pool = new pg.Pool({ connectionString: config.databaseUrl });
      await pool.query('SELECT 1');
      await pool.end();
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error('Dependencias nao ficaram prontas a tempo');
}

async function main(): Promise<void> {
  if (!config.openrouterToken) {
    console.error('[init] ERRO: configure OPENROUTER_TOKEN no .env');
    process.exit(1);
  }

  console.log('[init] Minas Placa clean build', config.buildId);
  await aguardarDependencias();

  await inicializarBancoPrompt();
  await inicializarBancoHistorico();
  await inicializarBancoEstado();
  await inicializarBancoPausa();
  await inicializarBancoNotificacao();
  await inicializarBancoFollowup();
  await inicializarBancoDelay();
  await inicializarCredenciais();
  await inicializarBancoUsuarios();
  await inicializarBancoProativos();
  await inicializarTabelasProativos();
  await inicializarBancoPrecos();
  await inicializarBancoCrm();
  await garantirColecaoConhecimento();
  console.log('[init] Banco e vetores prontos');

  iniciarWorkerDebounce();
  iniciarWorkerFollowup();
  iniciarWorkerProativos(60_000);
  await iniciarServidor();

  // Sync Chatwoot → CRM em background (não atrasa o boot)
  setTimeout(() => {
    import('./crm-chatwoot-sync.js')
      .then((m) => m.sincronizarTodosContatosChatwoot())
      .catch((err) => console.error('[init] sync CRM Chatwoot falhou:', err));
  }, 4_000);
}

main().catch((err) => {
  console.error('[init] Falha fatal:', err);
  process.exit(1);
});
