import type { Pool, PoolConnection } from 'mysql2/promise';
import type { ConnectionConfig } from './IDatabaseAdapter';
import { generateShortId } from '../../utils/idGenerator';

export class MysqlSharedContext {
    pool: Pool | null = null;
    config: ConnectionConfig | null = null;
    connectionId: string;
    activeQueryThreadIds = new Map<string, number>();
    activeConnectionCount = 0;
    totalConnectionCount = 0;
    lastActivityTime = 0;
    reapTimer: ReturnType<typeof setInterval> | null = null;
    transactionConnection: PoolConnection | null = null;

    constructor(config: ConnectionConfig) {
        this.config = config;
        this.connectionId = generateShortId('conn');
    }
}
