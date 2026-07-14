/**
 * Sistema de Follow-up — Minas Placa.
 * Envia mensagens automáticas de acompanhamento após 30 minutos de silêncio do cliente.
 */
import pg from 'pg';
import { obterRedis } from './lib/redis.js';
import { config } from './config.js';
import { gerarRespostaAgente } from './agente-minasplaca.js';
import { tentarEnviarRespostaAtiva } from './lib/canal-whatsapp.js';
import { obterHistorico, adicionarAoHistorico } from './historico-minasplaca.js';
import { logEvento } from './util/log-eventos.js';
import { iaEstaPausada } from './pausa-minasplaca.js';
import { obterConfigFollowup } from './followup-config.js';

const redis = obterRedis();
const pool = new pg.Pool({ connectionString: config.databaseUrl });

const PREFIXO_TIMER = 'followup:timer:';
const PREFIXO_SENT = 'followup:sent:';

/**
 * Agenda um novo follow-up para o cliente e limpa o flag de follow-up enviado.
 */
export async function agendarFollowup(telefone: string): Promise<void> {
  const cfg = await obterConfigFollowup();
  if (!cfg.ativo) {
    // Follow-up desligado no painel — garante que nao ha timer pendente.
    await cancelarFollowup(telefone).catch(() => {});
    console.log(`[followup] desativado no painel — nao agendado para ${telefone}`);
    return;
  }

  const chaveTimer = `${PREFIXO_TIMER}${telefone}`;
  const chaveSent = `${PREFIXO_SENT}${telefone}`;
  const atrasoMs = cfg.minutos * 60000;
  const executaEm = Date.now() + atrasoMs;

  const pipeline = redis.pipeline();
  pipeline.set(chaveTimer, String(executaEm));
  pipeline.del(chaveSent);
  await pipeline.exec();
  console.log(`[followup] agendado para ${telefone} em timestamp ${executaEm} (daqui a ${cfg.minutos} min)`);
}

/**
 * Cancela/reseta os registros de follow-up para o cliente.
 */
export async function cancelarFollowup(telefone: string): Promise<void> {
  const chaveTimer = `${PREFIXO_TIMER}${telefone}`;
  const chaveSent = `${PREFIXO_SENT}${telefone}`;

  const pipeline = redis.pipeline();
  pipeline.del(chaveTimer);
  pipeline.del(chaveSent);
  await pipeline.exec();
  console.log(`[followup] cancelado/resetado para ${telefone}`);
}

/**
 * Processa a verificação e o disparo de follow-up para um cliente específico.
 */
