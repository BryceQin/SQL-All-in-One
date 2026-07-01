import type {
    IConnectionAdapter,
    IConnectionLifecycle,
    IQueryAdapter,
    IMetadataAdapter,
    ISchemaAdapter,
    IPoolStatus,
    ConnectionConfig,
    TestConnectionResult,
} from './IDatabaseAdapter';
import { BaseSharedContext } from './BaseSharedContext';
import { t } from '../../i18n/index';
import { validateIdentifier } from './identifierValidator';

/**
 * Shared base class for per-dialect top-level database adapters.
 *
 * Each concrete dialect's `XxxAdapter` extends this class and supplies 5
 * factory methods ({@link createSharedContext}, {@link createConnectionAdapter},
 * {@link createQueryAdapter}, {@link createMetadataAdapter},
 * {@link createSchemaAdapter}) that instantiate the dialect-specific
 * sub-adapters. The base class wires the resulting instances into 5
 * `public` fields:
 *
 *   - {@link shared} — dialect-specific shared context (pool, transaction
 *     connection, ...).
 *   - {@link connectionAdapter} — driver-level connect/disconnect/test/
 *     health/reap operations ({@link IConnectionLifecycle}).
 *   - {@link queryAdapter} — execute / executeBatch / transaction control /
 *     cancel / executeStream ({@link IQueryAdapter}).
 *   - {@link metadataAdapter} — list databases/schemas/tables/views/
 *     functions/procedures/triggers ({@link IMetadataAdapter}).
 *   - {@link schemaAdapter} — describeTable / DDL getters / explain plan /
 *     dialect capabilities / identifier quoting ({@link ISchemaAdapter}).
 *
 * The aggregated {@link IDatabaseAdapter} surface is split: connection
 * status methods (isConnected / getConnectionId / getPoolStatus) and the
 * lifecycle methods (connect / disconnect / testConnection /
 * checkConnectionHealth) are implemented here on the base class (the
 * lifecycle ones delegate to {@link connectionAdapter}). The query /
 * metadata / schema surfaces are accessed by external callers directly via
 * the public sub-adapter fields, e.g. `adapter.queryAdapter.execute(...)`,
 * `adapter.metadataAdapter.listTables(...)` and
 * `adapter.schemaAdapter.describeTable(...)`. This eliminates the prior 25-line forwarding block
 * and the 4 duplicate `IConnectionSubAdapter` / `IQuerySubAdapter` /
 * `IMetadataSubAdapter` / `ISchemaSubAdapter` interfaces (the public
 * {@link IDatabaseAdapter.ts} interfaces are used directly instead).
 *
 * The base class retains the truly shared logic: connection-state tracking,
 * pool-status reporting, the reap-idle timer, the default connect/disconnect/
 * testConnection/checkConnectionHealth lifecycle (which delegate to
 * {@link connectionAdapter}), the common network-error branch of
 * {@link formatConnectionError}, and {@link validateIdentifier}.
 *
 * Generic over the dialect-specific shared-context type `TShared` so that
 * subclasses' factory methods can return the concrete shared-context
 * subclass (e.g. `MysqlSharedContext`) rather than the abstract base.
 */
