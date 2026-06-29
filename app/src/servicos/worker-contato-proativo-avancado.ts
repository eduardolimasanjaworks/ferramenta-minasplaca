/**
 * Worker avançado de contato proativo com agendamento dinâmico
 */
import { config } from '../config.js';
import { pool } from './prompt.js';
import {
  listarConfigsMotoristas,
  obterHistoricoRespostas,
  agendarContatoMotorista,
  obterAgendaDia,
  atualizarStatusAgenda,
  type ConfigContatoProativoMotorista,
} from './contato-proativo-avancado.js';
import { directusListar } from './directus.js';
import { tentarEnviarResposta } from './enviar-resposta.js';
import { adicionarAoHistorico } from './historico.js';
import { marcarEnvioIa } from './envio-ia.js';
import { telefoneParaJid } from '../util/telefone.js';
import { obterConfigMensagensFluxo, interpolarMensagem } from './config-mensagens-fluxo.js';
import { logEvento } from '../util/log-eventos.js';

interface MotoristaBase {
  id: number;
  nome?: string | null;
  telefone?: string | null;
  cidade?: string | null;
  estado?: string | null;
  tipo_rota?: string | null;
}

interface DisponibilidadeAtual {
  id: number;
  motorista_id?: number | { id?: number } | null;
  localizacao_atual?: string | null;
  date_updated?: string | null;
  date_created?: string | null;
}

const CAPACIDADE_DIARIA = 333; // 1000 motoristas / 3 dias
const INTERVALO_ENTRE_CONTATOS_MS = 2 * 60 * 1000; // 2 minutos entre contatos

let emExecucao = false;

function normalizarMotoristaId(valor: DisponibilidadeAtual['motorista_id']): number | null {
  if (typeof valor === 'number') return valor;
  if (valor && typeof valor === 'object' && typeof valor.id === 'number') return valor.id;
  return null;
}

function horasDesde(iso?: string | null): number | null {
  if (!iso) return null;
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return null;
  return Math.max(0, (Date.now() - ts) / 36e5);
}

function dataDisponibilidade(disponibilidade?: DisponibilidadeAtual | null): string | null {
  return disponibilidade?.date_updated ?? disponibilidade?.date_created ?? null;
}

function dentroDaJanelaHoraria(config: ConfigContatoProativoMotorista): boolean {
  if (!config.horario_inicio || !config.horario_fim) return true;
  
  const agora = new Date();
  const horaAtual = agora.getHours();
  const minutosAtual = agora.getMinutes();
  const minutosAtualTotal = horaAtual * 60 + minutosAtual;
  
  const [inicioH, inicioM] = config.horario_inicio.split(':').map(Number);
  const [fimH, fimM] = config.horario_fim.split(':').map(Number);
  const inicioTotal = inicioH * 60 + inicioM;
  const fimTotal = fimH * 60 + fimM;
  
  return minutosAtualTotal >= inicioTotal && minutosAtualTotal <= fimTotal;
}

function diaDaSemanaPermitido(config: ConfigContatoProativoMotorista): boolean {
  if (!config.dias_semana || config.dias_semana.length === 0) return true;
  const diaSemana = new Date().getDay(); // 0 = domingo, 6 = sábado
  return config.dias_semana.includes(diaSemana);
}

function deveContatar(
  config: ConfigContatoProativoMotorista,
  historico: Array<{ data_contato: string; respondeu: boolean }>,
  disponibilidade?: DisponibilidadeAtual | null,
): boolean {
  if (!config.habilitado) return false;
  
  // Verificar janela horária
  if (!dentroDaJanelaHoraria(config)) return false;
  
  // Verificar dia da semana
  if (!diaDaSemanaPermitido(config)) return false;
  
  // Verificar condicional de resposta
  if (config.condicao_resposta) {
    const ultimoContato = historico[0];
    if (!ultimoContato || !ultimoContato.respondeu) return false;
  }
  
  // Verificar condicional de localização
  if (config.condicao_localizacao) {
    const horasSemPosicao = horasDesde(dataDisponibilidade(disponibilidade));
    if (horasSemPosicao === null || horasSemPosicao < 24) return false;
  }
  
  // Verificar frequência
  if (config.frequencia_horas) {
    const ultimoContato = historico[0];
    if (ultimoContato) {
      const horasDesdeUltimo = horasDesde(ultimoContato.data_contato);
      if (horasDesdeUltimo !== null && horasDesdeUltimo < config.frequencia_horas) return false;
    }
  }
  
  if (config.frequencia_dias) {
    const ultimoContato = historico[0];
    if (ultimoContato) {
      const diasDesdeUltimo = horasDesde(ultimoContato.data_contato);
      if (diasDesdeUltimo !== null && diasDesdeUltimo < config.frequencia_dias * 24) return false;
    }
  }
  
  // Verificar máximo de contatos por dia
  if (config.max_contatos_dia) {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const contatosHoje = historico.filter(h => new Date(h.data_contato) >= hoje).length;
    if (contatosHoje >= config.max_contatos_dia) return false;
  }
  
  return true;
}

