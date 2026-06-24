/**
 * Cenário 7 — disponibilidade (vazio/carregado) em código, sem LLM no fluxo feliz.
 */
import { extrairLocalizacaoTexto } from './ferramentas-contexto.js';
import { serializarBlocoFerramenta } from './ferramentas.js';
import { obterDataHoraBrasilia } from '../util/horario-brasilia.js';
import { limparEstadoFluxo, obterEstadoFluxo, salvarEstadoFluxo } from './estado-fluxo-redis.js';
import type { ItemDebounce } from '../tipos/evolution.js';
import { extrairGpsDosItens, resolverCidadePorGps } from '../util/gps-localizacao.js';
import { obterConfigMensagensFluxo } from './config-mensagens-fluxo.js';

const GMX_PROATIVA =
  /atualizando nossa base de parceiros|confirma[cç][aã]o r[aá]pida|verifica[cç][aã]o de status|como voc[eê] est[aá] agora.*dispon[ií]vel.*onde est[aá]/i;

export interface ResultadoFluxoDisponibilidade {
  textoComFerramentas: string;
  visivel: string;
  passo: string;
  fragmentar: false;
}

interface EstadoC7 {
  passo:
    | 'status'
    | 'vazio_local'
    | 'indisponivel_local_atual'
    | 'indisponivel_data'
    | 'indisponivel_local_disponibilidade'
    | 'carregado_local_atual'
    | 'carregado_destino_atual'
    | 'carregado_data'
    | 'carregado_local_disponibilidade';
  localizacaoAtual?: string;
  localDestinoAtual?: string;
  dataPrevisaoDisponibilidade?: string;
  latitudeAtual?: number;
  longitudeAtual?: number;
}

type ContextoC7 =
  | { tipo: 'entrada' }
  | { tipo: 'aguardando_status' }
  | { tipo: 'vazio_localizacao' }
  | { tipo: 'indisponivel_local_atual' }
  | {
      tipo: 'indisponivel_data';
      localizacaoAtual: string;
      latitudeAtual?: number;
      longitudeAtual?: number;
    }
  | {
      tipo: 'indisponivel_local_disponibilidade';
      localizacaoAtual: string;
      dataPrevisaoDisponibilidade: string;
      latitudeAtual?: number;
      longitudeAtual?: number;
    }
  | { tipo: 'carregado_local_atual' }
  | {
      tipo: 'carregado_destino_atual';
      localizacaoAtual: string;
      latitudeAtual?: number;
      longitudeAtual?: number;
    }
  | {
      tipo: 'carregado_data';
      localizacaoAtual: string;
      localDestinoAtual: string;
      latitudeAtual?: number;
      longitudeAtual?: number;
    }
  | {
      tipo: 'carregado_local_disponibilidade';
      localizacaoAtual: string;
      localDestinoAtual: string;
      dataPrevisaoDisponibilidade: string;
      latitudeAtual?: number;
      longitudeAtual?: number;
    };

const ESTADOS_BRASIL = [
  'acre',
  'alagoas',
  'amapa',
  'amazonas',
  'bahia',
  'ceara',
  'distrito federal',
  'espirito santo',
  'goias',
  'maranhao',
  'mato grosso',
  'mato grosso do sul',
  'minas gerais',
  'para',
  'paraiba',
  'parana',
  'pernambuco',
  'piaui',
  'rio de janeiro',
  'rio grande do norte',
  'rio grande do sul',
  'rondonia',
  'roraima',
  'santa catarina',
  'sao paulo',
  'sergipe',
  'tocantins',
] as const;

