import type { Pool, Connection } from 'oracledb';
import type { ConnectionConfig } from './IDatabaseAdapter';
import type { BaseDatabaseAdapter } from './BaseDatabaseAdapter';
import type { IOracleDialectSharedContext } from './OracleSchemaAdapter';

/**
 * Oracle shared context.
 *
 * Holds the oracledb Pool and the transaction-scoped Connection used by the
 * query/schema adapters. Mirrors the structure of MysqlSharedContext and
 * SqlServerSharedContext but uses the oracledb driver types (Pool/Connection).
 *
 * The oracledb driver is loaded via dynamic import inside the sub-adapters so
 * it stays in the esbuild `external` list and is only required when an Oracle
 * connection is actually used.
 */
export class OracleSharedContext implements IOracleDialectSharedContext {
    // Oracle shared state
    pool: Pool | null = null;
    transactionConnection: Connection | null = null;
    activeQueryConnections = new Map<string, Connection>();

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
