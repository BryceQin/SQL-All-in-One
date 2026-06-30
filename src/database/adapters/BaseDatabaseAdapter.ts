import type {
    IDatabaseAdapter,
    IPoolStatus,
    ConnectionConfig,
    QueryResult,
    QueryParam,
    SqlStatement,
    DatabaseInfo,
    TableInfo,
    ViewInfo,
    FunctionInfo,
    ProcedureInfo,
    TriggerInfo,
    RoutineParameterInfo,
    TableStructure,
    DialectCapabilities,
    DataTypeCategory,
    ExplainResult,
    TestConnectionResult,
} from './IDatabaseAdapter';
import { t } from '../../i18n/index';
import { validateIdentifier } from './identifierValidator';

/**
 * Common interface implemented by per-dialect connection sub-adapters.
 *
 * The top-level BaseDatabaseAdapter delegates connect/disconnect/etc. to a
 * sub-adapter that satisfies this shape. Each dialect's XxxConnectionAdapter
 * already matches it structurally; we keep the type loose (structural) so the
 * sub-adapters do not have to import this file (which would create a cycle).
 */
export interface IConnectionSubAdapter {
    connect(config: ConnectionConfig): Promise<void>;
    disconnect(): Promise<void>;
    testConnection(config: ConnectionConfig): Promise<TestConnectionResult>;
    checkConnectionHealth(): Promise<boolean>;
    reapIdleConnections(): Promise<void>;
    formatConnectionError(error: unknown, config: ConnectionConfig): Error;
}

/**
 * Common interface implemented by per-dialect query sub-adapters.
 */
export interface IQuerySubAdapter {
    execute(sql: string, params?: QueryParam[]): Promise<QueryResult>;
    executeBatch(statements: SqlStatement[]): Promise<QueryResult[]>;
    beginTransaction(): Promise<void>;
    commit(): Promise<void>;
    rollback(): Promise<void>;
    cancelQuery(queryId: string): Promise<void>;
}

/**
 * Common interface implemented by per-dialect metadata sub-adapters.
 */
export interface IMetadataSubAdapter {
    listDatabases(): Promise<DatabaseInfo[]>;
    listSchemas(database?: string): Promise<string[]>;
    listTables(database?: string, schema?: string, filter?: string): Promise<TableInfo[]>;
    listViews(database?: string, schema?: string): Promise<ViewInfo[]>;
    listFunctions(database?: string, schema?: string): Promise<FunctionInfo[]>;
    listProcedures(database?: string, schema?: string): Promise<ProcedureInfo[]>;
    listTriggers(database?: string, schema?: string): Promise<TriggerInfo[]>;
}

/**
 * Common interface implemented by per-dialect schema sub-adapters.
 */
export interface ISchemaSubAdapter {
    describeTable(database: string, table: string, schema?: string): Promise<TableStructure>;
    getTableDDL(database: string, table: string, schema?: string): Promise<string>;
    getViewDDL(database: string, view: string, schema?: string): Promise<string>;
    getFunctionDDL(database: string, functionName: string, schema?: string): Promise<string>;
    getProcedureDDL(database: string, procedureName: string, schema?: string): Promise<string>;
    getTriggerDDL(database: string, triggerName: string, schema?: string): Promise<string>;
    getRoutineParameters(database: string, routineName: string, routineType: 'FUNCTION' | 'PROCEDURE', schema?: string): Promise<RoutineParameterInfo[]>;
    getExplainPlan(database: string, sql: string): Promise<ExplainResult>;
    getTableRowCount(database: string, table: string, schema?: string): Promise<number>;
    getDialectCapabilities(): DialectCapabilities;
    getSupportedDataTypes(): DataTypeCategory[];
    quoteIdentifier(identifier: string): string;
}

export abstract class BaseDatabaseAdapter implements IDatabaseAdapter {
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

    constructor(public config: ConnectionConfig) {
        this.connectionId = config.id;
    }

    // ── Common implementations ──────────────────────────────────────────

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

    // ── Default connection lifecycle ────────────────────────────────────
    //
    // These delegate to the dialect-specific sub-adapters wired up by the
    // concrete subclass via getConnectionAdapter() / getQueryAdapter() etc.
    // Subclasses may override individual methods when extra behavior (e.g.
    // SSH-tunnel setup, SQLite-specific path handling) is required.

    /**
     * Returns the dialect-specific connection sub-adapter. Concrete adapters
     * must implement this so the default connect/disconnect/etc. can delegate
     * to it.
     */
    protected abstract getConnectionAdapter(): IConnectionSubAdapter;

    async connect(config: ConnectionConfig): Promise<void> {
        if (this.isConnected_) {
            await this.disconnect();
        }

        this.config = config;
        this.connectionId = config.id;

        await this.getConnectionAdapter().connect(config);

        this.isConnected_ = true;
        this.updateActivity();

        const reapInterval = config.poolConfig?.reapInterval ?? 60000;
        const idleTimeout = config.poolConfig?.idleTimeout ?? 300000;
        this.startReapTimer(reapInterval, () => this.reapIdleConnections(idleTimeout));
    }

    async disconnect(): Promise<void> {
        this.stopReapTimer();
        await this.getConnectionAdapter().disconnect();
        this.isConnected_ = false;
        this.activeConnectionCount = 0;
        this.totalConnectionCount = 0;
    }

