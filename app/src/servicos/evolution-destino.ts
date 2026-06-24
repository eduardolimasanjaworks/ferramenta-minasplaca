/**
 * Resolve o servidor Evolution correto para uma instance especifica.
 * Evita prender envio, digitacao e midia ao servidor local quando o inbound
 * veio do numero oficial hospedado em outra Evolution.
 */
import { config } from '../config.js';
import { listarAlvosWhatsapp } from './whatsapp-targets.js';

export interface AlvoEvolutionBasico {
  nomeLogico: string;
  url: string;
  apiKey: string;
  instancia: string;
  origem: string;
}

export interface DestinoEvolution {
  nomeLogico: string | null;
  url: string;
  apiKey: string;
  instancia: string;
  origem: string;
}

export function resolverDestinoEvolutionPorInstancia(
  instance: string | undefined,
  alvos: AlvoEvolutionBasico[],
  fallback: Omit<DestinoEvolution, 'instancia'> & { instanciaPadrao: string },
): DestinoEvolution {
  const chave = String(instance ?? '').trim().toLowerCase();
  const alvo =
    chave
      ? alvos.find((item) => item.instancia.trim().toLowerCase() === chave) ?? null
      : null;

  if (alvo) {
    return {
      nomeLogico: alvo.nomeLogico,
      url: alvo.url,
      apiKey: alvo.apiKey,
      instancia: alvo.instancia,
      origem: alvo.origem,
    };
  }

  return {
    nomeLogico: fallback.nomeLogico,
    url: fallback.url,
    apiKey: fallback.apiKey,
    instancia: String(instance ?? '').trim() || fallback.instanciaPadrao,
    origem: fallback.origem,
  };
}

export function resolverDestinoEvolution(instance?: string): DestinoEvolution {
  return resolverDestinoEvolutionPorInstancia(instance, listarAlvosWhatsapp(), {
    nomeLogico: null,
    url: config.evolutionUrl,
    apiKey: config.evolutionApiKey,
    instanciaPadrao: config.evolutionInstance,
    origem: config.whatsappIaOrigem,
  });
}
