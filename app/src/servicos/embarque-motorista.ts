/**
 * Embarques vinculados ao motorista (kanban).
 */
import { directusConfigurado, directusListar, directusPost } from './directus.js';
import { directusUploadArquivo, directusAssetUrl } from './directus.js';
import { buscarMotoristaPorTelefone } from './motorista-gmx.js';
import type { MidiaCacheada } from './midia-cache.js';
import { espelharMidiaWhatsappNoDrive } from './google-drive-motorista.js';

export interface EmbarqueAtivo {
  id: number | string;
  status?: string;
  origin?: string;
  destination?: string;
  valor_ofertado?: number | string | null;
  valor_minimo?: number | string | null;
  valor_maximo?: number | string | null;
  total_value?: number | string | null;
}

const STATUS_ATIVO = [
  'new',
  'needs_attention',
  'sent',
  'waiting_confirmation',
  'confirmed',
  'in_transit',
  'waiting_receipt',
];

/** Embarques ativos (driver_id ou oferta_motorista_id). */
export async function listarEmbarquesAtivos(motoristaId: number): Promise<EmbarqueAtivo[]> {
  if (!directusConfigurado()) return [];
  const campos = 'id,status,origin,destination,valor_ofertado,valor_minimo,valor_maximo,total_value';
  const [a, b] = await Promise.all([
    directusListar<EmbarqueAtivo>('embarques', {
      'filter[driver_id][_eq]': String(motoristaId),
      'filter[status][_in]': STATUS_ATIVO.join(','),
      sort: '-date_updated,-date_created',
      limit: '5',
      fields: campos,
    }).catch(() => []),
    directusListar<EmbarqueAtivo>('embarques', {
      'filter[oferta_motorista_id][_eq]': String(motoristaId),
      'filter[status][_in]': STATUS_ATIVO.join(','),
      sort: '-date_updated,-date_created',
      limit: '5',
      fields: campos,
    }).catch(() => []),
  ]);
  const vistos = new Set<string>();
  const out: EmbarqueAtivo[] = [];
  for (const e of [...a, ...b]) {
    const k = String(e.id);
    if (vistos.has(k)) continue;
    vistos.add(k);
    out.push(e);
  }
  return out;
}

export async function obterEmbarqueAtivoPrincipal(telefone: string): Promise<EmbarqueAtivo | null> {
  const m = await buscarMotoristaPorTelefone(telefone);
  if (!m) return null;
  const lista = await listarEmbarquesAtivos(m.id);
  return lista[0] ?? null;
}

/** Grava canhoto/comprovante de entrega no embarque ativo. */
export async function gravarCanhotoEmbarque(opts: {
  telefone: string;
  embarqueId: number | string;
  midia: MidiaCacheada;
  textoExtraido?: string;
}): Promise<{ fileUrl: string; registroId: unknown }> {
  const fileId = await directusUploadArquivo(
    opts.midia.buffer,
    opts.midia.fileName,
    opts.midia.mimetype,
  );
  const fileUrl = directusAssetUrl(fileId);
  const registro = await directusPost('delivery_receipts', {
    shipment_id: String(opts.embarqueId),
    file_url: fileUrl,
    file_name: opts.midia.fileName,
    file_size: opts.midia.buffer.length,
    observations: opts.textoExtraido?.slice(0, 2000),
  });

  const motorista = await buscarMotoristaPorTelefone(opts.telefone);
  if (motorista) {
    espelharMidiaWhatsappNoDrive({
      motorista,
      midia: opts.midia,
      tipoDocumento: 'comprovante_entrega',
    });
  }

  return { fileUrl, registroId: (registro as { id?: unknown }).id };
}
