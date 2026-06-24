import type { ConnectionConfig, QueryResult, QueryParam, SqlStatement, DatabaseInfo, TableInfo, ViewInfo, FunctionInfo, ProcedureInfo, TriggerInfo, RoutineParameterInfo, TableStructure, DialectCapabilities, DataTypeCategory, ExplainResult, TestConnectionResult } from './IDatabaseAdapter';
import { BaseDatabaseAdapter } from './BaseDatabaseAdapter';
import { SqliteSharedContext } from './SqliteSharedContext';
import { SqliteConnectionAdapter } from './SqliteConnectionAdapter';
import { SqliteQueryAdapter } from './SqliteQueryAdapter';
import { SqliteMetadataAdapter } from './SqliteMetadataAdapter';
import { SqliteSchemaAdapter } from './SqliteSchemaAdapter';

export class SqliteAdapter extends BaseDatabaseAdapter {
    private shared: SqliteSharedContext;
    private connectionAdapter: SqliteConnectionAdapter;
    private queryAdapter: SqliteQueryAdapter;
    private metadataAdapter: SqliteMetadataAdapter;
    private schemaAdapter: SqliteSchemaAdapter;

    constructor(config: ConnectionConfig) {
        super(config);
        this.shared = new SqliteSharedContext(this);
        this.connectionAdapter = new SqliteConnectionAdapter(this.shared);
        this.queryAdapter = new SqliteQueryAdapter(this.shared);
        this.metadataAdapter = new SqliteMetadataAdapter(
            (sql, params) => this.queryAdapter.execute(sql, params)
        );
        this.schemaAdapter = new SqliteSchemaAdapter(
            (sql, params) => this.queryAdapter.execute(sql, params),
            (db, schema) => this.metadataAdapter.listTriggers(db, schema)
        );
    }

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

    execute(sql: string, params?: QueryParam[]): Promise<QueryResult> { return this.queryAdapter.execute(sql, params); }
    executeBatch(statements: SqlStatement[]): Promise<QueryResult[]> { return this.queryAdapter.executeBatch(statements); }
    beginTransaction(): Promise<void> { return this.queryAdapter.beginTransaction(); }
    commit(): Promise<void> { return this.queryAdapter.commit(); }
    rollback(): Promise<void> { return this.queryAdapter.rollback(); }
    cancelQuery(queryId: string): Promise<void> { return this.queryAdapter.cancelQuery(queryId); }

    listDatabases(): Promise<DatabaseInfo[]> { return this.metadataAdapter.listDatabases(); }
    listSchemas(database?: string): Promise<string[]> { return this.metadataAdapter.listSchemas(database); }
    listTables(database?: string, schema?: string, filter?: string): Promise<TableInfo[]> { return this.metadataAdapter.listTables(database, schema, filter); }
    listViews(database?: string, schema?: string): Promise<ViewInfo[]> { return this.metadataAdapter.listViews(database, schema); }
    listFunctions(database?: string, schema?: string): Promise<FunctionInfo[]> { return this.metadataAdapter.listFunctions(database, schema); }
    listProcedures(database?: string, schema?: string): Promise<ProcedureInfo[]> { return this.metadataAdapter.listProcedures(database, schema); }
    listTriggers(database?: string, schema?: string): Promise<TriggerInfo[]> { return this.metadataAdapter.listTriggers(database, schema); }

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

    private async reapIdleConnections(_idleTimeout: number): Promise<void> {
        if (!this.isConnected_) return;
        try {
            await this.connectionAdapter.reapIdleConnections();
        } catch (e) {
            console.debug('[SQL All in One] SQLite reap idle connections error:', e);
        }
    }

    static getDialectMetadata(): import('./IDatabaseAdapter').DialectMetadata {
        return {
            dialect: 'sqlite',
            displayName: 'SQLite',
            defaultPort: 0,
            defaultUsername: '',
            iconKey: 'sqlite',
            supportsSshTunnel: false,
            supportsSsl: false,
            isFileBased: true
        };
    }
}