async function carregarMotoristasBase(): Promise<Map<number, MotoristaBase>> {
  const rows = await directusListar<MotoristaBase>('cadastro_motorista', {
    limit: '2500',
    sort: '-date_created',
    fields: 'id,nome,sobrenome,telefone,cidade,estado,tipo_rota',
  });
  const map = new Map<number, MotoristaBase>();
  for (const row of rows) {
    map.set(row.id, row);
  }
  return map;
}

async function carregarDisponibilidadesBase(): Promise<Map<number, DisponibilidadeAtual>> {
  const rows = await directusListar<DisponibilidadeAtual>('disponivel', {
    limit: '5000',
    sort: '-date_updated,-date_created',
    fields: 'id,motorista_id,localizacao_atual,date_updated,date_created',
  });
  const map = new Map<number, DisponibilidadeAtual>();
  for (const row of rows) {
    const motoristaId = normalizarMotoristaId(row.motorista_id);
    if (!motoristaId || map.has(motoristaId)) continue;
    map.set(motoristaId, row);
  }
  return map;
}

async function calcularAgendaDoDia(): Promise<void> {
  const [configs, motoristas, disponibilidades] = await Promise.all([
    listarConfigsMotoristas({ habilitado: true }),
    carregarMotoristasBase(),
    carregarDisponibilidadesBase(),
  ]);
  
  const agendaDoDia = await obterAgendaDia(new Date());
  const jaAgendados = new Set(agendaDoDia.map(a => a.motorista_id));
  
  const candidatos: Array<{
    motoristaId: number;
    config: ConfigContatoProativoMotorista;
    prioridade: number;
  }> = [];
  
  for (const config of configs) {
    if (jaAgendados.has(config.motorista_id)) continue;
    
    const motorista = motoristas.get(config.motorista_id);
    if (!motorista || !motorista.telefone) continue;
    
    const disponibilidade = disponibilidades.get(config.motorista_id);
    const historico = await obterHistoricoRespostas(config.motorista_id, 10);
    
    if (!deveContatar(config, historico, disponibilidade)) continue;
    
    candidatos.push({
      motoristaId: config.motorista_id,
      config,
      prioridade: config.prioridade,
    });
  }
  
  // Ordenar por prioridade e limitar à capacidade diária
  candidatos.sort((a, b) => b.prioridade - a.prioridade);
  const selecionados = candidatos.slice(0, CAPACIDADE_DIARIA - agendaDoDia.length);
  
  // Distribuir ao longo do dia
  const agora = new Date();
  const inicioDia = new Date(agora);
  inicioDia.setHours(8, 0, 0, 0);
  const fimDia = new Date(agora);
  fimDia.setHours(18, 0, 0, 0);
  
  const janelaMs = fimDia.getTime() - inicioDia.getTime();
  const intervalo = janelaMs / (selecionados.length + 1);
  
  for (let i = 0; i < selecionados.length; i++) {
    const { motoristaId, config } = selecionados[i];
    const dataAgendada = new Date(inicioDia.getTime() + intervalo * (i + 1));
    
    await agendarContatoMotorista(
      motoristaId,
      dataAgendada,
      config.mensagem_custom ?? undefined,
      config.prioridade,
    );
  }
  
  logEvento('contato_proativo_avancado', 'Agenda do dia calculada', {
    total_agendado: selecionados.length,
    ja_existente: agendaDoDia.length,
    capacidade: CAPACIDADE_DIARIA,
  });
}

