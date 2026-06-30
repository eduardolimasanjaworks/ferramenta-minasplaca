export declare function obterStatusConexao(instance: string): Promise<{
    conectado: boolean;
    state?: string;
}>;
export declare function enviarTextoSimples(instance: string, telefone: string, texto: string): Promise<void>;
export declare function enviarRespostaFragmentada(instance: string, telefone: string, textoCompleto: string, opts?: {
    fragmentar?: boolean;
    ignorarDigitando?: boolean;
}): Promise<number>;
export declare function tentarEnviarResposta(telefone: string, textoCompleto: string, instance: string, opts?: {
    remoteJid?: string;
    mensagensEntrada?: number;
    fragmentar?: boolean;
}): Promise<{
    enviado: boolean;
    fragmentos: number;
    motivo?: string;
}>;
