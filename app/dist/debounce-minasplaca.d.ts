import type { ItemDebounce } from './lib/tipos.js';
export declare function adicionarAoDebounce(item: ItemDebounce): Promise<void>;
export declare function processarContato(remoteJid: string): Promise<void>;
export declare function iniciarWorkerDebounce(intervaloMs?: number): void;
