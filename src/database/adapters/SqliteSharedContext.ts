import type Database from 'better-sqlite3';
import type { ConnectionConfig } from './IDatabaseAdapter';
import type { BaseDatabaseAdapter } from './BaseDatabaseAdapter';

export class SqliteSharedContext {
    db: Database.Database | null = null;
    inTransaction = false;

    private adapter: BaseDatabaseAdapter;

    constructor(adapter: BaseDatabaseAdapter) {
        this.adapter = adapter;
    }

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