    async testConnection(config: ConnectionConfig): Promise<TestConnectionResult> {
        return this.getConnectionAdapter().testConnection(config);
    }

    async checkConnectionHealth(): Promise<boolean> {
        return this.getConnectionAdapter().checkConnectionHealth();
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
     */
    protected async reapIdleConnections(idleTimeout: number): Promise<void> {
        if (!this.isConnected_) return;
        const now = Date.now();
        if (now - this.lastActivityTime > idleTimeout) {
            const status = this.getPoolStatus();
            if (status.activeConnections === 0 && status.idleConnections > 0) {
                try {
                    await this.getConnectionAdapter().reapIdleConnections();
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

    // ── Default query/metadata/schema delegation ────────────────────────
    //
    // Each concrete adapter wires up query/metadata/schema sub-adapters in
    // its constructor. The defaults below simply forward the call so the
    // concrete adapter only has to implement the abstract getter(s) for the
    // sub-adapters it wires up.

    /** Returns the dialect-specific query sub-adapter. */
    protected abstract getQueryAdapter(): IQuerySubAdapter;
    /** Returns the dialect-specific metadata sub-adapter. */
    protected abstract getMetadataAdapter(): IMetadataSubAdapter;
    /** Returns the dialect-specific schema sub-adapter. */
    protected abstract getSchemaAdapter(): ISchemaSubAdapter;

    execute(sql: string, params?: QueryParam[]): Promise<QueryResult> {
        return this.getQueryAdapter().execute(sql, params);
    }

    executeBatch(statements: SqlStatement[]): Promise<QueryResult[]> {
        return this.getQueryAdapter().executeBatch(statements);
    }

    beginTransaction(): Promise<void> {
        return this.getQueryAdapter().beginTransaction();
    }

    commit(): Promise<void> {
        return this.getQueryAdapter().commit();
    }

    rollback(): Promise<void> {
        return this.getQueryAdapter().rollback();
    }

    cancelQuery(queryId: string): Promise<void> {
        return this.getQueryAdapter().cancelQuery(queryId);
    }

    listDatabases(): Promise<DatabaseInfo[]> {
        return this.getMetadataAdapter().listDatabases();
    }

    listSchemas(database?: string): Promise<string[]> {
        return this.getMetadataAdapter().listSchemas(database);
    }

    listTables(database?: string, schema?: string, filter?: string): Promise<TableInfo[]> {
        return this.getMetadataAdapter().listTables(database, schema, filter);
    }

    listViews(database?: string, schema?: string): Promise<ViewInfo[]> {
        return this.getMetadataAdapter().listViews(database, schema);
    }

    listFunctions(database?: string, schema?: string): Promise<FunctionInfo[]> {
        return this.getMetadataAdapter().listFunctions(database, schema);
    }

    listProcedures(database?: string, schema?: string): Promise<ProcedureInfo[]> {
        return this.getMetadataAdapter().listProcedures(database, schema);
    }

    listTriggers(database?: string, schema?: string): Promise<TriggerInfo[]> {
        return this.getMetadataAdapter().listTriggers(database, schema);
    }

    describeTable(database: string, table: string, schema?: string): Promise<TableStructure> {
        return this.getSchemaAdapter().describeTable(database, table, schema);
    }

    getTableDDL(database: string, table: string, schema?: string): Promise<string> {
        return this.getSchemaAdapter().getTableDDL(database, table, schema);
    }

    getViewDDL(database: string, view: string, schema?: string): Promise<string> {
        return this.getSchemaAdapter().getViewDDL(database, view, schema);
    }

    getFunctionDDL(database: string, functionName: string, schema?: string): Promise<string> {
        return this.getSchemaAdapter().getFunctionDDL(database, functionName, schema);
    }

    getProcedureDDL(database: string, procedureName: string, schema?: string): Promise<string> {
        return this.getSchemaAdapter().getProcedureDDL(database, procedureName, schema);
    }

    getTriggerDDL(database: string, triggerName: string, schema?: string): Promise<string> {
        return this.getSchemaAdapter().getTriggerDDL(database, triggerName, schema);
    }

    getRoutineParameters(database: string, routineName: string, routineType: 'FUNCTION' | 'PROCEDURE', schema?: string): Promise<RoutineParameterInfo[]> {
        return this.getSchemaAdapter().getRoutineParameters(database, routineName, routineType, schema);
    }

    getExplainPlan(database: string, sql: string): Promise<ExplainResult> {
        return this.getSchemaAdapter().getExplainPlan(database, sql);
    }

    getTableRowCount(database: string, table: string, schema?: string): Promise<number> {
        return this.getSchemaAdapter().getTableRowCount(database, table, schema);
    }

    getDialectCapabilities(): DialectCapabilities {
        return this.getSchemaAdapter().getDialectCapabilities();
    }

    getSupportedDataTypes(): DataTypeCategory[] {
        return this.getSchemaAdapter().getSupportedDataTypes();
    }

    quoteIdentifier(identifier: string): string {
        return this.getSchemaAdapter().quoteIdentifier(identifier);
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

    /**
     * Formats a connection error for display.
     *
     * Order of precedence:
     *   1. {@link formatDriverSpecificError} hook (dialect-specific codes).
     *   2. Common network-level errors (ECONNREFUSED, ETIMEDOUT, ...).
     *   3. The original error (or a wrapped Error for non-Error throws).
     */
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
