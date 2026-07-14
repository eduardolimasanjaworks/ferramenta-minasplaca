import pg from 'pg';
import { config } from './config.js';

const pool = new pg.Pool({ connectionString: config.databaseUrl });
const CACHE_MS = 15000;

export interface RegraRecorrenciaProativa {
  id: string;
  dias_semana: number[];
  horarios: string[];
}

export interface ParametrosProativos {
  dias_antes?: number[];
  dias_atraso?: number[];
  dias_pos_entrega?: number;
}

export interface TemplatesProativos {
  hoje?: string;
  preventivo?: string;
  padrao?: string;
}

export interface AbordagemProativa {
  slug: string;
  nome: string;
  ativo: boolean;
  copy: string;
  templates?: TemplatesProativos;
  parametros?: ParametrosProativos;
  regras: RegraRecorrenciaProativa[];
}

export interface ConfigProativos {
  disparos_habilitados: boolean;
  abordagens: AbordagemProativa[];
  atualizado_em: string;
}

const TEMPLATE_BOLETO_HOJE =
  'Olá, tudo bem?\n\nEstamos passando apenas para lembrar que o boleto referente a *{{descricao}}* vence HOJE ({{vencimento}}).\n\nPara facilitar seu planejamento, segue o link direto para pagamento:\n🔗 {{link_boleto}}\n\nValor: R$ {{valor}}\nQualquer dúvida, estamos à disposição! Equipe Minas Placa';

const TEMPLATE_BOLETO_PREVENTIVO =
  'Olá, tudo bem?\n\nEstamos passando apenas para lembrar que o boleto referente a *{{descricao}}* tem vencimento programado para daqui a 3 dias ({{vencimento}}).\n\nPara facilitar seu planejamento, segue o link direto para pagamento:\n🔗 {{link_boleto}}\n\nValor: R$ {{valor}}\nQualquer dúvida, estamos à disposição! Equipe Minas Placa';

const TEMPLATE_COBRANCA =
  'Olá! Tudo bem?\n\nConsta em nosso sistema um boleto referente a *{{descricao}}* vencido há {{dias_atraso}} dias.\n\n💰 Valor: R$ {{valor}}\n📅 Vencimento: {{vencimento}}\n\nPara facilitar, segue o link para pagamento:\n{{link_boleto}}\n\nCaso já tenha efetuado o pagamento, nos encaminhe por aqui o comprovante para baixa no sistema.';

const TEMPLATE_RASTREIO =
  '{{saudacao}}\nMinas Placa - Rastreio Pedido #{{id_pedido}}\n📦 *Status:* {{status}}\n{{data_linha}}🔗 *Acompanhe:* {{link_rastreio}}\n\n_Suporte Minas Placa_';

const TEMPLATE_POS_VENDA =
  'Olá, aqui é o Rafael, da Minas Placa.\nAgradecemos a preferência! Ficamos felizes em saber que seu pedido {{id_pedido}} foi entregue.\nPoderia nos contar se o material atendeu às suas expectativas?\nCaso tenha dúvidas, reclamações, sugestões ou precise da segunda via do boleto ou da nota fiscal, ficamos à disposição para ajudar.';

const ABORDAGENS_PADRAO: AbordagemProativa[] = [
  {
    slug: 'boleto-a-vencer',
    nome: 'Lembrete de Boleto a Vencer',
    ativo: false,
    copy: TEMPLATE_BOLETO_HOJE,
    templates: { hoje: TEMPLATE_BOLETO_HOJE, preventivo: TEMPLATE_BOLETO_PREVENTIVO },
    parametros: { dias_antes: [0, 3] },
    regras: [{ id: 'boleto-a-vencer-1', dias_semana: [1, 2, 3, 4, 5], horarios: ['08:00'] }],
  },
  {
    slug: 'envia-rastreamento',
    nome: 'Envia Rastreamento',
    ativo: false,
    copy: TEMPLATE_RASTREIO,
    templates: { padrao: TEMPLATE_RASTREIO },
    regras: [{ id: 'envia-rastreamento-1', dias_semana: [1, 2, 3, 4, 5], horarios: ['09:00'] }],
  },
  {
    slug: 'cobranca-vencidos',
    nome: 'Cobrança Boletos Vencidos',
    ativo: false,
    copy: TEMPLATE_COBRANCA,
    templates: { padrao: TEMPLATE_COBRANCA },
    parametros: { dias_atraso: [1, 3, 5, 7] },
    regras: [{ id: 'cobranca-vencidos-1', dias_semana: [1, 2, 3, 4, 5], horarios: ['09:00'] }],
  },
  {
    slug: 'pesquisa-pos-venda',
    nome: 'Pesquisa Pós-Venda',
    ativo: false,
    copy: TEMPLATE_POS_VENDA,
    templates: { padrao: TEMPLATE_POS_VENDA },
    parametros: { dias_pos_entrega: 2 },
    regras: [{ id: 'pesquisa-pos-venda-1', dias_semana: [1, 2, 3, 4, 5], horarios: ['10:00'] }],
  },
];

let cache: { valor: ConfigProativos; expira: number } | null = null;

function regraValida(regra: RegraRecorrenciaProativa): RegraRecorrenciaProativa {
  const dias = Array.from(
    new Set((regra.dias_semana || []).map((n) => Math.round(Number(n))).filter((n) => n >= 0 && n <= 6)),
  ).sort();
  const horarios = Array.from(new Set((regra.horarios || []).map((h) => String(h).trim()).filter(validarHorario))).sort();
  return {
    id: String(regra.id || `regra-${Date.now()}`),
    dias_semana: dias,
    horarios,
  };
}

