import { obterRedis } from '../lib/redis.js';
import { directusConfigurado, directusDelete, directusListar } from './directus.js';
import { normalizarTelefone } from '../util/telefone.js';
import {
  TAG_SIMULACAO_EMBARQUES,
  TAG_SIMULACAO_MOTORISTAS,
  definirAgoraSimulado,
  iniciarSimulacaoMotoristas,
  pararSimulacaoMotoristas,
  seedEmbarquesSimulados,
  seedMotoristasSimulados,
  statusSimulacaoMotoristas,
} from './simulacao-motoristas.js';

type CenarioSimulado = {
  ativo: boolean;
  nowIso: string;
  advanceHoursPorTick: number;
  tickMs: number;
  qtdMotoristas: number;
  seed: number;
  embarquesQtd: number;
  atualizadoEmMs: number;
};

const redis = obterRedis();
const KEY = 'simulacao:cenario:v1';

function isoValido(iso: string): boolean {
  const d = new Date(iso);
  return !Number.isNaN(d.getTime());
}

function estadoPadrao(): CenarioSimulado {
  return {
    ativo: false,
    nowIso: new Date().toISOString(),
    advanceHoursPorTick: 6,
    tickMs: 6000,
    qtdMotoristas: 100,
    seed: 42,
    embarquesQtd: 30,
    atualizadoEmMs: Date.now(),
  };
}

async function lerEstado(): Promise<CenarioSimulado> {
  const raw = await redis.get(KEY);
  if (!raw) return estadoPadrao();
  try {
    const parsed = JSON.parse(raw) as Partial<CenarioSimulado>;
    const base = estadoPadrao();
    const nowIso = typeof parsed.nowIso === 'string' && isoValido(parsed.nowIso) ? parsed.nowIso : base.nowIso;
    return {
      ...base,
      ...parsed,
      ativo: Boolean(parsed.ativo),
      nowIso,
      atualizadoEmMs: Date.now(),
    };
  } catch {
    return estadoPadrao();
  }
}

async function salvarEstado(next: CenarioSimulado): Promise<void> {
  await redis.set(KEY, JSON.stringify({ ...next, atualizadoEmMs: Date.now() }));
}

let cache: { ateMs: number; telefones: Set<string> } = { ateMs: 0, telefones: new Set() };

async function listarTelefonesSimulados(): Promise<Set<string>> {
  if (!directusConfigurado()) return new Set();
  if (Date.now() < cache.ateMs && cache.telefones.size) return cache.telefones;
  const lista = await directusListar<{ telefone?: string }>('cadastro_motorista', {
    'filter[observacao][_contains]': TAG_SIMULACAO_MOTORISTAS,
    fields: 'telefone',
    limit: '5000',
  });
  const set = new Set<string>();
  for (const row of lista) {
    const tel = normalizarTelefone(String(row.telefone ?? ''));
    if (tel.length >= 10) set.add(tel);
  }
  cache = { ateMs: Date.now() + 60_000, telefones: set };
  return set;
}

export async function simulacaoAtivaParaTelefone(telefone: string): Promise<boolean> {
  const st = await lerEstado();
  if (!st.ativo) return false;
  const tel = normalizarTelefone(telefone);
  const set = await listarTelefonesSimulados();
  return set.has(tel);
}

export async function statusCenarioSimulado() {
  const st = await lerEstado();
  const motor = statusSimulacaoMotoristas();
  return { ok: true, cenario: st, motor };
}

export async function definirAgoraCenario(iso: string) {
  const st = await lerEstado();
  const nowIso = isoValido(iso) ? new Date(iso).toISOString() : st.nowIso;
  definirAgoraSimulado(nowIso);
  const next = { ...st, nowIso };
  await salvarEstado(next);
  return { ok: true, cenario: next };
}

export async function iniciarCenarioSimulado(opts?: Partial<Pick<CenarioSimulado, 'nowIso' | 'advanceHoursPorTick' | 'tickMs' | 'qtdMotoristas' | 'seed' | 'embarquesQtd'>>) {
  if (!directusConfigurado()) throw new Error('Directus não configurado (DIRECTUS_URL/DIRECTUS_TOKEN)');
  const atual = await lerEstado();
  const nowIso = typeof opts?.nowIso === 'string' && isoValido(opts.nowIso) ? new Date(opts.nowIso).toISOString() : atual.nowIso;
  const next: CenarioSimulado = {
    ...atual,
    ativo: true,
    nowIso,
    advanceHoursPorTick: Math.max(1, Number(opts?.advanceHoursPorTick ?? atual.advanceHoursPorTick) || atual.advanceHoursPorTick),
    tickMs: Math.max(1500, Number(opts?.tickMs ?? atual.tickMs) || atual.tickMs),
    qtdMotoristas: Math.max(1, Math.min(500, Number(opts?.qtdMotoristas ?? atual.qtdMotoristas) || atual.qtdMotoristas)),
    seed: Number.isFinite(Number(opts?.seed)) ? Number(opts?.seed) : atual.seed,
    embarquesQtd: Math.max(0, Math.min(200, Number(opts?.embarquesQtd ?? atual.embarquesQtd) || atual.embarquesQtd)),
    atualizadoEmMs: Date.now(),
  };
  await salvarEstado(next);
  definirAgoraSimulado(next.nowIso);
  await seedMotoristasSimulados({ qtd: next.qtdMotoristas, seed: next.seed });
  await iniciarSimulacaoMotoristas({
    qtd: next.qtdMotoristas,
    seed: next.seed,
    tickMs: next.tickMs,
    advanceHoursPorTick: next.advanceHoursPorTick,
    nowIso: next.nowIso,
  });
  if (next.embarquesQtd > 0) {
    await seedEmbarquesSimulados({ qtd: next.embarquesQtd, seed: next.seed });
  }
  cache.ateMs = 0;
  return statusCenarioSimulado();
}