async function processarAgendaPendente(): Promise<void> {
  const agora = new Date();
  const agenda = await obterAgendaDia(agora);
  
  const pendentes = agenda.filter(a => {
    const dataAgendada = new Date(a.data_agendada);
    return dataAgendada <= agora;
  });
  
  for (const item of pendentes) {
    try {
      const configMotorista = await obterConfigMotorista(item.motorista_id);
      if (!configMotorista || !configMotorista.habilitado) {
        await atualizarStatusAgenda(item.id, 'cancelado');
        continue;
      }
      
      const motoristas = await carregarMotoristasBase();
      const motorista = motoristas.get(item.motorista_id);
      if (!motorista || !motorista.telefone) {
        await atualizarStatusAgenda(item.id, 'falhou');
        continue;
      }
      
      const disponibilidades = await carregarDisponibilidadesBase();
      const disponibilidade = disponibilidades.get(item.motorista_id);
      
      const mensagens = await obterConfigMensagensFluxo();
      const texto = item.mensagem || interpolarMensagem(
        configMotorista.mensagem_custom ||
        (disponibilidade?.localizacao_atual
          ? mensagens.contato_proativo_localizacao_com_referencia || ''
          : mensagens.contato_proativo_localizacao_sem_referencia || ''),
        {
          localizacao_atual: disponibilidade?.localizacao_atual ?? '',
          nome: motorista.nome || '',
          cidade: motorista.cidade ?? '',
          estado: motorista.estado ?? '',
          operacao: motorista.tipo_rota ?? '',
        },
      );
      
      const remoteJid = telefoneParaJid(motorista.telefone);
      const envio = await tentarEnviarResposta(motorista.telefone, texto, config.evolutionInstance, {
        remoteJid,
        mensagensEntrada: 0,
        origem: 'evolution',
        fragmentar: false,
        agendarAtrasoInicial: false,
      });
      
      if (envio.enviado) {
        await marcarEnvioIa(motorista.telefone, 8);
        await adicionarAoHistorico(remoteJid, 'empresa', texto);
        await atualizarStatusAgenda(item.id, 'enviado');
        
        // Registrar no histórico
        await pool.query(
          `INSERT INTO contato_proativo_historico_resposta (motorista_id, data_contato, respondeu)
           VALUES ($1, NOW(), false)`,
          [item.motorista_id],
        );
        
        logEvento('contato_proativo_avancado', 'Contato enviado', {
          motorista_id: item.motorista_id,
          telefone: motorista.telefone,
        });
      } else {
        await atualizarStatusAgenda(item.id, 'falhou');
      }
      
      // Aguardar entre contatos
      await new Promise(resolve => setTimeout(resolve, INTERVALO_ENTRE_CONTATOS_MS));
    } catch (error) {
      console.error('[worker-contato-proativo-avancado] Erro ao processar item:', error);
      await atualizarStatusAgenda(item.id, 'falhou');
    }
  }
}

export async function obterConfigMotorista(motoristaId: number): Promise<ConfigContatoProativoMotorista | null> {
  const res = await pool.query<ConfigContatoProativoMotorista>(
    'SELECT * FROM contato_proativo_config_motorista WHERE motorista_id = $1',
    [motoristaId],
  );
  return res.rows[0] || null;
}

export function iniciarWorkerContatoProativoAvancado(): void {
  const intervaloCalculo = 60 * 60 * 1000; // Recalcular agenda a cada hora
  const intervaloProcessamento = 5 * 60 * 1000; // Processar agenda a cada 5 minutos
  
  console.log('[worker-contato-proativo-avancado] Iniciando worker avançado');
  console.log(`[worker-contato-proativo-avancado] Capacidade diária: ${CAPACIDADE_DIARIA} contatos`);
  console.log(`[worker-contato-proativo-avancado] Intervalo cálculo: ${intervaloCalculo / 60000}min`);
  console.log(`[worker-contato-proativo-avancado] Intervalo processamento: ${intervaloProcessamento / 60000}min`);
  
  // Calcular agenda inicial
  setTimeout(() => {
    void calcularAgendaDoDia();
  }, 30_000);
  
  // Recalcular agenda periodicamente
  setInterval(() => {
    if (!emExecucao) {
      emExecucao = true;
      calcularAgendaDoDia()
        .catch(err => console.error('[worker-contato-proativo-avancado] Erro no cálculo:', err))
        .finally(() => { emExecucao = false; });
    }
  }, intervaloCalculo);
  
  // Processar agenda periodicamente
  setInterval(() => {
    if (!emExecucao) {
      emExecucao = true;
      processarAgendaPendente()
        .catch(err => console.error('[worker-contato-proativo-avancado] Erro no processamento:', err))
        .finally(() => { emExecucao = false; });
    }
  }, intervaloProcessamento);
}
