/**
 * Sincroniza status_ia (Chatwoot) <-> pausa da IA (Redis).
 *
 * Chatwoot (contato):
 *   status_ia = "ia_desligada"  -> IA pausada
 *   status_ia = "ia_ligada"     -> IA ativa
 */
import { config } from './config.js';
import { normalizarTelefone } from './util/telefone.js';
import { obterRedis } from './lib/redis.js';

const ATTR = 'status_ia';
const VAL_DESLIGADA = 'ia_desligada';
const VAL_LIGADA = 'ia_ligada';
const CACHE_CID_PREFIX = 'chatwoot:contact_id:';

let tokenCache: { token: string; exp: number } | null = null;

function baseUrl(): string {
  return config.chatwootUrl.replace(/\/$/, '');
}

async function obterTokenUsuario(): Promise<string | null> {
  if (config.chatwootApiAccessToken) return config.chatwootApiAccessToken;

  const platform = config.chatwootPlatformToken;
  const userId = config.chatwootSsoUserId;
  if (!platform || !userId) return null;

  if (tokenCache && tokenCache.exp > Date.now()) return tokenCache.token;

  try {
    const r = await fetch(`${baseUrl()}/platform/api/v1/users/${userId}`, {
      headers: { 'Api-Access-Token': platform },
      signal: AbortSignal.timeout(15_000),
    });
    const data = (await r.json()) as { access_token?: string };
    if (!r.ok || !data.access_token) return null;
    tokenCache = { token: data.access_token, exp: Date.now() + 30 * 60 * 1000 };
    return data.access_token;
  } catch (err) {
    console.error('[chatwoot-sync] Falha ao obter access_token do usuario:', err);
    return null;
  }
}

export async function chatwootFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await obterTokenUsuario();
  if (!token) throw new Error('chatwoot_token_indisponivel');

  const headers = new Headers(init.headers);
  headers.set('Api-Access-Token', token);
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(`${baseUrl()}${path}`, { ...init, headers, signal: AbortSignal.timeout(20_000) });
}

/** Converte valor status_ia para pausar (true) / religar (false). */
export function statusIaParaPausa(valor: unknown): boolean | null {
  if (typeof valor !== 'string') return null;
  const s = valor.trim().toLowerCase();
  if (s === VAL_DESLIGADA || s === 'i.a desligada') return true;
  if (s === VAL_LIGADA || s === 'i.a ligada') return false;
  return null;
}

export function pausaParaStatusIa(pausada: boolean): typeof VAL_DESLIGADA | typeof VAL_LIGADA {
  return pausada ? VAL_DESLIGADA : VAL_LIGADA;
}

function interpretarIaDesligadaLegado(valor: unknown): boolean | null {
  if (valor === true || valor === 1) return true;
  if (valor === false || valor === 0) return false;
  if (typeof valor === 'string') {
    const s = valor.trim().toLowerCase();
    if (['true', '1', 'sim', 'yes', 'on'].includes(s)) return true;
    if (['false', '0', 'nao', 'não', 'no', 'off'].includes(s)) return false;
  }
  return null;
}

function statusIaEmObjeto(obj: Record<string, unknown> | undefined): boolean | null {
  if (!obj) return null;
  if (ATTR in obj) return statusIaParaPausa(obj[ATTR]);
  const attrs = obj.custom_attributes as Record<string, unknown> | undefined;
  if (attrs && ATTR in attrs) return statusIaParaPausa(attrs[ATTR]);
  if ('ia_desligada' in obj) return interpretarIaDesligadaLegado(obj.ia_desligada);
  if (attrs && 'ia_desligada' in attrs) return interpretarIaDesligadaLegado(attrs.ia_desligada);
  return null;
}

/** Só considera status_ia quando o valor realmente mudou (evita religar ao editar outro atributo). */
function pausaEmMudancaStatusIa(
  previous: unknown,
  current: unknown,
): boolean | null {
  const parsed = statusIaParaPausa(current);
  if (parsed === null) return null;
  if (previous !== undefined && previous !== null) {
    const prevParsed = statusIaParaPausa(previous);
    if (prevParsed === parsed) return null;
  }
  return parsed;
}

