/**
 * Ponto de entrada da aplicação IA GMX.
 */
import { config } from './config.js';
import { iniciarServidor } from './servidor.js';
import { inicializarBanco, sincronizarVetores } from './servicos/prompt.js';
import { iniciarWorkerDebounce } from './servicos/debounce.js';
import { iniciarWorkerFilaRespostas } from './servicos/fila-respostas-worker.js';
import { inicializarProvedor } from './servicos/openai.js';
import { validarTokens } from './servicos/tokens.js';
import { inicializarColecao } from './servicos/qdrant.js';
import { inicializarColecaoLinguagem } from './servicos/qdrant-linguagem.js';
import { garantirApoioIntencaoIndexado } from './servicos/seed-apoio-intencao.js';
import { iniciarWorkerReconciliacaoDisponibilidade } from './servicos/worker-reconciliacao-disponibilidade.js';

async function main(): Promise<void> {
  if (!config.anthropicToken && !config.openaiToken && !config.groqToken) {
    console.error(
      '[init] ERRO: configure claudetoken (recomendado) e/ou openaitoken/groqtoken no .env',
    );
    process.exit(1);
  }
  if (!config.openaiToken) {
    console.warn(
      '[init] AVISO: sem openaitoken — embeddings (Qdrant) e áudio (Whisper) não funcionarão',
    );
  }

  console.log('[init] IAGMX build pipeline-visivel 2026-06-15c');
  await aguardarDependencias();

  await inicializarBanco();
  console.log('[init] Banco Postgres inicializado');

  await inicializarColecao();
  await inicializarColecaoLinguagem();
  await garantirApoioIntencaoIndexado();
  await sincronizarVetores();
  console.log('[init] Qdrant inicializado');

  const tokens = await validarTokens();
  console.log(
    `[init] Tokens — Claude: ${tokens.claude}, OpenAI: ${tokens.openai}, Groq: ${tokens.groq}, chat: ${tokens.provedorAtivo}`,
  );

  if (tokens.provedorAtivo === 'nenhum') {
    console.warn('[init] AVISO: Nenhum provedor LLM válido. Respostas não funcionarão.');
  }

  await inicializarProvedor();
  iniciarWorkerDebounce();
  iniciarWorkerFilaRespostas();
  iniciarWorkerReconciliacaoDisponibilidade();
  await iniciarServidor();
}

async function aguardarDependencias(): Promise<void> {
  const { verificarPostgres } = await import('./servicos/prompt.js');
  const { verificarRedis } = await import('./servicos/debounce.js');
  const { verificarQdrant } = await import('./servicos/qdrant.js');

  for (let i = 0; i < 40; i++) {
    const [pg, rd, qd] = await Promise.all([
      verificarPostgres(),
      verificarRedis(),
      verificarQdrant(),
    ]);
    if (pg && rd && qd) return;
    console.log(`[init] Aguardando Postgres/Redis/Qdrant... ${i + 1}/40`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('Timeout aguardando dependências');
}

main().catch((err) => {
  console.error('[init] Falha fatal:', err);
  process.exit(1);
});
