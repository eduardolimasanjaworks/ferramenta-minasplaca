/**
 * Ponto de entrada — Minas Placa clean.
 */
import { config } from './config.js';
import { iniciarServidor } from './servidor.js';
import { inicializarBancoPrompt } from './prompt-minasplaca.js';
import { inicializarBancoHistorico } from './historico-minasplaca.js';
import { garantirColecaoConhecimento } from './rag-minasplaca.js';
import { iniciarWorkerDebounce } from './debounce-minasplaca.js';
import { obterRedis } from './lib/redis.js';
async function aguardarDependencias() {
    const redis = obterRedis();
    for (let i = 0; i < 40; i++) {
        try {
            await redis.ping();
            const { default: pg } = await import('pg');
            const pool = new pg.Pool({ connectionString: config.databaseUrl });
            await pool.query('SELECT 1');
            await pool.end();
            return;
        }
        catch {
            await new Promise((r) => setTimeout(r, 1000));
        }
    }
    throw new Error('Dependencias nao ficaram prontas a tempo');
}
async function main() {
    if (!config.openrouterToken) {
        console.error('[init] ERRO: configure OPENROUTER_TOKEN no .env');
        process.exit(1);
    }
    console.log('[init] Minas Placa clean build', config.buildId);
    await aguardarDependencias();
    await inicializarBancoPrompt();
    await inicializarBancoHistorico();
    await garantirColecaoConhecimento();
    console.log('[init] Banco e vetores prontos');
    iniciarWorkerDebounce();
    await iniciarServidor();
}
main().catch((err) => {
    console.error('[init] Falha fatal:', err);
    process.exit(1);
});