function normalizar(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function formatarEstado(valor: string): string {
  return valor
    .split(' ')
    .map((parte) => parte.charAt(0).toUpperCase() + parte.slice(1))
    .join(' ');
}

function extrairEstadoSemCidade(mensagem: string): string | null {
  const t = normalizar(mensagem)
    .replace(/[.,!?]/g, ' ')
    .replace(/\s+/g, ' ');
  if (extrairLocalizacaoTexto(mensagem)) return null;
  return ESTADOS_BRASIL.find((estado) => new RegExp(`\\b${estado}\\b`, 'i').test(t)) ?? null;
}

function repromptCidadeNoEstado(estado: string, contexto: 'atual' | 'destino' | 'disponibilidade'): string {
  const nome = formatarEstado(estado);
  if (contexto === 'atual') {
    return `Preciso da cidade em ${nome} onde voce esta agora, parceiro`;
  }
  if (contexto === 'destino') {
    return `Preciso da cidade em ${nome} do destino dessa viagem, parceiro`;
  }
  return `Preciso da cidade em ${nome} onde voce vai ficar disponivel para carregar, parceiro`;
}

function ultimaAssistant(historico: Array<{ role: string; content: string }>): string {
  return [...historico].reverse().find((h) => h.role === 'assistant')?.content ?? '';
}

function fluxoJaConcluido(ultimaAssist: string): boolean {
  return /dados atualizados.*boa viagem|boa viagem.*dados atualizados/i.test(ultimaAssist);
}

function perguntouStatus(texto: string): boolean {
  return (
    /vazio ou.*carregado|carregado ou.*vazio/i.test(texto) ||
    /verifica[cç][aã]o de status|como voc[eê] est[aá] agora.*dispon[ií]vel.*onde est[aá]/i.test(texto)
  );
}

function perguntouLocalizacao(texto: string): boolean {
  return /localiza[cç][aã]o|cidade e estado|manda sua localiza/i.test(texto);
}

function perguntouLocalAtualCarregado(texto: string): boolean {
  return /localiza[cç][aã]o atual agora|onde voc[eê] est[aá] agora/i.test(texto);
}

function perguntouDestinoAtualCarregado(texto: string): boolean {
  return /destino da viagem atual|destino .*est[aá] levando agora/i.test(texto);
}

function perguntouData(texto: string): boolean {
  return /liberado para carregar/i.test(texto);
}

function perguntouLocalDisponibilidade(texto: string): boolean {
  return /onde .*vai estar dispon[ií]vel|qual cidade.*vai estar dispon[ií]vel/i.test(texto);
}

function ehAckProativo(mensagem: string): boolean {
  const t = normalizar(mensagem);
  return /^(sim|ok|pode|pode sim|pode ser|manda|manda ver|blz|beleza|pode mandar)[\s!.]*$/.test(t);
}

function ehRespostaAmbiguaStatus(mensagem: string): boolean {
  const t = normalizar(mensagem);
  return /^(sim|ok|t[oô]|t[aá]|pode|beleza|blz|aham)[\s!.]*$/.test(t);
}

function ehVazio(mensagem: string): boolean {
  const t = normalizar(mensagem);
  return (
    /\b(vazio|livre|dispon[ií]vel|to\s+vazio|t[oô]\s+vazio|t[oô]\s+livre)\b/.test(t) &&
    !/\bcarregad/.test(t) &&
    !ehIndisponivel(mensagem)
  );
}

function ehCarregado(mensagem: string): boolean {
  const t = normalizar(mensagem);
  return /\b(carregad|em viagem|to\s+cheio|to\s+carregado|t[oô]\s+carregad|cheio)\b/.test(t);
}

function ehIndisponivel(mensagem: string): boolean {
  const t = normalizar(mensagem);
  return (
    /\b(indispon[ií]vel|sem disponibilidade)\b/.test(t) ||
    /n[aã]o.+dispon[ií]vel/.test(t)
  );
}

function localizacaoVaga(mensagem: string): boolean {
  const t = normalizar(mensagem);
  return (
    /perto do posto|na rodovia|em casa|chegando|aqui na|por aqui|no ped[aá]gio/.test(t) &&
    !extrairLocalizacaoTexto(mensagem)
  );
}

function dataVaga(mensagem: string): boolean {
  const t = normalizar(mensagem);
  return /^(logo|n[aã]o sei|depende|talvez|mais tarde)[\s!.]*$/.test(t) || /^n[aã]o\s+sei/.test(t);
}

const DIAS_SEMANA: Record<string, number> = {
  domingo: 0,
  segunda: 1,
  'segunda-feira': 1,
  terca: 2,
  terça: 2,
  'terca-feira': 2,
  'terça-feira': 2,
  quarta: 3,
  'quarta-feira': 3,
  quinta: 4,
  'quinta-feira': 4,
  sexta: 5,
  'sexta-feira': 5,
  sabado: 6,
  sábado: 6,
  'sabado-feira': 6,
};

/** Converte texto do motorista em data ISO (Brasília), hora padrão 08:00. */
export function parseDataLiberacao(mensagem: string, agora = obterDataHoraBrasilia()): string | null {
  const t = normalizar(mensagem);

  if (dataVaga(mensagem)) return null;

  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const hojeParts = fmt.formatToParts(agora);
  const y = Number(hojeParts.find((p) => p.type === 'year')?.value);
  const m = Number(hojeParts.find((p) => p.type === 'month')?.value);
  const d = Number(hojeParts.find((p) => p.type === 'day')?.value);
  const base = new Date(y, m - 1, d);

  if (/\bhoje\b/.test(t)) {
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')} 08:00:00`;
  }
  if (/\bamanh[aã]\b/.test(t)) {
    const amanha = new Date(base);
    amanha.setDate(amanha.getDate() + 1);
    return `${amanha.getFullYear()}-${String(amanha.getMonth() + 1).padStart(2, '0')}-${String(amanha.getDate()).padStart(2, '0')} 08:00:00`;
  }

  for (const [nome, diaSemana] of Object.entries(DIAS_SEMANA)) {
    if (t.includes(nome)) {
      const alvo = new Date(base);
      const atualDow = alvo.getDay();
      let delta = diaSemana - atualDow;
      if (delta <= 0) delta += 7;
      if (/\bque\s+vem\b/.test(t)) delta += 7;
      alvo.setDate(alvo.getDate() + delta);
      return `${alvo.getFullYear()}-${String(alvo.getMonth() + 1).padStart(2, '0')}-${String(alvo.getDate()).padStart(2, '0')} 08:00:00`;
    }
  }

  const dm = t.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
  if (dm) {
    const dia = parseInt(dm[1], 10);
    const mes = parseInt(dm[2], 10);
    let ano = dm[3] ? parseInt(dm[3], 10) : y;
    if (ano < 100) ano += 2000;
    if (dia >= 1 && dia <= 31 && mes >= 1 && mes <= 12) {
      return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')} 08:00:00`;
    }
  }

  const diaSolto = t.match(/\bdia\s+(\d{1,2})\b/);
  if (diaSolto) {
    const dia = parseInt(diaSolto[1], 10);
    if (dia >= 1 && dia <= 31) {
      const alvo = new Date(base);
      alvo.setDate(dia);
      if (alvo < base) {
        alvo.setMonth(alvo.getMonth() + 1);
        alvo.setDate(dia);
      }
      return `${alvo.getFullYear()}-${String(alvo.getMonth() + 1).padStart(2, '0')}-${String(alvo.getDate()).padStart(2, '0')} 08:00:00`;
    }
  }

  if (/\b(libero|libera|sai[uo]|dispon[ií]vel)\b/.test(t) && t.length > 8) {
    for (const [nome, diaSemana] of Object.entries(DIAS_SEMANA)) {
      if (t.includes(nome)) {
        const alvo = new Date(base);
        const delta = ((diaSemana - alvo.getDay() + 7) % 7) || 7;
        alvo.setDate(alvo.getDate() + delta);
        return `${alvo.getFullYear()}-${String(alvo.getMonth() + 1).padStart(2, '0')}-${String(alvo.getDate()).padStart(2, '0')} 08:00:00`;
      }
    }
  }

  return null;
}

function inferirContexto(
  historico: Array<{ role: string; content: string }>,
  ultimaAssist: string,
  mensagem: string,
): ContextoC7 | null {
  if (fluxoJaConcluido(ultimaAssist)) return null;

  if (perguntouLocalDisponibilidade(ultimaAssist)) {
    const localizacaoAtual = extrairLocalAtualDoHistorico(historico) ?? '';
    const localDestinoAtual = extrairDestinoAtualDoHistorico(historico) ?? '';
    const dataPrevisaoDisponibilidade = extrairDataDoHistorico(historico) ?? '';
    return historicoTemStatusIndisponivel(historico)
      ? {
          tipo: 'indisponivel_local_disponibilidade',
          localizacaoAtual,
          dataPrevisaoDisponibilidade,
        }
      : {
          tipo: 'carregado_local_disponibilidade',
          localizacaoAtual,
          localDestinoAtual,
          dataPrevisaoDisponibilidade,
        };
  }

  if (perguntouData(ultimaAssist)) {
    const localizacaoAtual = extrairLocalAtualDoHistorico(historico) ?? '';
    if (/vai estar dispon[ií]vel|qual cidade.*vai estar dispon[ií]vel/i.test(ultimaAssist)) {
      return {
        tipo: 'indisponivel_local_disponibilidade',
        localizacaoAtual,
        dataPrevisaoDisponibilidade: extrairDataDoHistorico(historico) ?? '',
      };
    }
    const usuarioFalouIndisponivel = historicoTemStatusIndisponivel(historico);
    return usuarioFalouIndisponivel
      ? { tipo: 'indisponivel_data', localizacaoAtual }
      : {
          tipo: 'carregado_data',
          localizacaoAtual,
          localDestinoAtual: extrairDestinoAtualDoHistorico(historico) ?? '',
        };
  }

  if (perguntouDestinoAtualCarregado(ultimaAssist)) {
    return {
      tipo: 'carregado_destino_atual',
      localizacaoAtual: extrairLocalAtualDoHistorico(historico) ?? '',
    };
  }

  if (perguntouLocalAtualCarregado(ultimaAssist)) return { tipo: 'carregado_local_atual' };

  if (perguntouLocalizacao(ultimaAssist)) return { tipo: 'vazio_localizacao' };

  if (perguntouStatus(ultimaAssist)) return { tipo: 'aguardando_status' };

  if (GMX_PROATIVA.test(ultimaAssist) && ehAckProativo(mensagem)) return { tipo: 'entrada' };

  const assistentes = historico.filter((h) => h.role === 'assistant');
  const ultimaProativa = [...assistentes].reverse().find((h) => GMX_PROATIVA.test(h.content));
  if (ultimaProativa) {
    const idx = historico.lastIndexOf(ultimaProativa);
    const depois = historico.slice(idx + 1);
    const perguntouDepois = depois.some(
      (h) => h.role === 'assistant' && perguntouStatus(h.content),
    );
    if (!perguntouDepois && ehAckProativo(mensagem)) return { tipo: 'entrada' };
  }

  return null;
}

function extrairLocalAtualDoHistorico(
  historico: Array<{ role: string; content: string }>,
): string | null {
  for (const h of [...historico].reverse()) {
    if (h.role !== 'user') continue;
    const loc = extrairLocalizacaoTexto(h.content);
    if (loc) return loc;
  }
  return null;
}

function extrairDestinoAtualDoHistorico(
  historico: Array<{ role: string; content: string }>,
): string | null {
  for (let i = historico.length - 1; i >= 0; i--) {
    const atual = historico[i];
    const anterior = historico[i - 1];
    if (
      atual?.role === 'user' &&
      anterior?.role === 'assistant' &&
      perguntouDestinoAtualCarregado(anterior.content)
    ) {
      return extrairLocalizacaoTexto(atual.content);
    }
  }
  return null;
}

async function resolverLocalizacaoComGps(
  mensagem: string,
  itens: ItemDebounce[],
): Promise<{ localizacao: string; latitude?: number; longitude?: number } | null> {
  const coords = extrairGpsDosItens(mensagem, itens);
  if (coords) {
    const resolvido = await resolverCidadePorGps(coords);
    if (resolvido) {
      return {
        localizacao: resolvido.localizacao,
        latitude: resolvido.latitude,
        longitude: resolvido.longitude,
      };
    }
  }

  const localizacao = extrairLocalizacaoTexto(mensagem);
  if (!localizacao) return null;
  return { localizacao };
}

function extrairDataDoHistorico(historico: Array<{ role: string; content: string }>): string | null {
  for (const h of [...historico].reverse()) {
    if (h.role !== 'user') continue;
    const data = parseDataLiberacao(h.content);
    if (data) return data;
  }
  return null;
}

function historicoTemStatusIndisponivel(historico: Array<{ role: string; content: string }>): boolean {
  return [...historico].reverse().some((h) => h.role === 'user' && ehIndisponivel(h.content));
}

function montarResultado(
  visivel: string,
  ferramenta?: { ferramenta: string; dados: Record<string, unknown> },
  passo = 'ok',
): ResultadoFluxoDisponibilidade {
  const json = ferramenta ? serializarBlocoFerramenta(ferramenta.ferramenta, ferramenta.dados) : '';
  return {
    visivel,
    textoComFerramentas: json ? `${visivel}\n${json}` : visivel,
    passo,
    fragmentar: false,
  };
}

/**
 * Tenta responder pelo fluxo C7 (null = usar LLM).
 */
export async function tentarFluxoDisponibilidade(opts: {
  telefone: string;
  mensagem: string;
  historico: Array<{ role: string; content: string }>;
  itens?: ItemDebounce[];
}): Promise<ResultadoFluxoDisponibilidade | null> {
  const { telefone, mensagem, historico, itens = [] } = opts;
  const msgs = await obterConfigMensagensFluxo();
  const ultimaAssist = ultimaAssistant(historico);

  const estadoRedis = await obterEstadoFluxo<EstadoC7>(telefone);
  let contexto = inferirContexto(historico, ultimaAssist, mensagem);

  if (!contexto && estadoRedis) {
    if (estadoRedis.passo === 'vazio_local') contexto = { tipo: 'vazio_localizacao' };
    if (estadoRedis.passo === 'indisponivel_local_atual') contexto = { tipo: 'indisponivel_local_atual' };
    if (estadoRedis.passo === 'indisponivel_data' && estadoRedis.localizacaoAtual) {
      contexto = {
        tipo: 'indisponivel_data',
        localizacaoAtual: estadoRedis.localizacaoAtual,
        latitudeAtual: estadoRedis.latitudeAtual,
        longitudeAtual: estadoRedis.longitudeAtual,
      };
    }
    if (
      estadoRedis.passo === 'indisponivel_local_disponibilidade' &&
      estadoRedis.localizacaoAtual &&
      estadoRedis.dataPrevisaoDisponibilidade
    ) {
      contexto = {
        tipo: 'indisponivel_local_disponibilidade',
        localizacaoAtual: estadoRedis.localizacaoAtual,
        dataPrevisaoDisponibilidade: estadoRedis.dataPrevisaoDisponibilidade,
        latitudeAtual: estadoRedis.latitudeAtual,
        longitudeAtual: estadoRedis.longitudeAtual,
      };
    }
    if (estadoRedis.passo === 'carregado_local_atual') contexto = { tipo: 'carregado_local_atual' };
    if (estadoRedis.passo === 'carregado_destino_atual' && estadoRedis.localizacaoAtual) {
      contexto = {
        tipo: 'carregado_destino_atual',
        localizacaoAtual: estadoRedis.localizacaoAtual,
        latitudeAtual: estadoRedis.latitudeAtual,
        longitudeAtual: estadoRedis.longitudeAtual,
      };
    }
    if (estadoRedis.passo === 'carregado_data' && estadoRedis.localizacaoAtual) {
      contexto = {
        tipo: 'carregado_data',
        localizacaoAtual: estadoRedis.localizacaoAtual,
        localDestinoAtual: estadoRedis.localDestinoAtual ?? '',
        latitudeAtual: estadoRedis.latitudeAtual,
        longitudeAtual: estadoRedis.longitudeAtual,
      };
    }
    if (
      estadoRedis.passo === 'carregado_local_disponibilidade' &&
      estadoRedis.localizacaoAtual &&
      estadoRedis.dataPrevisaoDisponibilidade
    ) {
      contexto = {
        tipo: 'carregado_local_disponibilidade',
        localizacaoAtual: estadoRedis.localizacaoAtual,
        localDestinoAtual: estadoRedis.localDestinoAtual ?? '',
        dataPrevisaoDisponibilidade: estadoRedis.dataPrevisaoDisponibilidade,
        latitudeAtual: estadoRedis.latitudeAtual,
        longitudeAtual: estadoRedis.longitudeAtual,
      };
    }
    if (estadoRedis.passo === 'status') contexto = { tipo: 'aguardando_status' };
  }

  if (!contexto) return null;

  if (contexto.tipo === 'entrada') {
    await salvarEstadoFluxo(telefone, { passo: 'status' } satisfies EstadoC7);
    return montarResultado(msgs.c7_pergunta_status, undefined, 'pergunta_status');
  }

  if (contexto.tipo === 'aguardando_status') {
    if (
      ehRespostaAmbiguaStatus(mensagem) ||
      (!ehVazio(mensagem) && !ehCarregado(mensagem) && !ehIndisponivel(mensagem))
    ) {
      return montarResultado(msgs.c7_duvida_status, undefined, 'duvida_status');
    }
    if (ehVazio(mensagem)) {
      await salvarEstadoFluxo(telefone, { passo: 'vazio_local' } satisfies EstadoC7);
      return montarResultado(msgs.c7_pede_localizacao, undefined, 'pede_local');
    }
    if (ehIndisponivel(mensagem)) {
      const localAtual = await resolverLocalizacaoComGps(mensagem, itens);
      if (localAtual && !localizacaoVaga(mensagem)) {
        await salvarEstadoFluxo(
          telefone,
          {
            passo: 'indisponivel_data',
            localizacaoAtual: localAtual.localizacao,
            latitudeAtual: localAtual.latitude,
            longitudeAtual: localAtual.longitude,
          } satisfies EstadoC7,
        );
        return montarResultado(msgs.c7_pergunta_data, undefined, 'pede_data_indisponivel');
      }
      await salvarEstadoFluxo(telefone, { passo: 'indisponivel_local_atual' } satisfies EstadoC7);
      return montarResultado(msgs.c7_pede_localizacao, undefined, 'pede_local_indisponivel');
    }
    if (ehCarregado(mensagem)) {
      await salvarEstadoFluxo(telefone, { passo: 'carregado_local_atual' } satisfies EstadoC7);
      return montarResultado(msgs.c7_pergunta_local_atual_carregado, undefined, 'pede_local_atual');
    }
  }

  if (contexto.tipo === 'vazio_localizacao') {
    if (localizacaoVaga(mensagem)) {
      return montarResultado(msgs.c7_local_invalida, undefined, 'local_invalida');
    }

    const localAtual = await resolverLocalizacaoComGps(mensagem, itens);
    if (!localAtual) {
      return montarResultado(msgs.c7_local_invalida, undefined, 'local_invalida');
    }
    await limparEstadoFluxo(telefone);
    return montarResultado(
      msgs.c7_fechamento,
      {
        ferramenta: 'registrar_disponibilidade',
        dados: {
          disponivel: true,
          status: 'disponivel',
          localizacao_atual: localAtual.localizacao,
          latitude: localAtual.latitude,
          longitude: localAtual.longitude,
          telefone,
        },
      },
      localAtual.latitude != null && localAtual.longitude != null ? 'vazio_gps_concluido' : 'vazio_concluido',
    );
  }

  if (contexto.tipo === 'indisponivel_local_atual') {
    const estadoSemCidade = extrairEstadoSemCidade(mensagem);
    if (estadoSemCidade) {
      return montarResultado(
        repromptCidadeNoEstado(estadoSemCidade, 'atual'),
        undefined,
        'local_indisponivel_estado_sem_cidade',
      );
    }
    const localAtual = await resolverLocalizacaoComGps(mensagem, itens);
    if (!localAtual || localizacaoVaga(mensagem)) {
      return montarResultado(msgs.c7_local_invalida, undefined, 'local_indisponivel_invalida');
    }
    await salvarEstadoFluxo(
      telefone,
      {
        passo: 'indisponivel_data',
        localizacaoAtual: localAtual.localizacao,
        latitudeAtual: localAtual.latitude,
        longitudeAtual: localAtual.longitude,
      } satisfies EstadoC7,
    );
    return montarResultado(msgs.c7_pergunta_data, undefined, 'pede_data_indisponivel');
  }

  if (contexto.tipo === 'indisponivel_data') {
    if (dataVaga(mensagem)) {
      return montarResultado(msgs.c7_data_vaga, undefined, 'data_indisponivel_vaga');
    }
    const dataIso = parseDataLiberacao(mensagem);
    if (!dataIso) {
      return montarResultado(msgs.c7_data_vaga, undefined, 'data_indisponivel_invalida');
    }
    await salvarEstadoFluxo(
      telefone,
      {
        passo: 'indisponivel_local_disponibilidade',
        localizacaoAtual: contexto.localizacaoAtual,
        dataPrevisaoDisponibilidade: dataIso,
        latitudeAtual: contexto.latitudeAtual,
        longitudeAtual: contexto.longitudeAtual,
      } satisfies EstadoC7,
    );
    return montarResultado(
      msgs.c7_pergunta_local_disponibilidade,
      undefined,
      'pede_local_disponibilidade_indisponivel',
    );
  }

  if (contexto.tipo === 'indisponivel_local_disponibilidade') {
    const estadoSemCidade = extrairEstadoSemCidade(mensagem);
    if (estadoSemCidade) {
      return montarResultado(
        repromptCidadeNoEstado(estadoSemCidade, 'disponibilidade'),
        undefined,
        'local_disponibilidade_indisponivel_estado_sem_cidade',
      );
    }
    const localDisponibilidade = extrairLocalizacaoTexto(mensagem);
    if (!localDisponibilidade || localizacaoVaga(mensagem)) {
      return montarResultado(
        msgs.c7_pergunta_local_disponibilidade,
        undefined,
        'local_disponibilidade_indisponivel_invalida',
      );
    }
    await limparEstadoFluxo(telefone);
    return montarResultado(
      msgs.c7_fechamento,
      {
        ferramenta: 'registrar_disponibilidade',
        dados: {
          disponivel: false,
          status: 'indisponivel',
          localizacao_atual: contexto.localizacaoAtual,
          local_disponibilidade: localDisponibilidade,
          data_previsao_disponibilidade: contexto.dataPrevisaoDisponibilidade,
          latitude: contexto.latitudeAtual,
          longitude: contexto.longitudeAtual,
          telefone,
        },
      },
      'indisponivel_concluido',
    );
  }

  if (contexto.tipo === 'carregado_local_atual') {
    const estadoSemCidade = extrairEstadoSemCidade(mensagem);
    if (estadoSemCidade) {
      return montarResultado(
        repromptCidadeNoEstado(estadoSemCidade, 'atual'),
        undefined,
        'local_atual_estado_sem_cidade',
      );
    }
    const localAtual = await resolverLocalizacaoComGps(mensagem, itens);
    if (!localAtual || localizacaoVaga(mensagem)) {
      return montarResultado(msgs.c7_local_invalida, undefined, 'local_atual_invalida');
    }
    await salvarEstadoFluxo(
      telefone,
      {
        passo: 'carregado_destino_atual',
        localizacaoAtual: localAtual.localizacao,
        latitudeAtual: localAtual.latitude,
        longitudeAtual: localAtual.longitude,
      } satisfies EstadoC7,
    );
    return montarResultado(
      msgs.c7_pergunta_destino_atual_carregado,
      undefined,
      'pede_destino_atual',
    );
  }

  if (contexto.tipo === 'carregado_destino_atual') {
    const estadoSemCidade = extrairEstadoSemCidade(mensagem);
    if (estadoSemCidade) {
      return montarResultado(
        repromptCidadeNoEstado(estadoSemCidade, 'destino'),
        undefined,
        'destino_atual_estado_sem_cidade',
      );
    }
    const localDestinoAtual = extrairLocalizacaoTexto(mensagem);
    if (!localDestinoAtual || localizacaoVaga(mensagem)) {
      return montarResultado(
        msgs.c7_pergunta_destino_atual_carregado,
        undefined,
        'destino_atual_invalido',
      );
    }
    await salvarEstadoFluxo(
      telefone,
      {
        passo: 'carregado_data',
        localizacaoAtual: contexto.localizacaoAtual,
        localDestinoAtual,
        latitudeAtual: contexto.latitudeAtual,
        longitudeAtual: contexto.longitudeAtual,
      } satisfies EstadoC7,
    );
    return montarResultado(msgs.c7_pergunta_data, undefined, 'pede_data');
  }

  if (contexto.tipo === 'carregado_data') {
    if (dataVaga(mensagem)) {
      return montarResultado(msgs.c7_data_vaga, undefined, 'data_vaga');
    }
    const dataIso = parseDataLiberacao(mensagem);
    if (!dataIso) {
      return montarResultado(msgs.c7_data_vaga, undefined, 'data_invalida');
    }
    await salvarEstadoFluxo(
      telefone,
      {
        passo: 'carregado_local_disponibilidade',
        localizacaoAtual: contexto.localizacaoAtual,
        localDestinoAtual: contexto.localDestinoAtual,
        dataPrevisaoDisponibilidade: dataIso,
        latitudeAtual: contexto.latitudeAtual,
        longitudeAtual: contexto.longitudeAtual,
      } satisfies EstadoC7,
    );
    return montarResultado(
      msgs.c7_pergunta_local_disponibilidade,
      undefined,
      'pede_local_disponibilidade',
    );
  }

  if (contexto.tipo === 'carregado_local_disponibilidade') {
    const estadoSemCidade = extrairEstadoSemCidade(mensagem);
    if (estadoSemCidade) {
      return montarResultado(
        repromptCidadeNoEstado(estadoSemCidade, 'disponibilidade'),
        undefined,
        'local_disponibilidade_estado_sem_cidade',
      );
    }
    const localDisponibilidade = extrairLocalizacaoTexto(mensagem);
    if (!localDisponibilidade || localizacaoVaga(mensagem)) {
      return montarResultado(
        msgs.c7_pergunta_local_disponibilidade,
        undefined,
        'local_disponibilidade_invalida',
      );
    }
    await limparEstadoFluxo(telefone);
    return montarResultado(
      msgs.c7_fechamento,
      {
        ferramenta: 'registrar_disponibilidade',
        dados: {
          disponivel: false,
          status: 'carregado',
          localizacao_atual: contexto.localizacaoAtual,
          local_destino_atual: contexto.localDestinoAtual,
          local_disponibilidade: localDisponibilidade,
          local_liberacao_prevista: localDisponibilidade,
          data_previsao_disponibilidade: contexto.dataPrevisaoDisponibilidade,
          latitude: contexto.latitudeAtual,
          longitude: contexto.longitudeAtual,
          telefone,
        },
      },
      'carregado_concluido',
    );
  }

  return null;
}

/** Indica se o histórico está em fluxo C7 ativo (para roteador futuro). */
export function estaEmFluxoDisponibilidade(
  historico: Array<{ role: string; content: string }>,
): boolean {
  const u = ultimaAssistant(historico);
  if (fluxoJaConcluido(u)) return false;
  return (
    perguntouStatus(u) ||
    perguntouLocalizacao(u) ||
    perguntouLocalAtualCarregado(u) ||
    perguntouDestinoAtualCarregado(u) ||
    perguntouData(u) ||
    perguntouLocalDisponibilidade(u) ||
    GMX_PROATIVA.test(u)
  );
}