export async function processarFollowup(telefone: string): Promise<void> {
  const chaveSent = `${PREFIXO_SENT}${telefone}`;

  const cfg = await obterConfigFollowup();
  if (!cfg.ativo) {
    console.log(`[followup] desativado no painel. Ignorando follow-up para ${telefone}.`);
    return;
  }

  if (await iaEstaPausada(telefone)) {
    console.log(`[followup] IA pausada para ${telefone}. Ignorando follow-up.`);
    return;
  }

  // 1. Verifica se já enviamos follow-up nessa janela de silêncio
  const jaEnviado = await redis.get(chaveSent);
  if (jaEnviado === '1') {
    console.log(`[followup] já enviado para ${telefone}. Ignorando.`);
    return;
  }

  // 2. Consulta o último registro do histórico no banco para verificar elegibilidade
  let row;
  try {
    const res = await pool.query(
      'SELECT role, content, timestamp FROM historico_conversa WHERE telefone = $1 ORDER BY timestamp DESC LIMIT 1',
      [telefone]
    );
    if (res.rowCount === 0) {
      console.log(`[followup] sem histórico para ${telefone}. Ignorando.`);
      return;
    }
    row = res.rows[0];
  } catch (err) {
    console.error(`[followup] erro ao buscar último histórico para ${telefone}:`, err);
    return;
  }

  const { role, content, timestamp } = row;
  const tsMensagem = new Date(timestamp).getTime();
  const agora = Date.now();

  // 3. Critérios de elegibilidade:
  // a) A última mensagem deve ser do assistente. Se for do usuário, significa que ele falou e o bot deve responder de forma normal.
  if (role !== 'assistant') {
    console.log(`[followup] última mensagem de ${telefone} foi do usuário. Ignorando follow-up.`);
    return;
  }

  // b) O tempo decorrido desde a última mensagem deve ser de pelo menos o configurado (com pequena tolerância de 5s)
  const atrasoMs = cfg.minutos * 60000;
  const tempoDecorrido = agora - tsMensagem;
  if (tempoDecorrido < atrasoMs - 5000) {
    console.log(`[followup] inatividade recente para ${telefone} (${tempoDecorrido}ms < ${atrasoMs}ms). Ignorando.`);
    return;
  }

  // c) Se o atendimento foi transferido para atendimento humano (handoff), não enviamos follow-up automático
  const transferido = /transferindo|transferir/i.test(content);
  if (transferido) {
    console.log(`[followup] atendimento de ${telefone} está em handoff humano. Ignorando follow-up.`);
    return;
  }

  // 4. Marca que enviamos o follow-up para evitar múltiplos disparos na mesma janela de silêncio
  await redis.set(chaveSent, '1', 'EX', 86400); // Expira em 24h

  try {
    console.log(`[followup] gerando mensagem de acompanhamento para ${telefone}...`);
    
    // Recupera o histórico das últimas 100 mensagens para a IA formular a resposta contextualizada
    const historico = await obterHistorico(telefone, 100);

    const mensagemInstrucao = `[SISTEMA: O cliente está em silêncio há ${cfg.minutos} minutos. Siga estritamente as regras de follow-up definidas pelo administrador abaixo. Se, ao avaliar o contexto, o follow-up NÃO fizer sentido, responda apenas com o texto EXATO "SEM_FOLLOWUP" e nada mais.\n\nREGRAS DE FOLLOW-UP:\n${cfg.instrucoes}]`;

    const resposta = await gerarRespostaAgente({
      telefone,
      mensagem: mensagemInstrucao,
      historico,
    });

    if (!resposta || resposta.includes('Desculpe, ocorreu um erro')) {
      console.warn(`[followup] agente gerou resposta inválida para ${telefone}: "${resposta}". Abortando envio.`);
      await redis.del(chaveSent);
      return;
    }

    // A IA pode decidir que o follow-up não faz sentido conforme as regras.
    if (/^\s*sem_followup\s*$/i.test(resposta) || /\bSEM_FOLLOWUP\b/.test(resposta)) {
      console.log(`[followup] IA avaliou que não cabe follow-up para ${telefone} (regras do painel).`);
      return;
    }

    // Salva a resposta no histórico de conversa
    await adicionarAoHistorico(telefone, [
      { role: 'assistant', content: resposta, timestamp: Date.now() },
    ]);

    console.log(`[followup] enviando resposta de follow-up para ${telefone}: ${resposta.slice(0, 80)}`);
    const resultado = await tentarEnviarRespostaAtiva(telefone, resposta, { fragmentar: true });
    console.log(`[followup] resultado envio para ${telefone}:`, resultado);

    logEvento('followup', 'Follow-up enviado com sucesso', { telefone, resposta }, 'info');
  } catch (err) {
    const motivo = err instanceof Error ? err.message : String(err);
    console.error(`[followup] erro ao processar follow-up para ${telefone}: ${motivo}`);
    logEvento('followup', 'Erro ao enviar follow-up', { telefone, motivo }, 'error');
    await redis.del(chaveSent);
  }
}

/**
 * Inicializa o worker em segundo plano para monitorar os timers de follow-up.
 */
export function iniciarWorkerFollowup(intervaloMs = 10000): void {
  console.log('[followup] worker iniciado');
  async function tick() {
    try {
      const chaves = await redis.keys(`${PREFIXO_TIMER}*`);
      const agora = Date.now();

      for (const chave of chaves) {
        const valor = await redis.get(chave);
        if (!valor) continue;

        const executaEm = Number(valor);
        if (agora >= executaEm) {
          const telefone = chave.replace(PREFIXO_TIMER, '');
          // Deleta a chave para garantir execução exclusiva
          const deletado = await redis.del(chave);
          if (deletado > 0) {
            await processarFollowup(telefone);
          }
        }
      }
    } catch (err) {
      console.error('[followup] erro no tick do worker de follow-up:', err);
    }
    setTimeout(tick, intervaloMs);
  }
  tick();
}
