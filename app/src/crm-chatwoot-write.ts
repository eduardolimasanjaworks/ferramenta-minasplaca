/**
 * CRM → Chatwoot: criar/atualizar contato e sincronizar labels (tags).
 * Erros são logados; não quebram a operação do CRM.
 */
import { config } from './config.js';
import {
  chatwootFetch,
  pausaParaStatusIa,
  sincronizarStatusIaChatwoot,
} from './chatwoot-sync.js';
import { definirPausa } from './pausa-minasplaca.js';
import type { CrmContato } from './crm-store.js';

const ATTR = 'status_ia';

function telefoneE164(ddi: string, telefone: string): string {
  const d = String(ddi || '+55').replace(/\D/g, '') || '55';
  const t = String(telefone || '').replace(/\D/g, '');
  return `+${d}${t}`;
}

/** Cria ou localiza contato no Chatwoot e espelha status da IA. */
export async function sincronizarContatoCrmParaChatwoot(
  contato: CrmContato,
  opts: { iaAtiva: boolean } = { iaAtiva: true },
): Promise<{ ok: boolean; chatwootContactId?: string; motivo?: string }> {
  const tel = String(contato.telefone || '').replace(/\D/g, '');
  if (tel.length < 8) return { ok: false, motivo: 'sem_telefone' };

  const phone = telefoneE164(contato.ddi, tel);
  const pausada = !opts.iaAtiva;

  try {
    let contactId: number | null = contato.chatwootContactId
      ? Number(contato.chatwootContactId)
      : null;

    if (!contactId || Number.isNaN(contactId)) {
      // search
      const search = await chatwootFetch(
        `/api/v1/accounts/${config.chatwootAccountId}/contacts/search?q=${encodeURIComponent(phone)}`,
      );
      if (search.ok) {
        const data = (await search.json()) as {
          payload?: Array<{ id?: number; phone_number?: string }>;
        };
        const hit = (data.payload ?? []).find((c) => {
          const p = String(c.phone_number || '').replace(/\D/g, '');
          return p.endsWith(tel) || p.endsWith(tel.slice(-11));
        });
        if (hit?.id) contactId = hit.id;
      }
    }

    if (!contactId) {
      const create = await chatwootFetch(
        `/api/v1/accounts/${config.chatwootAccountId}/contacts`,
        {
          method: 'POST',
          body: JSON.stringify({
            name: contato.nome || phone,
            phone_number: phone,
            email: contato.email || undefined,
            custom_attributes: { [ATTR]: pausaParaStatusIa(pausada) },
          }),
        },
      );
      if (!create.ok) {
        const detail = await create.text().catch(() => '');
        console.error('[crm-cw] criar contato falhou', create.status, detail);
        return { ok: false, motivo: `http_${create.status}` };
      }
      const created = (await create.json()) as {
        payload?: { contact?: { id?: number }; id?: number };
        id?: number;
      };
      contactId =
        created.payload?.contact?.id ??
        created.payload?.id ??
        created.id ??
        null;
    } else {
      await chatwootFetch(
        `/api/v1/accounts/${config.chatwootAccountId}/contacts/${contactId}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            name: contato.nome || phone,
            phone_number: phone,
            email: contato.email || undefined,
            custom_attributes: { [ATTR]: pausaParaStatusIa(pausada) },
          }),
        },
      );
    }

    if (!contactId) return { ok: false, motivo: 'sem_id' };

    await definirPausa(tel, pausada, {
      origem: 'crm',
      motivo: opts.iaAtiva ? 'IA ativa no CRM' : 'IA pausada no CRM',
    });
    await sincronizarStatusIaChatwoot(tel, pausada, { contactId });

    if (contato.tags?.length) {
      await sincronizarLabelsChatwoot(contactId, contato.tags);
    }

    return { ok: true, chatwootContactId: String(contactId) };
  } catch (err) {
    console.error('[crm-cw] sync contato:', err);
    return {
      ok: false,
      motivo: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function sincronizarLabelsChatwoot(
  chatwootContactId: number | string,
  tags: string[],
): Promise<void> {
  const id = Number(chatwootContactId);
  if (!id || Number.isNaN(id)) return;
  const labels = tags.map((t) => t.trim()).filter(Boolean);
  try {
    const r = await chatwootFetch(
      `/api/v1/accounts/${config.chatwootAccountId}/contacts/${id}/labels`,
      {
        method: 'POST',
        body: JSON.stringify({ labels }),
      },
    );
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      console.error('[crm-cw] labels falhou', r.status, detail);
    }
  } catch (err) {
    console.error('[crm-cw] labels erro:', err);
  }
}

/** Lê labels do contato Chatwoot (para sync inbound). */
export async function obterLabelsChatwoot(
  chatwootContactId: number | string,
): Promise<string[]> {
  const id = Number(chatwootContactId);
  if (!id || Number.isNaN(id)) return [];
  try {
    const r = await chatwootFetch(
      `/api/v1/accounts/${config.chatwootAccountId}/contacts/${id}/labels`,
    );
    if (!r.ok) return [];
    const data = (await r.json()) as { payload?: string[] | { title?: string }[] };
    const payload = data.payload;
    if (!Array.isArray(payload)) return [];
    return payload
      .map((x) => (typeof x === 'string' ? x : String(x?.title || '')))
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}