function validarHorario(valor: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(valor);
}

function normalizarParametros(input: Partial<ParametrosProativos> | undefined, fallback: ParametrosProativos | undefined): ParametrosProativos | undefined {
  if (!fallback && !input) return undefined;
  const base = fallback || {};
  const out: ParametrosProativos = {};
  if (input?.dias_antes || base.dias_antes) {
    out.dias_antes = Array.from(new Set((input?.dias_antes ?? base.dias_antes ?? []).map(Number))).sort();
  }
  if (input?.dias_atraso || base.dias_atraso) {
    out.dias_atraso = Array.from(new Set((input?.dias_atraso ?? base.dias_atraso ?? []).map(Number))).sort();
  }
  if (input?.dias_pos_entrega !== undefined || base.dias_pos_entrega !== undefined) {
    out.dias_pos_entrega = Number(input?.dias_pos_entrega ?? base.dias_pos_entrega ?? 2);
  }
  return Object.keys(out).length ? out : undefined;
}

function normalizarTemplates(input: Partial<TemplatesProativos> | undefined, fallback: TemplatesProativos | undefined, copy: string): TemplatesProativos | undefined {
  const base = fallback || {};
  const t: TemplatesProativos = {
    hoje: String(input?.hoje || base.hoje || copy).trim(),
    preventivo: String(input?.preventivo || base.preventivo || copy).trim(),
    padrao: String(input?.padrao || base.padrao || copy).trim(),
  };
  return t;
}

function normalizarAbordagem(input: Partial<AbordagemProativa>, fallback: AbordagemProativa): AbordagemProativa {
  const regras = Array.isArray(input.regras)
    ? input.regras.map(regraValida).filter((r) => r.dias_semana.length && r.horarios.length)
    : fallback.regras;
  const copy = String(input.copy || fallback.copy).trim() || fallback.copy;
  return {
    slug: fallback.slug,
    nome: String(input.nome || fallback.nome).trim() || fallback.nome,
    ativo: input.ativo === undefined ? fallback.ativo : input.ativo === true,
    copy,
    templates: normalizarTemplates(input.templates, fallback.templates, copy),
    parametros: normalizarParametros(input.parametros, fallback.parametros),
    regras: regras.length ? regras : fallback.regras,
  };
}

export async function inicializarBancoProativos(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS config_disparos_proativos (
      id INT PRIMARY KEY DEFAULT 1,
      config_json JSONB NOT NULL,
      atualizado_em TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT config_disparos_proativos_single CHECK (id = 1)
    )
  `);
  await pool.query(
    `INSERT INTO config_disparos_proativos (id, config_json)
     VALUES (1, $1::jsonb)
     ON CONFLICT (id) DO NOTHING`,
    [JSON.stringify({ disparos_habilitados: false, abordagens: ABORDAGENS_PADRAO })],
  );
}

export async function obterConfigProativos(): Promise<ConfigProativos> {
  if (cache && cache.expira > Date.now()) return cache.valor;
  await inicializarBancoProativos();

  let valor: ConfigProativos = {
    disparos_habilitados: false,
    abordagens: ABORDAGENS_PADRAO,
    atualizado_em: new Date().toISOString(),
  };

  try {
    const res = await pool.query('SELECT config_json, atualizado_em FROM config_disparos_proativos WHERE id = 1');
    if (res.rows[0]) {
      const bruto = res.rows[0].config_json as {
        disparos_habilitados?: boolean;
        abordagens?: Partial<AbordagemProativa>[];
      };
      const mapa = new Map((bruto.abordagens || []).map((a) => [String(a.slug || ''), a]));
      valor = {
        disparos_habilitados: bruto.disparos_habilitados === true,
        abordagens: ABORDAGENS_PADRAO.map((padrao) => normalizarAbordagem(mapa.get(padrao.slug) || {}, padrao)),
        atualizado_em: res.rows[0].atualizado_em
          ? new Date(res.rows[0].atualizado_em).toISOString()
          : new Date().toISOString(),
      };
    }
  } catch (err) {
    console.error('[proativos-config] Erro ao obter config:', err);
  }

  cache = { valor, expira: Date.now() + CACHE_MS };
  return valor;
}

export async function salvarConfigProativos(dados: {
  abordagens?: Partial<AbordagemProativa>[];
  disparos_habilitados?: boolean;
}): Promise<ConfigProativos> {
  const atual = await obterConfigProativos();
  const incoming = Array.isArray(dados.abordagens) ? dados.abordagens : [];
  const mapa = new Map(incoming.map((a) => [String(a.slug || ''), a]));
  const abordagens = atual.abordagens.map((padrao) => normalizarAbordagem(mapa.get(padrao.slug) || padrao, padrao));
  const disparos_habilitados =
    dados.disparos_habilitados === undefined ? atual.disparos_habilitados : dados.disparos_habilitados === true;

  await pool.query(
    `INSERT INTO config_disparos_proativos (id, config_json, atualizado_em)
     VALUES (1, $1::jsonb, NOW())
     ON CONFLICT (id) DO UPDATE
       SET config_json = EXCLUDED.config_json,
           atualizado_em = NOW()`,
    [JSON.stringify({ disparos_habilitados, abordagens })],
  );
  cache = null;
  return obterConfigProativos();
}

export async function alternarDisparosProativos(habilitado: boolean): Promise<ConfigProativos> {
  return salvarConfigProativos({ disparos_habilitados: habilitado });
}

export function obterAbordagemPorSlug(cfg: ConfigProativos, slug: string): AbordagemProativa | undefined {
  return cfg.abordagens.find((a) => a.slug === slug);
}
