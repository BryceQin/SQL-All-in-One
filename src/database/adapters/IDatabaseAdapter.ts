import type {
    ConnectionConfig,
    SSLConfig,
    SshConfig,
    ConnectionPoolConfig,
    ConnectionState,
    TestConnectionResult,
    ConnectionGroup,
} from '../connection/ConnectionConfig'

export type {
    ConnectionConfig,
    SSLConfig,
    SshConfig,
    ConnectionPoolConfig,
    ConnectionState,
    TestConnectionResult,
    ConnectionGroup,
}

export interface IPoolStatus {
    totalConnections: number;
    activeConnections: number;
    idleConnections: number;
    waitingRequests: number | 'unknown';
    connectionLimit: number;
    acquireTimeout: number;
}

export interface IConnectionAdapter {
    connect(config: ConnectionConfig): Promise<void>;
    disconnect(): Promise<void>;
    isConnected(): boolean;
    testConnection(config: ConnectionConfig): Promise<TestConnectionResult>;
    checkConnectionHealth(): Promise<boolean>;
    getConnectionId(): string;
    getPoolStatus(): IPoolStatus;
}

export interface IQueryAdapter {
    execute(sql: string, params?: QueryParam[]): Promise<QueryResult>;
    executeBatch(statements: SqlStatement[]): Promise<QueryResult[]>;
    beginTransaction(): Promise<void>;
    commit(): Promise<void>;
    rollback(): Promise<void>;
    cancelQuery(queryId: string): Promise<void>;
}

export interface IMetadataAdapter {
    listDatabases(): Promise<DatabaseInfo[]>;
    listSchemas(database?: string): Promise<string[]>;
    listTables(database?: string, schema?: string, filter?: string): Promise<TableInfo[]>;
    listViews(database?: string, schema?: string): Promise<ViewInfo[]>;
    listFunctions(database?: string, schema?: string): Promise<FunctionInfo[]>;
    listProcedures(database?: string, schema?: string): Promise<ProcedureInfo[]>;
    listTriggers(database?: string, schema?: string): Promise<TriggerInfo[]>;
}

export interface ISchemaAdapter {
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

export interface IDatabaseAdapter extends IConnectionAdapter, IQueryAdapter, IMetadataAdapter, ISchemaAdapter {}

export type QueryRow = Record<string, unknown>;

export interface QueryParam {
    name?: string;
    value: string | number | boolean | null | undefined;
    type?: string;
}

export interface SqlStatement {
    sql: string;
    params?: QueryParam[];
}

export interface QueryResult {
    queryId: string;
    status: 'success' | 'error';
    columns: ColumnMeta[];
    rows: QueryRow[];
    rowCount: number;
    affectedRows?: number;
    executionTime: number;
    error?: QueryError;
    database?: string;
}

export interface QueryError {
    code: string;
    message: string;
    sql?: string;
    position?: number;
}

export interface ColumnMeta {
    name: string;
    type: string;
    nullable: boolean;
    isPrimaryKey: boolean;
    isAutoIncrement: boolean;
    isEnum: boolean;
    enumValues?: string[];
    referencedTable?: string;
    comment?: string;
}

export interface DatabaseInfo {
    name: string;
    charset?: string;
    collation?: string;
}

export interface TableInfo {
    name: string;
    type: string;
    engine?: string;
    rowCount?: number;
    comment?: string;
}

export interface ViewInfo {
    name: string;
    definition?: string;
    comment?: string;
}

export interface FunctionInfo {
    name: string;
    returns?: string;
    definition?: string;
}

export interface ProcedureInfo {
    name: string;
    definition?: string;
}

export interface TriggerInfo {
    name: string;
    event: string;
    timing: string;
    statement: string;
}

export interface RoutineParameterInfo {
    name: string;
    type: string;
    direction: 'IN' | 'OUT' | 'INOUT';
}

export interface TableStructure {
    columns: ColumnInfo[];
    indexes: IndexInfo[];
    foreignKeys: ForeignKeyInfo[];
    triggers: TriggerInfo[];
    ddl?: string;
    rowCount?: number;
    engine?: string;
    charset?: string;
    comment?: string;
}

export interface ColumnInfo {
    name: string;
    type: string;
    length?: number;
    nullable: boolean;
    defaultValue?: string | number | boolean | null;
    isPrimaryKey: boolean;
    isAutoIncrement: boolean;
    isUnique: boolean;
    comment?: string;
    enumValues?: string[];
    referencedTable?: string;
}

export interface IndexInfo {
    name: string;
    type: string;
    columns: string[];
    isUnique: boolean;
    isPrimary: boolean;
}

export interface ForeignKeyInfo {
    name: string;
    columns: string[];
    referencedTable: string;
    referencedColumns: string[];
    onDelete: string;
    onUpdate: string;
}

export interface DialectCapabilities {
    supportsSchema: boolean;
    supportsMultipleDatabases: boolean;
    maxConcurrentQueries: number;
    supportsPreparedStatement: boolean;
    supportsExplain: boolean;
    supportsExplainAnalyze: boolean;
    supportsCancel: boolean;
    supportsSshTunnel: boolean;
    supportedObjectTypes: string[];
}

export interface DataTypeCategory {
    category: string;
    types: DataTypeInfo[];
}

export interface DataTypeInfo {
    name: string;
    needsLength?: boolean;
    needsPrecision?: boolean;
    needsScale?: boolean;
    defaultValue?: string | number | boolean;
}

export interface ExplainResult {
    format: string;
    raw: string;
    nodes: ExplainNode[];
}

export interface ExplainNode {
    id: string;
    operation: string;
    table?: string;
    rows?: number;
    cost?: number;
    key?: string;
    extra?: string;
    children: ExplainNode[];
}

export interface DialectMetadata {
    dialect: string;
    displayName: string;
    defaultPort: number;
    defaultUsername: string;
    iconKey: string;
    supportsSshTunnel: boolean;
    supportsSsl: boolean;
    isFileBased: boolean;
}