function pausaEmChangedAttributes(
  changed: unknown,
  opts: { somenteMudancaExplicita?: boolean } = {},
): boolean | null {
  if (!Array.isArray(changed)) return null;

  for (const item of changed) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;

    if (typeof rec.attribute_key === 'string') {
      const key = rec.attribute_key.trim().toLowerCase();
      if (key === ATTR) {
        const parsed = pausaEmMudancaStatusIa(rec.previous_value, rec.current_value ?? rec.attribute_value);
        if (parsed !== null) return parsed;
      }
      if (key === 'custom_attributes') {
        const nested = rec.attribute_value ?? rec.values ?? rec.current_value;
        const prevAttrs = rec.previous_value as Record<string, unknown> | undefined;
        const curAttrs =
          nested && typeof nested === 'object' && 'current_value' in (nested as object)
            ? (nested as { current_value: unknown }).current_value
            : nested;
        const parsed = pausaEmMudancaStatusIa(
          prevAttrs?.[ATTR],
          curAttrs && typeof curAttrs === 'object'
            ? (curAttrs as Record<string, unknown>)[ATTR]
            : undefined,
        );
        if (parsed !== null) return parsed;
      }
      if (opts.somenteMudancaExplicita) continue;
    }

    if (opts.somenteMudancaExplicita) continue;

    if (ATTR in rec) {
      const v = rec[ATTR];
      if (v && typeof v === 'object' && 'current_value' in (v as object)) {
        const parsed = statusIaParaPausa((v as { current_value: unknown }).current_value);
        if (parsed !== null) return parsed;
      }
      const parsed = statusIaParaPausa(v);
      if (parsed !== null) return parsed;
    }

    const nested = rec.custom_attributes as Record<string, unknown> | undefined;
    if (nested) {
      const fromNested = pausaEmCustomAttributes(nested);
      if (fromNested !== null) return fromNested;
    }
  }

  return null;
}

function pausaEmCustomAttributes(attrs: unknown): boolean | null {
  if (!attrs || typeof attrs !== 'object') return null;
  const obj = attrs as Record<string, unknown>;

  // Formato Chatwoot contact_updated:
  // { previous_value: { status_ia: "ia_ligada" }, current_value: { status_ia: "ia_desligada" } }
  const currentValue = obj.current_value;
  if (currentValue && typeof currentValue === 'object') {
    const cur = currentValue as Record<string, unknown>;
    if (ATTR in cur) return statusIaParaPausa(cur[ATTR]);
  }

  if (ATTR in obj) {
    const v = obj[ATTR];
    if (v && typeof v === 'object' && 'current_value' in (v as object)) {
      return statusIaParaPausa((v as { current_value: unknown }).current_value);
    }
    if (Array.isArray(v) && v.length >= 2) return statusIaParaPausa(v[1]);
    return statusIaParaPausa(v);
  }
  return null;
}

const EVENTOS_SO_MUDANCA_EXPLICITA = new Set(['contact_updated', 'conversation_updated']);

