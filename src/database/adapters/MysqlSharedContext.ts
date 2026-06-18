import type { Pool, PoolConnection } from 'mysql2/promise';
import type { ConnectionConfig } from './IDatabaseAdapter';
import type { BaseDatabaseAdapter } from './BaseDatabaseAdapter';

export class MysqlSharedContext {
    // MySQL-specific state
    pool: Pool | null = null;
    transactionConnection: PoolConnection | null = null;
    activeQueryThreadIds = new Map<string, number>();

    // Reference to adapter for common state access
    private adapter: BaseDatabaseAdapter;

    constructor(adapter: BaseDatabaseAdapter) {
        this.adapter = adapter;
    }

    // Delegate common state to adapter (BaseDatabaseAdapter)
    get config(): ConnectionConfig { return this.adapter.config; }
    get connectionId(): string { return this.adapter.getConnectionId(); }
    get activeConnectionCount(): number { return this.adapter.activeConnectionCount; }
    set activeConnectionCount(v: number) { this.adapter.activeConnectionCount = v; }
    get totalConnectionCount(): number { return this.adapter.totalConnectionCount; }
    set totalConnectionCount(v: number) { this.adapter.totalConnectionCount = v; }
    get lastActivityTime(): number { return this.adapter.lastActivityTime; }
    set lastActivityTime(v: number) { this.adapter.lastActivityTime = v; }
    get reapTimer(): ReturnType<typeof setInterval> | null { return this.adapter.reapTimer; }
    set reapTimer(v: ReturnType<typeof setInterval> | null) { this.adapter.reapTimer = v; }
}
