/**
 * Configuracao central — Minas Placa (clean).
 */
export declare const config: {
    porta: number;
    buildId: string;
    openrouterToken: string | undefined;
    openrouterHabilitado: boolean;
    modeloChat: string;
    evolutionUrl: string;
    evolutionApiKey: string;
    evolutionInstance: string;
    databaseUrl: string;
    redisUrl: string;
    qdrantUrl: string;
    directusUrl: string;
    directusToken: string | undefined;
    adminKey: string;
    adminEmail: string;
    adminPassword: string;
    promptPadrao: string;
    promptArquivoInicial: string[];
    debounceMs: number;
};
