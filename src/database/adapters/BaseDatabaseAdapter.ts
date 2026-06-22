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

    /**
     * Base error formatting for common network-level errors.
     * Subclasses should override to add dialect-specific error handling
     * and call super.formatConnectionError() as a fallback.
     */
    protected formatConnectionError(error: unknown, context: string): Error {
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

    // ── Abstract methods ─────────────────────────────────────────────────
    // Must be implemented by concrete database adapters.

    abstract connect(config: ConnectionConfig): Promise<void>;
    abstract disconnect(): Promise<void>;
    abstract testConnection(config: ConnectionConfig): Promise<TestConnectionResult>;
    abstract checkConnectionHealth(): Promise<boolean>;
    abstract execute(sql: string, params?: QueryParam[]): Promise<QueryResult>;
    abstract executeBatch(statements: SqlStatement[]): Promise<QueryResult[]>;
    abstract beginTransaction(): Promise<void>;
    abstract commit(): Promise<void>;
    abstract rollback(): Promise<void>;
    abstract cancelQuery(queryId: string): Promise<void>;
    abstract listDatabases(): Promise<DatabaseInfo[]>;
    abstract listSchemas(database?: string): Promise<string[]>;
    abstract listTables(database?: string, schema?: string, filter?: string): Promise<TableInfo[]>;
    abstract listViews(database?: string, schema?: string): Promise<ViewInfo[]>;
    abstract listFunctions(database?: string, schema?: string): Promise<FunctionInfo[]>;
    abstract listProcedures(database?: string, schema?: string): Promise<ProcedureInfo[]>;
    abstract listTriggers(database?: string, schema?: string): Promise<TriggerInfo[]>;
    abstract describeTable(database: string, table: string, schema?: string): Promise<TableStructure>;
    abstract getTableDDL(database: string, table: string, schema?: string): Promise<string>;
    abstract getViewDDL(database: string, view: string, schema?: string): Promise<string>;
    abstract getFunctionDDL(database: string, functionName: string, schema?: string): Promise<string>;
    abstract getProcedureDDL(database: string, procedureName: string, schema?: string): Promise<string>;
    abstract getTriggerDDL(database: string, triggerName: string, schema?: string): Promise<string>;
    abstract getRoutineParameters(database: string, routineName: string, routineType: 'FUNCTION' | 'PROCEDURE', schema?: string): Promise<RoutineParameterInfo[]>;
    abstract getExplainPlan(database: string, sql: string): Promise<ExplainResult>;
    abstract getTableRowCount(database: string, table: string, schema?: string): Promise<number>;
    abstract getDialectCapabilities(): DialectCapabilities;
    abstract getSupportedDataTypes(): DataTypeCategory[];
    abstract quoteIdentifier(identifier: string): string;
}
