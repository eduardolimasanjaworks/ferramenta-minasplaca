/**
 * Log estruturado em memória + console (últimos N eventos para diagnóstico).
 */
export type NivelLog = 'info' | 'warn' | 'error' | 'debug';

export interface EventoLog {
  ts: number;
  nivel: NivelLog;
  categoria: string;
  mensagem: string;
  dados?: Record<string, unknown>;
}

const MAX = 500;
const buffer: EventoLog[] = [];

export function logEvento(
  categoria: string,
  mensagem: string,
  dados?: Record<string, unknown>,
  nivel: NivelLog = 'info',
): void {
  const ev: EventoLog = { ts: Date.now(), nivel, categoria, mensagem, dados };
  buffer.push(ev);
  if (buffer.length > MAX) buffer.shift();

  const prefix = `[${categoria}]`;
  const extra = dados ? ` ${JSON.stringify(dados)}` : '';
  if (nivel === 'error') console.error(prefix, mensagem, extra);
  else if (nivel === 'warn') console.warn(prefix, mensagem, extra);
  else console.log(prefix, mensagem, extra);
}

export function obterLogsRecentes(limite = 100, categoria?: string): EventoLog[] {
  let lista = buffer;
  if (categoria) lista = lista.filter((e) => e.categoria === categoria);
  return lista.slice(-limite);
}

export function contarLogsPorNivel(): Record<NivelLog, number> {
  const c: Record<NivelLog, number> = { info: 0, warn: 0, error: 0, debug: 0 };
  for (const e of buffer) c[e.nivel]++;
  return c;
}
