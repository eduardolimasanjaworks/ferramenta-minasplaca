import type { RegistroHistorico } from './lib/tipos.js';
export declare function inicializarBancoHistorico(): Promise<void>;
export declare function obterHistorico(telefone: string, limite?: number): Promise<RegistroHistorico[]>;
export declare function adicionarAoHistorico(telefone: string, mensagens: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
}>): Promise<void>;
