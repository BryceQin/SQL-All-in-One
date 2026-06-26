import type { ConnectionConfig, QueryResult, QueryParam, SqlStatement, DatabaseInfo, TableInfo, ViewInfo, FunctionInfo, ProcedureInfo, TriggerInfo, RoutineParameterInfo, TableStructure, DialectCapabilities, DataTypeCategory, ExplainResult, TestConnectionResult } from './IDatabaseAdapter';
import { BaseDatabaseAdapter } from './BaseDatabaseAdapter';
import { DamengSharedContext } from './DamengSharedContext';
import { DamengConnectionAdapter } from './DamengConnectionAdapter';
import { DamengQueryAdapter } from './DamengQueryAdapter';
import { DamengMetadataAdapter } from './DamengMetadataAdapter';
import { DamengSchemaAdapter } from './DamengSchemaAdapter';

/**
 * Dameng (DM8) database adapter.
 *
 * Assembles the five Dameng sub-adapters (connection, query, metadata,
 * schema, shared context) and delegates the IDatabaseAdapter surface to
 * them. Dameng has no official Node.js driver, so the adapter bridges to the
 * database via the `odbc` npm package (2.4.x) together with the Dameng DM8
 * ODBC driver. The odbc driver is loaded lazily via dynamic import inside
 * the sub-adapters so it is only required when a Dameng connection is
 * actually used and stays in the esbuild `external` list.
 *
 * Dameng is largely Oracle-compatible at the metadata layer (ALL_* views,
 * DBMS_METADATA, v$session, etc.), so the metadata/schema sub-adapters
 * mirror the OracleAdapter structure and only differ in placeholder style
 * (ODBC `?` positional vs oracledb `:1` named binds).
 */
export class DamengAdapter extends BaseDatabaseAdapter {
    private shared: DamengSharedContext;
    private connectionAdapter: DamengConnectionAdapter;
    private queryAdapter: DamengQueryAdapter;
    private metadataAdapter: DamengMetadataAdapter;
    private schemaAdapter: DamengSchemaAdapter;

    constructor(config: ConnectionConfig) {
        super(config);
        this.shared = new DamengSharedContext(this);
        this.connectionAdapter = new DamengConnectionAdapter(this.shared);
        this.queryAdapter = new DamengQueryAdapter(this.shared);
        this.metadataAdapter = new DamengMetadataAdapter(
            this.shared,
            (sql, params) => this.queryAdapter.execute(sql, params)
        );
        this.schemaAdapter = new DamengSchemaAdapter(
            this.shared,
            (sql, params) => this.queryAdapter.execute(sql, params),
            (db, schema) => this.metadataAdapter.listTriggers(db, schema)
        );
    }

    // ── IConnectionAdapter ───────────────────────────────────────────────

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

    // isConnected, getConnectionId, getPoolStatus inherited from BaseDatabaseAdapter

    // ── IQueryAdapter ────────────────────────────────────────────────────

    execute(sql: string, params?: QueryParam[]): Promise<QueryResult> { return this.queryAdapter.execute(sql, params); }
    executeBatch(statements: SqlStatement[]): Promise<QueryResult[]> { return this.queryAdapter.executeBatch(statements); }
    beginTransaction(): Promise<void> { return this.queryAdapter.beginTransaction(); }
    commit(): Promise<void> { return this.queryAdapter.commit(); }
    rollback(): Promise<void> { return this.queryAdapter.rollback(); }
    cancelQuery(queryId: string): Promise<void> { return this.queryAdapter.cancelQuery(queryId); }

    // ── IMetadataAdapter ─────────────────────────────────────────────────

    listDatabases(): Promise<DatabaseInfo[]> { return this.metadataAdapter.listDatabases(); }
    listSchemas(database?: string): Promise<string[]> { return this.metadataAdapter.listSchemas(database); }
    listTables(database?: string, schema?: string, filter?: string): Promise<TableInfo[]> { return this.metadataAdapter.listTables(database, schema, filter); }
    listViews(database?: string, schema?: string): Promise<ViewInfo[]> { return this.metadataAdapter.listViews(database, schema); }
    listFunctions(database?: string, schema?: string): Promise<FunctionInfo[]> { return this.metadataAdapter.listFunctions(database, schema); }
    listProcedures(database?: string, schema?: string): Promise<ProcedureInfo[]> { return this.metadataAdapter.listProcedures(database, schema); }
    listTriggers(database?: string, schema?: string): Promise<TriggerInfo[]> { return this.metadataAdapter.listTriggers(database, schema); }

    // ── ISchemaAdapter ───────────────────────────────────────────────────

    describeTable(database: string, table: string, schema?: string): Promise<TableStructure> { return this.schemaAdapter.describeTable(database, table, schema); }
    getTableDDL(database: string, table: string, schema?: string): Promise<string> { return this.schemaAdapter.getTableDDL(database, table, schema); }
    getViewDDL(database: string, view: string, schema?: string): Promise<string> { return this.schemaAdapter.getViewDDL(database, view, schema); }
    getFunctionDDL(database: string, functionName: string, schema?: string): Promise<string> { return this.schemaAdapter.getFunctionDDL(database, functionName, schema); }
    getProcedureDDL(database: string, procedureName: string, schema?: string): Promise<string> { return this.schemaAdapter.getProcedureDDL(database, procedureName, schema); }
    getTriggerDDL(database: string, triggerName: string, schema?: string): Promise<string> { return this.schemaAdapter.getTriggerDDL(database, triggerName, schema); }
    getRoutineParameters(database: string, routineName: string, routineType: 'FUNCTION' | 'PROCEDURE', schema?: string): Promise<RoutineParameterInfo[]> { return this.schemaAdapter.getRoutineParameters(database, routineName, routineType, schema); }
    getExplainPlan(database: string, sql: string): Promise<ExplainResult> { return this.schemaAdapter.getExplainPlan(database, sql); }
    getTableRowCount(database: string, table: string, schema?: string): Promise<number> { return this.schemaAdapter.getTableRowCount(database, table, schema); }
    getDialectCapabilities(): DialectCapabilities { return this.schemaAdapter.getDialectCapabilities(); }
    getSupportedDataTypes(): DataTypeCategory[] { return this.schemaAdapter.getSupportedDataTypes(); }
    quoteIdentifier(identifier: string): string { return this.schemaAdapter.quoteIdentifier(identifier); }

    // ── Private helpers ──────────────────────────────────────────────────

    private async reapIdleConnections(idleTimeout: number): Promise<void> {
        if (!this.isConnected_) return;
        const now = Date.now();
        if (now - this.lastActivityTime > idleTimeout) {
            const status = this.getPoolStatus();
            if (status.activeConnections === 0 && status.idleConnections > 0) {
                try {
                    await this.connectionAdapter.reapIdleConnections();
                } catch (e) {
                    console.debug('[SQL All in One] Dameng reap idle connections error:', e);
                }
            }
        }
    }

    static getDialectMetadata(): import('./IDatabaseAdapter').DialectMetadata {
        return {
            dialect: 'dameng',
            displayName: '达梦 DM',
            defaultPort: 5236,
            defaultUsername: 'SYSDBA',
            iconKey: 'dameng',
            supportsSshTunnel: true,
            supportsSsl: false,
            isFileBased: false
        };
    }
}