export async function apagarTudoDoCenarioSimulado(): Promise<{ ok: true; apagados: { motoristas: number; disponibilidades: number; embarques: number } }> {
  if (!directusConfigurado()) throw new Error('Directus não configurado (DIRECTUS_URL/DIRECTUS_TOKEN)');
  const motoristas = await directusListar<{ id: number }>('cadastro_motorista', {
    'filter[observacao][_contains]': TAG_SIMULACAO_MOTORISTAS,
    fields: 'id',
    limit: '5000',
  });
  let removidosMotoristas = 0;
  let removidasDisp = 0;
  for (const m of motoristas) {
    const id = Number(m.id);
    if (!Number.isFinite(id)) continue;
    const disp = await directusListar<{ id: number }>('disponivel', {
      'filter[motorista_id][_eq]': String(id),
      fields: 'id',
      limit: '5000',
    });
    for (const d of disp) {
      const did = Number(d.id);
      if (!Number.isFinite(did)) continue;
      await directusDelete('disponivel', did).catch(() => undefined);
      removidasDisp++;
    }
    await directusDelete('cadastro_motorista', id).catch(() => undefined);
    removidosMotoristas++;
  }

  const embarques = await directusListar<{ id: number }>('embarques', {
    'filter[observacao][_contains]': TAG_SIMULACAO_EMBARQUES,
    fields: 'id',
    limit: '2000',
  });
  let removidosEmb = 0;
  for (const e of embarques) {
    const id = Number(e.id);
    if (!Number.isFinite(id)) continue;
    await directusDelete('embarques', id).catch(() => undefined);
    removidosEmb++;
  }

  cache.ateMs = 0;
  return { ok: true, apagados: { motoristas: removidosMotoristas, disponibilidades: removidasDisp, embarques: removidosEmb } };
}

export async function reverCenarioSimulado() {
  const atual = await lerEstado();
  await pararSimulacaoMotoristas().catch(() => undefined);
  const apagados = await apagarTudoDoCenarioSimulado();
  const next = { ...atual, ativo: false, atualizadoEmMs: Date.now() };
  await salvarEstado(next);
  return { ok: true, cenario: next, apagados: apagados.apagados };
}

export async function auditarCenarioSimulado() {
  if (!directusConfigurado()) throw new Error('Directus não configurado (DIRECTUS_URL/DIRECTUS_TOKEN)');
  const motoristas = await directusListar<{ id: number; telefone?: string }>('cadastro_motorista', {
    'filter[observacao][_contains]': TAG_SIMULACAO_MOTORISTAS,
    fields: 'id,telefone',
    limit: '5000',
  });
  const disp = await directusListar<{ id: number; motorista_id?: number | { id?: number }; latitude?: number; longitude?: number }>('disponivel', {
    'filter[observacao][_contains]': TAG_SIMULACAO_MOTORISTAS,
    fields: 'id,motorista_id,latitude,longitude',
    limit: '5000',
    sort: '-date_created',
  });
  const comGps = new Set<number>();
  for (const d of disp) {
    const mid = typeof d.motorista_id === 'object' ? Number(d.motorista_id?.id) : Number(d.motorista_id);
    if (!Number.isFinite(mid)) continue;
    if (d.latitude != null && d.longitude != null) comGps.add(mid);
  }

  const embarques = await directusListar<{ id: number; valor_minimo?: number; valor_ofertado?: number; valor_maximo?: number; config_rota_id?: number | null }>('embarques', {
    'filter[observacao][_contains]': TAG_SIMULACAO_EMBARQUES,
    fields: 'id,valor_minimo,valor_ofertado,valor_maximo,config_rota_id',
    limit: '2000',
  });
  const inconsistenciasEmbarques = embarques
    .filter((e) => e.config_rota_id == null || Number(e.valor_ofertado) !== Number(e.valor_minimo))
    .slice(0, 20)
    .map((e) => ({ id: e.id, config_rota_id: e.config_rota_id ?? null, valor_minimo: e.valor_minimo ?? null, valor_ofertado: e.valor_ofertado ?? null, valor_maximo: e.valor_maximo ?? null }));

  return {
    ok: true,
    contagens: {
      motoristas: motoristas.length,
      motoristasComGpsValido: comGps.size,
      disponibilidades: disp.length,
      embarques: embarques.length,
    },
    alertas: {
      embarquesInconsistentes: inconsistenciasEmbarques.length,
      exemplosEmbarquesInconsistentes: inconsistenciasEmbarques,
    },
  };
}
