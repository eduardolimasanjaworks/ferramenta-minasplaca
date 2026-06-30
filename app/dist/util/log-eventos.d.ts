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
export declare function logEvento(categoria: string, mensagem: string, dados?: Record<string, unknown>, nivel?: NivelLog): void;
export declare function obterLogsRecentes(limite?: number, categoria?: string): EventoLog[];
export declare function contarLogsPorNivel(): Record<NivelLog, number>;
