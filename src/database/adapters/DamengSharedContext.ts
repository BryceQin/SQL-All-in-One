import type { Pool, Connection } from 'odbc';
import type { ConnectionConfig } from './IDatabaseAdapter';
import type { BaseDatabaseAdapter } from './BaseDatabaseAdapter';

/**
 * Dameng (DM8) shared context.
 *
 * Holds the odbc Pool and the transaction-scoped Connection used by the
 * query/schema adapters. Mirrors the structure of OracleSharedContext and
 * SqlServerSharedContext but uses the `odbc` npm package types (Pool /
 * Connection) since Dameng has no official Node.js driver and is reached
 * through its ODBC driver.
 *
 * The odbc driver is loaded via dynamic import inside the sub-adapters so
 * it stays in the esbuild `external` list and is only required when a
 * Dameng connection is actually used.
 */
export class DamengSharedContext {
    // Dameng shared state (odbc Pool / Connection)
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
