import type { RegistroHistorico } from './lib/tipos.js';
interface OpcoesResposta {
    telefone: string;
    mensagem: string;
    historico: RegistroHistorico[];
    pushName?: string;
}
export declare function gerarRespostaAgente(opts: OpcoesResposta): Promise<string>;
export {};