/** Lê status_ia / ia_desligada de payloads Chatwoot ou automações. */
export function extrairPausaDoPayloadChatwoot(
  payload: Record<string, unknown>,
  evento?: string,
): boolean | null {
  const ev = (evento ?? String(payload.event ?? payload.tipo ?? '')).toLowerCase();
  const somenteMudancaExplicita = EVENTOS_SO_MUDANCA_EXPLICITA.has(ev);

  const changedFirst = pausaEmChangedAttributes(payload.changed_attributes, {
    somenteMudancaExplicita,
  });
  if (changedFirst !== null) return changedFirst;

  // contact_updated dispara em qualquer edição do contato; o objeto completo costuma
  // trazer status_ia=ia_ligada (default) e religava a IA sem mudança real do operador.
  if (somenteMudancaExplicita) return null;

  const direto = statusIaEmObjeto(payload);
  if (direto !== null) return direto;

  const contact = payload.contact as Record<string, unknown> | undefined;
  const cont = statusIaEmObjeto(contact);
  if (cont !== null) return cont;

  const conversation = payload.conversation as Record<string, unknown> | undefined;
  const conv = statusIaEmObjeto(conversation);
  if (conv !== null) return conv;

  const meta = payload.meta as Record<string, unknown> | undefined;
  const sender = meta?.sender as Record<string, unknown> | undefined;
  const snd = statusIaEmObjeto(sender);
  if (snd !== null) return snd;

  const convMeta = conversation?.meta as Record<string, unknown> | undefined;
  const convSender = convMeta?.sender as Record<string, unknown> | undefined;
  const convSnd = statusIaEmObjeto(convSender);
  if (convSnd !== null) return convSnd;

  return pausaEmChangedAttributes(payload.changed_attributes);
}

/** Extrai telefone de payloads Chatwoot (contact_updated, conversation, etc.). */
export function extrairTelefoneDoPayloadChatwoot(payload: Record<string, unknown>): string | null {
  const direto =
    payload.telefone ??
    payload.phone ??
    payload.phone_number ??
    payload.numero;

  if (typeof direto === 'string' && direto.trim()) {
    return normalizarTelefone(direto);
  }

  const contact = payload.contact as Record<string, unknown> | undefined;
  if (typeof contact?.phone_number === 'string') {
    return normalizarTelefone(contact.phone_number);
  }

  const meta = payload.meta as Record<string, unknown> | undefined;
  const sender = meta?.sender as Record<string, unknown> | undefined;
  if (typeof sender?.phone_number === 'string') {
    return normalizarTelefone(sender.phone_number);
  }

  const conversation = payload.conversation as Record<string, unknown> | undefined;
  const convMeta = conversation?.meta as Record<string, unknown> | undefined;
  const convSender = convMeta?.sender as Record<string, unknown> | undefined;
  if (typeof convSender?.phone_number === 'string') {
    return normalizarTelefone(convSender.phone_number);
  }

  return null;
}

async function cachearContactId(telefone: string, contactId: number): Promise<void> {
  const n = normalizarTelefone(telefone);
  if (!n || !contactId) return;
  try {
    const redis = obterRedis();
    await redis.set(`${CACHE_CID_PREFIX}${n}`, String(contactId), 'EX', 86_400);
  } catch {
    /* ignore */
  }
}

async function obterContactIdCacheado(telefone: string): Promise<number | null> {
  const n = normalizarTelefone(telefone);
  if (!n) return null;
  try {
    const redis = obterRedis();
    const cached = await redis.get(`${CACHE_CID_PREFIX}${n}`);
    if (cached) return Number(cached);
  } catch {
    /* ignore */
  }
  const id = await buscarContatoId(telefone);
  if (id) await cachearContactId(telefone, id);
  return id;
}

async function lerStatusIaPorContactId(contactId: number): Promise<StatusIaContato> {
  const r = await chatwootFetch(
    `/api/v1/accounts/${config.chatwootAccountId}/contacts/${contactId}`,
  );
  if (!r.ok) {
    return { ok: false, status_ia: null, pausada: false, motivo: `http_${r.status}` };
  }

  const data = (await r.json()) as {
    payload?: { custom_attributes?: Record<string, unknown>; phone_number?: string };
  };
  const attrs = data.payload?.custom_attributes ?? {};
  const raw = attrs[ATTR];
  const statusIa = typeof raw === 'string' ? raw : null;
  const pausa = statusIa ? statusIaParaPausa(statusIa) : null;

  return {
    ok: true,
    contactId,
    status_ia: statusIa,
    pausada: pausa === true,
  };
}

