/**
 * Sincroniza contatos do Chatwoot → cards do CRM.
 * Dedupe por chatwoot_contact_id, depois por telefone.
 */
import { config } from './config.js';
import { chatwootFetch } from './chatwoot-sync.js';
import { obterLabelsChatwoot } from './crm-chatwoot-write.js';
import {
  atualizarContato,
  criarTagCatalogo,
  upsertContatoFromChatwoot,
} from './crm-store.js';

export type ContatoChatwootResumo = {
  id: number;
  name?: string | null;
  email?: string | null;
  phone_number?: string | null;
};

export type ResultadoSyncCrmChatwoot = {
  ok: boolean;
  pages: number;
  lidos: number;
  criados: number;
  atualizados: number;
  erros: number;
  motivo?: string;
  em: string;
};

let syncEmAndamento: Promise<ResultadoSyncCrmChatwoot> | null = null;
let ultimoSync: ResultadoSyncCrmChatwoot | null = null;

export function obterUltimoSyncCrmChatwoot(): ResultadoSyncCrmChatwoot | null {
  return ultimoSync;
}

function parsePhone(phone: string | null | undefined): { ddi: string; telefone: string } {
  if (!phone?.trim()) return { ddi: '+55', telefone: '' };
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length >= 12) {
    return { ddi: '+55', telefone: digits.slice(2) };
  }
  if (digits.startsWith('351') && digits.length >= 12) {
    return { ddi: '+351', telefone: digits.slice(3) };
  }
  if (digits.startsWith('1') && digits.length >= 11) {
    return { ddi: '+1', telefone: digits.slice(1) };
  }
  if (digits.startsWith('54') && digits.length >= 12) {
    return { ddi: '+54', telefone: digits.slice(2) };
  }
  return { ddi: '+55', telefone: digits };
}

export async function mapearEUpsertContatoChatwoot(
  c: ContatoChatwootResumo,
): Promise<{ criado: boolean }> {
  const { ddi, telefone } = parsePhone(c.phone_number);
  const nome =
    (c.name && String(c.name).trim()) ||
    (c.phone_number && String(c.phone_number).trim()) ||
    (c.email && String(c.email).trim()) ||
    `Atendimento #${c.id}`;

  const r = await upsertContatoFromChatwoot({
    chatwootContactId: String(c.id),
    nome,
    email: c.email ? String(c.email) : '',
    telefone,
    ddi,
  });

  try {
    const labels = await obterLabelsChatwoot(c.id);
    if (labels.length) {
      for (const label of labels) {
        await criarTagCatalogo(label).catch(() => {});
      }
      await atualizarContato(r.contato.id, { tags: labels });
    }
  } catch (err) {
    console.error('[crm-sync] labels inbound:', err);
  }

  return { criado: r.criado };
}

/** Extrai contato do payload de webhook Chatwoot e faz upsert no CRM. */
export async function upsertContatoDoPayloadChatwoot(
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; criado?: boolean; id?: string; motivo?: string }> {
  const contact =
    (payload.contact as Record<string, unknown> | undefined) ||
    ((payload.meta as Record<string, unknown> | undefined)?.sender as
      | Record<string, unknown>
      | undefined) ||
    (((payload.conversation as Record<string, unknown> | undefined)?.meta as
      | Record<string, unknown>
      | undefined)?.sender as Record<string, unknown> | undefined);

  if (!contact || contact.id == null) {
    return { ok: false, motivo: 'sem_contato' };
  }

  try {
    const r = await mapearEUpsertContatoChatwoot({
      id: Number(contact.id),
      name: typeof contact.name === 'string' ? contact.name : null,
      email: typeof contact.email === 'string' ? contact.email : null,
      phone_number:
        typeof contact.phone_number === 'string' ? contact.phone_number : null,
    });
    return { ok: true, criado: r.criado };
  } catch (err) {
    return {
      ok: false,
      motivo: err instanceof Error ? err.message : String(err),
    };
  }
}

async function listarPaginaContatos(page: number): Promise<{
  items: ContatoChatwootResumo[];
  total: number;
}> {
  const r = await chatwootFetch(
    `/api/v1/accounts/${config.chatwootAccountId}/contacts?page=${page}`,
  );
  if (!r.ok) {
    throw new Error(`chatwoot_contacts_http_${r.status}`);
  }
  const data = (await r.json()) as {
    payload?: ContatoChatwootResumo[];
    meta?: { count?: number };
  };
  return {
    items: data.payload ?? [],
    total: Number(data.meta?.count ?? 0),
  };
}

export async function sincronizarTodosContatosChatwoot(): Promise<ResultadoSyncCrmChatwoot> {
  if (syncEmAndamento) return syncEmAndamento;

  syncEmAndamento = (async () => {
    const inicio: ResultadoSyncCrmChatwoot = {
      ok: false,
      pages: 0,
      lidos: 0,
      criados: 0,
      atualizados: 0,
      erros: 0,
      em: new Date().toISOString(),
    };

    try {
      let page = 1;
      let total = Infinity;

      while (inicio.lidos < total) {
        const { items, total: t } = await listarPaginaContatos(page);
        total = t || items.length;
        inicio.pages = page;

        if (items.length === 0) break;

        for (const c of items) {
          if (!c?.id) continue;
          inicio.lidos++;
          try {
            const r = await mapearEUpsertContatoChatwoot(c);
            if (r.criado) inicio.criados++;
            else inicio.atualizados++;
          } catch (err) {
            inicio.erros++;
            console.error('[crm-chatwoot] upsert falhou', c.id, err);
          }
        }

        if (inicio.lidos >= total || items.length === 0) break;
        page++;
      }

      inicio.ok = true;
      ultimoSync = inicio;
      console.log(
        `[crm-chatwoot] sync ok lidos=${inicio.lidos} criados=${inicio.criados} atualizados=${inicio.atualizados} erros=${inicio.erros}`,
      );
      return inicio;
    } catch (err) {
      inicio.motivo = err instanceof Error ? err.message : String(err);
      inicio.ok = false;
      ultimoSync = inicio;
      console.error('[crm-chatwoot] sync falhou:', inicio.motivo);
      return inicio;
    } finally {
      syncEmAndamento = null;
    }
  })();

  return syncEmAndamento;
}