export abstract class BaseDatabaseAdapter<TShared extends BaseSharedContext = BaseSharedContext>
        implements IConnectionAdapter {
    /** @internal Tracked by subclasses via connect/disconnect lifecycle */
    protected isConnected_ = false;
    /** @internal Updated by updateActivity() and sub-adapter operations */
    public lastActivityTime = 0;
    /** @internal Self-tracking counter for active pool connections */
    public activeConnectionCount = 0;
    /** @internal Self-tracking counter for total pool connections */
    public totalConnectionCount = 0;
    /** @internal Managed by startReapTimer/stopReapTimer */
    public reapTimer: ReturnType<typeof setInterval> | null = null;
    protected connectionId: string;

    /**
     * Dialect-specific sub-adapters. Declared `public` so external callers
     * can reach the query / metadata / schema / connection-lifecycle surfaces
     * directly (`adapter.queryAdapter.execute(...)`,
     * `adapter.metadataAdapter.listTables(...)`, ...) instead of going
     * through 25 forwarding methods on the base class.
     *
     * The aggregated {@link IDatabaseAdapter} interface still works because
     * connection status (isConnected / getConnectionId / getPoolStatus) and
     * the connect/disconnect/testConnection/checkConnectionHealth lifecycle
     * are implemented on this base class — callers using those via
     * `adapter.connect(...)` / `adapter.isConnected()` continue to work
     * unchanged.
     */
    public shared: TShared;
    public connectionAdapter: IConnectionLifecycle;
    public queryAdapter: IQueryAdapter;
    public metadataAdapter: IMetadataAdapter;
    public schemaAdapter: ISchemaAdapter;

    constructor(public config: ConnectionConfig) {
        this.connectionId = config.id;
        // Order matters: createSharedContext must run first (the next four
        // factories reference this.shared), and createMetadataAdapter's
        // closure captures this.queryAdapter, so query must be initialised
        // before metadata; similarly schema's closure captures both
        // queryAdapter and metadataAdapter.
        this.shared = this.createSharedContext();
        this.connectionAdapter = this.createConnectionAdapter();
        this.queryAdapter = this.createQueryAdapter();
        this.metadataAdapter = this.createMetadataAdapter();
        this.schemaAdapter = this.createSchemaAdapter();
    }

    // ── Sub-adapter factories (implemented by concrete dialects) ────────

    protected abstract createSharedContext(): TShared;
    protected abstract createConnectionAdapter(): IConnectionLifecycle;
    protected abstract createQueryAdapter(): IQueryAdapter;
    protected abstract createMetadataAdapter(): IMetadataAdapter;
    protected abstract createSchemaAdapter(): ISchemaAdapter;

    // ── IConnectionAdapter: status methods (owned by base) ──────────────

    isConnected(): boolean {
        return this.isConnected_;
    }

    getConnectionId(): string {
        return this.connectionId;
    }

    getPoolStatus(): IPoolStatus {
        return {
            totalConnections: this.totalConnectionCount,
            activeConnections: this.activeConnectionCount,
            idleConnections: Math.max(0, this.totalConnectionCount - this.activeConnectionCount),
            waitingRequests: 0,
            connectionLimit: this.config.poolConfig?.maxConnections ?? 5,
            acquireTimeout: this.config.poolConfig?.acquireTimeout ?? 60000,
        };
    }

    protected updateActivity(): void {
        this.lastActivityTime = Date.now();
    }

    protected startReapTimer(interval: number, reapCallback: () => Promise<void>): void {
        this.stopReapTimer();
        this.reapTimer = setInterval(() => {
            reapCallback();
        }, interval);
    }

    protected stopReapTimer(): void {
        if (this.reapTimer) {
            clearInterval(this.reapTimer);
            this.reapTimer = null;
        }
    }

    // ── IConnectionAdapter: lifecycle (delegate to connectionAdapter) ───
    //
    // These delegate to {@link connectionAdapter}. Subclasses may override
    // individual methods when extra behavior (e.g. SSH-tunnel setup,
    // SQLite-specific path handling) is required.

    async connect(config: ConnectionConfig): Promise<void> {
        if (this.isConnected_) {
            await this.disconnect();
        }

        this.config = config;
        this.connectionId = config.id;

        await this.connectionAdapter.connect(config);

        this.isConnected_ = true;
        this.updateActivity();

        const reapInterval = config.poolConfig?.reapInterval ?? 60000;
        const idleTimeout = config.poolConfig?.idleTimeout ?? 300000;
        this.startReapTimer(reapInterval, () => this.reapIdleConnections(idleTimeout));
    }

    async disconnect(): Promise<void> {
        this.stopReapTimer();
        await this.connectionAdapter.disconnect();
        this.isConnected_ = false;
        this.activeConnectionCount = 0;
        this.totalConnectionCount = 0;
    }

    async testConnection(config: ConnectionConfig): Promise<TestConnectionResult> {
        return this.connectionAdapter.testConnection(config);
    }

    async checkConnectionHealth(): Promise<boolean> {
        return this.connectionAdapter.checkConnectionHealth();
    }

    /**
     * Default idle-connection reaper. Mirrors the prior per-adapter logic:
     * if the pool has been idle longer than {@link idleTimeout} and no
     * queries are active, ask the connection sub-adapter to reap idle
     * connections. Sub-adapter reapIdleConnections() implementations are
     * no-ops for drivers that manage their own eviction (mysql2, pg, mssql,
     * oracledb, odbc) but are kept for API compatibility.
     *
     * Concrete adapters can override {@link getReapLogPrefix} to add a
     * dialect-specific prefix to the debug log line (e.g. `PG`, `SQLite`),
     * or override this method entirely to drop the idle-check (SQLite reaps
     * unconditionally).
     *
     * Not part of {@link IDatabaseAdapter}; only invoked internally by the
     * reap timer started in {@link connect}.
     */
    protected async reapIdleConnections(idleTimeout: number): Promise<void> {
        if (!this.isConnected_) return;
        const now = Date.now();
        if (now - this.lastActivityTime > idleTimeout) {
            const status = this.getPoolStatus();
            if (status.activeConnections === 0 && status.idleConnections > 0) {
                try {
                    await this.connectionAdapter.reapIdleConnections();
                } catch (e) {
                    const prefix = this.getReapLogPrefix();
                    const label = prefix ? `${prefix} ` : '';
                    console.debug(`[SQL All in One] ${label}Reap idle connections error:`, e);
                }
            }
        }
    }

    /**
     * Optional dialect-specific prefix injected into the reap-idle debug
     * log line. Returns an empty string by default (matching MySQL's prior
     * log format); concrete adapters override it to preserve dialect labels
     * such as `PG`, `SQLite`, `StarRocks`, `SQL Server`, `Oracle`, `Dameng`.
     */
    protected getReapLogPrefix(): string {
        return '';
    }

    // ── Shared connection error formatting ──────────────────────────────
    //
    // The default implementation handles common network-level errors that
    // every driver surfaces (ECONNREFUSED, ETIMEDOUT, EHOSTUNREACH,
    // ENOTFOUND). Dialect-specific connection sub-adapters override the
    // hook method {@link formatDriverSpecificError} to add dialect-specific
    // error-code handling (e.g. MySQL ER_ACCESS_DENIED_ERROR, Oracle
    // ORA-01017). The hook returns `undefined` when it has no dialect
    // mapping, in which case the network-level fallbacks below apply.
    //
    // Note: this is a legacy convenience helper kept for adapters that do
    // not yet extend {@link BaseConnectionAdapter} (which provides its own
    // `formatConnectionError`). It is `protected` and therefore not part of
    // the {@link IDatabaseAdapter} surface.

    protected formatConnectionError(error: unknown, context: string): Error {
        const driverSpecific = this.formatDriverSpecificError(error, context);
        if (driverSpecific) {
            return driverSpecific;
        }

        const msg = error instanceof Error ? error.message : String(error);

        if (msg.includes('ECONNREFUSED')) {
            return new Error(t('database.connectionRefused', context));
        }
        if (msg.includes('ETIMEDOUT') || msg.includes('connectTimeout')) {
            return new Error(t('database.connectionTimedOut', context));
        }
        if (msg.includes('EHOSTUNREACH')) {
            return new Error(t('database.hostUnreachable', context));
        }
        if (msg.includes('ENOTFOUND')) {
            return new Error(t('database.hostNotFound', context));
        }

        return error instanceof Error ? error : new Error(msg);
    }

    /**
     * Dialect-specific error-code mapping hook.
     *
     * Override this in a concrete adapter (or a connection sub-adapter that
     * also extends BaseDatabaseAdapter) to map driver-specific error codes
     * (ER_ACCESS_DENIED_ERROR, ORA-01017, mssql ELOGIN, ...) to localized
     * user-facing messages. Return `undefined` to fall back to the common
     * network-error handling in {@link formatConnectionError}.
     *
     * The default implementation handles SSL/certificate errors shared by
     * every TLS-capable driver so subclasses do not have to repeat it.
     */
    protected formatDriverSpecificError(_error: unknown, _context: string): Error | undefined {
        const msg = _error instanceof Error ? _error.message : String(_error);
        if (msg.includes('self signed certificate') || msg.includes('certificate') || msg.includes('SSL')) {
            return new Error(t('database.sslError', _context));
        }
        return undefined;
    }

    // ── Shared identifier validation ────────────────────────────────────
    //
    // Used by schema sub-adapters. The default maximum identifier length is
    // 128 (Oracle/SQL Server/Dameng). MySQL/StarRocks (64) and PostgreSQL
    // (no fixed cap; 63 by default for unquoted names) override by passing
    // an explicit maxLength.

    /**
     * Validates that an identifier is a non-empty string with no null bytes
     * and within the dialect's maximum identifier length.
     *
     * @throws Error when the identifier is empty, too long, or contains a
     *     NUL byte.
     */
    protected validateIdentifier(identifier: string, maxLength = 128): void {
        validateIdentifier(identifier, maxLength);
    }
}