async function buscarContatoId(telefone: string): Promise<number | null> {
  const n = normalizarTelefone(telefone);
  const tentativas = [...new Set([n, n.slice(-11), n.slice(-10), `+${n}`])];

  for (const q of tentativas) {
    if (!q) continue;
    const r = await chatwootFetch(
      `/api/v1/accounts/${config.chatwootAccountId}/contacts/search?q=${encodeURIComponent(q)}`,
    );
    if (!r.ok) continue;
    const data = (await r.json()) as { payload?: Array<{ id?: number; phone_number?: string }> };
    const lista = data.payload ?? [];
    const hit = lista.find((c) => {
      if (!c.phone_number) return lista.length === 1;
      return normalizarTelefone(c.phone_number) === n
        || normalizarTelefone(c.phone_number).endsWith(n.slice(-11));
    }) ?? lista[0];
    if (hit?.id) {
      await cachearContactId(q, hit.id);
      return hit.id;
    }
  }
  return null;
}

/** Atualiza status_ia no contato Chatwoot (espelha pausa da IA). */
export async function sincronizarStatusIaChatwoot(
  telefone: string,
  pausada: boolean,
  opts: { contactId?: number } = {},
): Promise<{ ok: boolean; contactId?: number; status_ia?: string; motivo?: string }> {
  const statusIa = pausaParaStatusIa(pausada);
  let contactId = opts.contactId;

  try {
    if (!contactId) {
      contactId = (await obterContactIdCacheado(telefone)) ?? undefined;
    }
    if (!contactId) {
      return { ok: false, motivo: 'contato_nao_encontrado' };
    }

    const r = await chatwootFetch(
      `/api/v1/accounts/${config.chatwootAccountId}/contacts/${contactId}`,
      {
        method: 'PUT',
        body: JSON.stringify({ custom_attributes: { [ATTR]: statusIa } }),
      },
    );

    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      console.error(`[chatwoot-sync] Falha PUT contato ${contactId}:`, r.status, detail);
      return { ok: false, contactId, motivo: `http_${r.status}` };
    }

    console.log(`[chatwoot-sync] status_ia=${statusIa} para contato ${contactId} (${telefone})`);
    return { ok: true, contactId, status_ia: statusIa };
  } catch (err) {
    console.error('[chatwoot-sync] Erro ao sincronizar:', err);
    return { ok: false, motivo: err instanceof Error ? err.message : String(err) };
  }
}

export interface StatusIaContato {
  ok: boolean;
  contactId?: number;
  status_ia: string | null;
  pausada: boolean;
  motivo?: string;
}

