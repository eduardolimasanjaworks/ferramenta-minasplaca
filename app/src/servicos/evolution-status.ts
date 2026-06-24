/**
 * Regras pequenas para reconciliar estados incoerentes da Evolution API.
 * Mantem a decisao isolada para teste deterministico sem depender de HTTP.
 * Evita falso "aguardando QR" quando a instancia ja consta como aberta.
 */
export interface EvolutionStatusInput {
  connectionState?: string | null;
  fetchConnectionStatus?: string | null;
  hasOwnerJid?: boolean;
  hasProfileName?: boolean;
  fetchDisconnectionReasonCode?: number | null;
  hasDisconnectionObject?: boolean;
}

export interface EvolutionStatusOutput {
  state: string;
  conectado: boolean;
  fonte: 'connectionState' | 'fetchInstances' | 'fallback';
}

const OPEN_STATES = new Set(['open', 'connected']);

function normalizarEstado(valor?: string | null): string {
  return String(valor ?? '')
    .trim()
    .toLowerCase();
}

export function resolverStatusEvolution(input: EvolutionStatusInput): EvolutionStatusOutput {
  const state = normalizarEstado(input.connectionState);
  const fetchState = normalizarEstado(input.fetchConnectionStatus);
  const hasIdentity = Boolean(input.hasOwnerJid || input.hasProfileName);
  const hasDisconnectionMarker =
    typeof input.fetchDisconnectionReasonCode === 'number'
    || Boolean(input.hasDisconnectionObject);
  const fetchLooksOpen = OPEN_STATES.has(fetchState) && hasIdentity;

  if (OPEN_STATES.has(state)) {
    return { state: 'open', conectado: true, fonte: 'connectionState' };
  }

  if (state) {
    if (fetchLooksOpen && hasDisconnectionMarker) {
      return { state: 'stale_open', conectado: false, fonte: 'connectionState' };
    }
    return { state, conectado: false, fonte: 'connectionState' };
  }

  if (fetchLooksOpen && !hasDisconnectionMarker) {
    return { state: 'open', conectado: true, fonte: 'fetchInstances' };
  }

  if (fetchState) {
    if (fetchLooksOpen && hasDisconnectionMarker) {
      return { state: 'stale_open', conectado: false, fonte: 'fetchInstances' };
    }
    return { state: fetchState, conectado: false, fonte: 'fetchInstances' };
  }

  return { state: 'desconhecido', conectado: false, fonte: 'fallback' };
}
