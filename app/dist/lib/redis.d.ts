/**
 * Cliente Redis compartilhado — evita múltiplas conexões e erros "Unhandled error event".
 */
import { Redis } from 'ioredis';
/** Singleton ioredis — use em todos os serviços. */
export declare function obterRedis(): Redis;
export declare function pingRedis(): Promise<boolean>;