/** Lê status_ia atual do contato no Chatwoot. */
export async function lerStatusIaChatwoot(telefone: string): Promise<StatusIaContato> {
  try {
    const contactId = await obterContactIdCacheado(telefone);
    if (!contactId) {
      return { ok: false, status_ia: null, pausada: false, motivo: 'contato_nao_encontrado' };
    }

    return await lerStatusIaPorContactId(contactId);
  } catch (err) {
    return {
      ok: false,
      status_ia: null,
      pausada: false,
      motivo: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Sync rápido de um telefone: Chatwoot prevalece. Atualiza Redis se divergir.
 * Usado pelo painel em polling (~200ms) quando o webhook não chegou a tempo.
 */
export async function sincronizarTelefoneRapido(
  telefone: string,
): Promise<{ ok: boolean; estado: import('./pausa-minasplaca.js').EstadoPausa; alterado: boolean; status_ia: string | null }> {
  const { obterEstadoPausa, definirPausa, validarTelefone } = await import('./pausa-minasplaca.js');
  const n = validarTelefone(telefone);
  const estadoAtual = await obterEstadoPausa(n);
  const redisPausada = estadoAtual?.pausada === true;

  const cw = await lerStatusIaChatwoot(n);
  if (!cw.ok || !cw.status_ia) {
    return {
      ok: true,
      estado: estadoAtual ?? { pausada: false, telefone: n, atualizado_em: new Date().toISOString() },
      alterado: false,
      status_ia: cw.status_ia,
    };
  }

  const chatwootPausada = cw.pausada;
  if (redisPausada === chatwootPausada) {
    return {
      ok: true,
      estado: estadoAtual ?? { pausada: chatwootPausada, telefone: n, atualizado_em: new Date().toISOString() },
      alterado: false,
      status_ia: cw.status_ia,
    };
  }

  const estado = await definirPausa(n, chatwootPausada, {
    motivo: `Sync rápido (${cw.status_ia})`,
    origem: 'sync-rapido',
  });

  return { ok: true, estado, alterado: true, status_ia: cw.status_ia };
}

export interface ResultadoReconciliacao {
  telefone: string;
  redis_pausada: boolean;
  chatwoot_status_ia: string | null;
  acao: 'ok' | 'redis_atualizado' | 'chatwoot_atualizado' | 'erro';
  detalhe?: string;
}

/** Reconcilia Redis <-> status_ia (Chatwoot) para lista de telefones. */
export async function reconciliarSincroniaPausas(
  telefonesExtra: string[] = [],
): Promise<{ ok: boolean; total: number; corrigidos: number; resultados: ResultadoReconciliacao[] }> {
  const { listarPausasAtivas, obterEstadoPausa, definirPausa, obterLogsPausa } = await import('./pausa-minasplaca.js');

  const pausas = await listarPausasAtivas();
  const logs = await obterLogsPausa(80);

  const watch = new Set<string>();
  for (const p of pausas) if (p.telefone) watch.add(normalizarTelefone(p.telefone));
  for (const l of logs) if (l.telefone) watch.add(normalizarTelefone(l.telefone));
  for (const t of telefonesExtra) {
    const n = normalizarTelefone(t);
    if (n.length >= 10) watch.add(n);
  }

  const resultados: ResultadoReconciliacao[] = [];
  let corrigidos = 0;

  for (const telefone of watch) {
    const estadoRedis = await obterEstadoPausa(telefone);
    const redisPausada = estadoRedis?.pausada === true;
    const cw = await lerStatusIaChatwoot(telefone);

    if (!cw.ok) {
      if (redisPausada) {
        const sync = await sincronizarStatusIaChatwoot(telefone, true);
        const acao = sync.ok ? 'chatwoot_atualizado' as const : 'erro' as const;
        if (sync.ok) corrigidos++;
        resultados.push({
          telefone,
          redis_pausada: true,
          chatwoot_status_ia: null,
          acao,
          detalhe: sync.motivo,
        });
      } else {
        resultados.push({
          telefone,
          redis_pausada: false,
          chatwoot_status_ia: null,
          acao: 'ok',
          detalhe: cw.motivo,
        });
      }
      continue;
    }

    const chatwootPausada = cw.pausada;
    const statusIa = cw.status_ia;

    if (redisPausada === chatwootPausada) {
      resultados.push({
        telefone,
        redis_pausada: redisPausada,
        chatwoot_status_ia: statusIa,
        acao: 'ok',
      });
      continue;
    }

    // Divergência: status_ia no Chatwoot prevalece quando definido
    if (statusIa) {
      await definirPausa(telefone, chatwootPausada, {
        motivo: `Sync retroativo (${statusIa})`,
        origem: 'sync-retroativo',
      });
      corrigidos++;
      resultados.push({
        telefone,
        redis_pausada: chatwootPausada,
        chatwoot_status_ia: statusIa,
        acao: 'redis_atualizado',
      });
      continue;
    }

    // Sem status_ia no contato — espelha Redis no Chatwoot
    const sync = await sincronizarStatusIaChatwoot(telefone, redisPausada, { contactId: cw.contactId });
    const acao = sync.ok ? 'chatwoot_atualizado' as const : 'erro' as const;
    if (sync.ok) corrigidos++;
    resultados.push({
      telefone,
      redis_pausada: redisPausada,
      chatwoot_status_ia: statusIa,
      acao,
      detalhe: sync.motivo,
    });
  }

  return { ok: true, total: resultados.length, corrigidos, resultados };
}
