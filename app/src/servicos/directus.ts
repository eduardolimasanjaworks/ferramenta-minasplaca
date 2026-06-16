/**
 * Cliente Directus GMX — motoristas, documentos, arquivos.
 */
import { config } from '../config.js';

const headersJson = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${config.directusToken}`,
});

export function directusConfigurado(): boolean {
  return Boolean(config.directusUrl && config.directusToken);
}

function url(caminho: string): string {
  return `${config.directusUrl}${caminho.startsWith('/') ? caminho : `/${caminho}`}`;
}

/** GET genérico na API Directus */
export async function directusGet<T = unknown>(caminho: string): Promise<T> {
  if (!directusConfigurado()) throw new Error('Directus não configurado');
  const res = await fetch(url(caminho), { headers: headersJson(), signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Directus GET falhou (${res.status}): ${await res.text()}`);
  return res.json() as Promise<T>;
}

/** Lista itens de uma coleção */
export async function directusListar<T = Record<string, unknown>>(
  colecao: string,
  params: Record<string, string> = {},
): Promise<T[]> {
  const qs = new URLSearchParams(params).toString();
  const res = await directusGet<{ data: T[] }>(`/items/${colecao}${qs ? `?${qs}` : ''}`);
  return res.data ?? [];
}

/** POST em coleção */
export async function directusPost<T = unknown>(
  colecao: string,
  dados: Record<string, unknown>,
): Promise<T> {
  if (!directusConfigurado()) throw new Error('Directus não configurado');
  const res = await fetch(url(`/items/${colecao}`), {
    method: 'POST',
    headers: headersJson(),
    body: JSON.stringify(dados),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Directus POST ${colecao} falhou (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as { data: T };
  return json.data;
}

/** PATCH em item */
export async function directusPatch<T = unknown>(
  colecao: string,
  id: number | string,
  dados: Record<string, unknown>,
): Promise<T> {
  if (!directusConfigurado()) throw new Error('Directus não configurado');
  const res = await fetch(url(`/items/${colecao}/${id}`), {
    method: 'PATCH',
    headers: headersJson(),
    body: JSON.stringify(dados),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Directus PATCH ${colecao}/${id} falhou (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as { data: T };
  return json.data;
}

/** Upload de arquivo → retorna UUID do arquivo no Directus */
export async function directusUploadArquivo(
  buffer: Buffer,
  fileName: string,
  mimetype: string,
): Promise<string> {
  if (!directusConfigurado()) throw new Error('Directus não configurado');
  const form = new FormData();
  const blob = new Blob([new Uint8Array(buffer)], { type: mimetype });
  form.append('file', blob, fileName);

  const res = await fetch(url('/files'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.directusToken}` },
    body: form,
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`Directus upload falhou (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as { data: { id: string } };
  return json.data.id;
}

/** URL pública do asset no Directus */
export function directusAssetUrl(fileId: string): string {
  return `${config.directusUrl}/assets/${fileId}`;
}

export async function verificarDirectus(): Promise<boolean> {
  if (!directusConfigurado()) return false;
  try {
    const res = await fetch(url('/server/ping'), { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Valida token com uma leitura mínima */
export async function validarDirectusToken(): Promise<boolean> {
  if (!directusConfigurado()) return false;
  try {
    await directusListar('cadastro_motorista', { limit: '1', fields: 'id' });
    return true;
  } catch {
    return false;
  }
}
