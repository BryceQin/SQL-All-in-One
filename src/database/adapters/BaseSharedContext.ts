import type { ConnectionConfig } from "./IDatabaseAdapter";
import type { BaseDatabaseAdapter } from "./BaseDatabaseAdapter";

/**
 * Common base class for per-dialect shared contexts.
 *
 * Each dialect's `XxxSharedContext` (Mysql / Starrocks / Postgres / SqlServer
 * / Oracle / Dameng / Sqlite) holds a reference to its owning
 * {@link BaseDatabaseAdapter} and delegates a fixed set of common state
 * (config / connectionId / activity counters / reap timer) to it. The
 * delegating getters and setters were previously copy-pasted across all
 * seven context classes; they are centralised here so each dialect only has
 * to declare its driver-specific fields (pool, transaction connection,
 * active-query tracking map, ...).
 *
 * Subclasses are expected to:
 *   1. Declare their driver-specific state (pool, transactionConnection, ...).
 *   2. Pass the `adapter` argument through to `super(adapter)`.
 *
 * Subclasses may also implement additional structural interfaces
 * ({@link IMysqlProtocolSharedContext}, {@link IOracleDialectSharedContext})
 * to satisfy the generic constraints of the dialect-specific query/schema
 * adapters; this base class deliberately only owns the truly universal
 * adapter-delegated state.
 */
export abstract class BaseSharedContext {
    /**
     * Reference to the owning adapter. Sub-adapter collaborators (query,
     * schema, metadata, connection) reach the adapter through this reference
     * to read/write the common state exposed below.
     *
     * Kept as a protected field (rather than a constructor parameter) so that
     * subclasses can access it directly if they need to call adapter methods
     * beyond the delegated getters.
     */
    protected adapter: BaseDatabaseAdapter;

    constructor(adapter: BaseDatabaseAdapter) {
        this.adapter = adapter;
    }

    // ── Adapter-delegated common state ──────────────────────────────────

    get config(): ConnectionConfig {
        return this.adapter.config;
    }
    get connectionId(): string {
        return this.adapter.getConnectionId();
    }

    get activeConnectionCount(): number {
        return this.adapter.activeConnectionCount;
    }
    set activeConnectionCount(v: number) {
        this.adapter.activeConnectionCount = v;
    }

    get totalConnectionCount(): number {
        return this.adapter.totalConnectionCount;
    }
    set totalConnectionCount(v: number) {
        this.adapter.totalConnectionCount = v;
    }

    get lastActivityTime(): number {
        return this.adapter.lastActivityTime;
    }
    set lastActivityTime(v: number) {
        this.adapter.lastActivityTime = v;
    }

    get reapTimer(): ReturnType<typeof setInterval> | null {
        return this.adapter.reapTimer;
    }
    set reapTimer(v: ReturnType<typeof setInterval> | null) {
        this.adapter.reapTimer = v;
    }
}
