import type { ConnectionPool, Request, Transaction } from 'mssql';
import type { ConnectionConfig } from './IDatabaseAdapter';
import type { BaseDatabaseAdapter } from './BaseDatabaseAdapter';

/**
 * SQL Server shared context.
 *
 * Holds the mssql ConnectionPool and the transaction-scoped Request used by
 * the query/schema adapters. Mirrors the structure of MysqlSharedContext but
 * uses the mssql driver types (ConnectionPool/Request/Transaction).
 */
export class SqlServerSharedContext {
    // SQL Server shared state
    pool: ConnectionPool | null = null;
    transaction: Transaction | null = null;
    activeRequests = new Map<string, Request>();

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
