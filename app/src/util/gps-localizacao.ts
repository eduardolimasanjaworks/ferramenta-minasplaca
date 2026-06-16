/**
 * Parse de pin GPS do WhatsApp e reverse geocoding (Nominatim).
 */
import type { ItemDebounce } from '../tipos/evolution.js';

export interface CoordenadasGps {
  latitude: number;
  longitude: number;
}

const RE_GPS =
  /\[Localiza[cç][aã]o GPS:\s*lat\s*([-\d.]+),\s*lng\s*([-\d.]+)/i;

export function extrairCoordenadasGps(texto: string): CoordenadasGps | null {
  const m = texto.match(RE_GPS);
  if (!m) return null;
  const latitude = parseFloat(m[1]);
  const longitude = parseFloat(m[2]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

export function extrairGpsDosItens(
  mensagem: string,
  itens: ItemDebounce[],
): CoordenadasGps | null {
  const direto = extrairCoordenadasGps(mensagem);
  if (direto) return direto;

  for (const item of [...itens].reverse()) {
    if (item.tipo !== 'localizacao') continue;
    const coords = extrairCoordenadasGps(item.conteudo);
    if (coords) return coords;
  }
  return null;
}

function montarCidadeUf(
  city?: string,
  town?: string,
  village?: string,
  state?: string,
): string | null {
  const local = city ?? town ?? village;
  if (!local) return null;
  const uf = state?.replace(/^Estado de\s+/i, '').trim();
  if (uf && uf.length <= 3) {
    return `${local} ${uf.toUpperCase()}`;
  }
  return local;
}

/** Reverse geocoding gratuito (OpenStreetMap). */
export async function resolverCidadePorGps(
  coords: CoordenadasGps,
): Promise<{ localizacao: string; latitude: number; longitude: number } | null> {
  const { latitude, longitude } = coords;
  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('lat', String(latitude));
  url.searchParams.set('lon', String(longitude));
  url.searchParams.set('format', 'json');
  url.searchParams.set('accept-language', 'pt-BR');
  url.searchParams.set('zoom', '10');

  try {
    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': 'iagmx-atendimento/1.0 (GMX logística)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      address?: {
        city?: string;
        town?: string;
        village?: string;
        state?: string;
        municipality?: string;
      };
    };
    const addr = body.address ?? {};
    const localizacao =
      montarCidadeUf(
        addr.city ?? addr.municipality,
        addr.town,
        addr.village,
        addr.state,
      ) ?? `lat ${latitude.toFixed(4)}, lng ${longitude.toFixed(4)}`;

    return { localizacao, latitude, longitude };
  } catch {
    return null;
  }
}
