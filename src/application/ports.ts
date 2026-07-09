import type { ConnectionState } from '../shared/treeNodeTypes';
import type { ForeignKeyOption, PendingChange } from '../shared/editTypes';
import type { ConnectionConfig, ConnectionGroup, TestConnectionResult } from '../database/connection/ConnectionConfig';

// ─── Connection ────────────────────────────────────────────────────────────

export interface ConnectionInfo {
    id: string;
    name: string;
    host: string;
    port: number;
    database: string;
    dialect?: string;
    color?: string;
    state: ConnectionState;
}

/**
 * Event payloads emitted by {@link IConnectionService}. These mirror the
 * concrete event types defined by `ConnectionManager` so views-layer
 * consumers can subscribe without importing the database layer.
 */
export interface ConnectionEvent {
    type: 'add' | 'remove' | 'update';
    connectionId: string;
}

export interface ConnectionStateEvent {
    connectionId: string;
    oldState: ConnectionState;
    newState: ConnectionState;
}

export interface ActiveConnectionEvent {
    oldId?: string;
    newId?: string;
}

/**
 * Generic VSCode-like event type. Declared here so the
 * {@link IConnectionService} port can expose typed events without depending
 * on the `vscode` module at the port boundary.
 */
export type PortEvent<T> = (listener: (e: T) => void) => { dispose(): void };

/**
 * Read/write contract for the persistent connection store. The connection
 * dialog uses this directly to enumerate groups, look up saved connections,
 * and retrieve stored secrets.
 */
export interface IConnectionStore {
    getConnections(): ConnectionConfig[];
    getConnection(id: string): ConnectionConfig | undefined;
    getGroups(): ConnectionGroup[];
    getPassword(id: string): Promise<string | undefined>;
    getSshPassword(id: string): Promise<string | undefined>;
    getSshPassphrase(id: string): Promise<string | undefined>;
}

export interface IQueryAdapter {
    execute(sql: string): Promise<{ rows: QueryResultRow[]; columns: QueryResultMeta['columns'] }>;
    beginTransaction(): Promise<void>;
    commit(): Promise<void>;
    rollback(): Promise<void>;
}

/**
 * Adapter surface exposed to views-layer components. Re-exports the
 * aggregated `DatabaseAdapter` shape (connection + query + metadata +
 * schema sub-adapters) so panels can call `adapter.metadataAdapter.list*`
 * and `adapter.schemaAdapter.*` directly. Using `unknown` here would force
 * callers to cast; instead we re-declare the contract via a structural
 * import of the database adapter type. This is a *type-only* dependency,
 * not a value import, so it does not reintroduce a runtime coupling.
 */
export type IDatabaseAdapter = import('../database/adapters/AdapterFactory').DatabaseAdapter;

export interface IConnectionService {
    getActiveConnection(): ConnectionConfig | undefined;
    getAllConnections(): ConnectionConfig[];
    getConnection(id: string): ConnectionConfig | undefined;
    getState(id: string): ConnectionState;
    getAdapter(id: string): IDatabaseAdapter | undefined;
    setActiveConnection(id: string): void;
    updateConnection(id: string, config: ConnectionConfig, password?: string): Promise<void>;
    addConnection(config: ConnectionConfig, password?: string): Promise<void>;
    testConnection(config: ConnectionConfig, password?: string): Promise<TestConnectionResult>;
    readonly onDidChangeConnections: PortEvent<ConnectionEvent>;
    readonly onDidChangeConnectionState: PortEvent<ConnectionStateEvent>;
    readonly onDidChangeActiveConnection: PortEvent<ActiveConnectionEvent>;
}

/**
 * Contract for the connection dialog to query supported dialect metadata.
 * Mirrors the static surface of `AdapterFactory` (getAllMetadata) without
 * forcing the views layer to import the factory directly.
 */
export interface IDialectMetadataProvider {
    getAllMetadata(): import('../database/adapters/IDatabaseAdapter').DialectMetadata[];
}

// ─── Query ─────────────────────────────────────────────────────────────────

// Note: QueryResultRow is a record of column-name → cell value. The row
// objects are populated by the database driver and queried by column name at
// runtime, so a `Record<string, unknown>` alias is the most accurate shape.
export type QueryResultRow = Record<string, unknown>;

export interface QueryResultMeta {
    columns: { name: string; type: string }[];
}

export interface QueryExecutionResult {
    status: 'success' | 'error';
    rows?: QueryResultRow[];
    columns?: QueryResultMeta['columns'];
    executionTime?: number;
    rowCount?: number;
    affectedRows?: number;
    error?: { code: string; message: string; sql?: string };
}

export interface IQueryService {
    execute(adapterId: string, sql: string, options?: { database?: string }): Promise<QueryExecutionResult>;
    getActiveAdapter(): IQueryAdapter | undefined;
    getActiveAdapterId(): string | undefined;
    listDatabases(): Promise<{ name: string }[]>;
}

// ─── Schema ────────────────────────────────────────────────────────────────

// Re-export the database-layer ColumnInfo / TableStructure types so views
// components can rely on the port interface without re-declaring (and
// drifting from) the concrete shape. This is a *type-only* re-export — it
// does not introduce a runtime dependency on the database layer.
export type ColumnInfo = import('../database/adapters/IDatabaseAdapter').ColumnInfo;
export type TableStructure = import('../database/adapters/IDatabaseAdapter').TableStructure;

/**
 * Schema-cache contract used by views-layer components (database explorer,
 * table designer, query result panel). The methods mirror the concrete
 * `SchemaCache` surface so the tree provider can fetch databases / tables /
 * views / functions / procedures / columns by connectionId and invalidate
 * cached entries after DDL changes.
 */
export interface ISchemaService {
    getDatabases(connectionId: string): Promise<{ name: string; charset?: string; collation?: string }[]>;
    getTables(connectionId: string, database: string): Promise<{ name: string; type?: string; rowCount?: number; comment?: string }[]>;
    getViews(connectionId: string, database: string): Promise<{ name: string; definition?: string; comment?: string }[]>;
    getMaterializedViews(connectionId: string, database: string): Promise<{ name: string; definition?: string; comment?: string; status?: string }[]>;
    getFunctions(connectionId: string, database: string): Promise<{ name: string; returns?: string; definition?: string }[]>;
    getProcedures(connectionId: string, database: string): Promise<{ name: string; definition?: string }[]>;
    getColumns(connectionId: string, database: string, table: string): Promise<ColumnInfo[]>;
    describeTable(database: string, tableName: string): Promise<TableStructure>;
    quoteIdentifier(name: string): string;
    invalidateCache(connectionId: string, type?: string, database?: string): void;
    invalidate(connectionId: string, scope?: string, database?: string, table?: string): void;
    listDatabases(): Promise<{ name: string }[]>;
}

// ─── Data Edit ─────────────────────────────────────────────────────────────

export interface IDataEditService {
    commitChanges(
        changes: PendingChange[],
        tableName: string,
        database: string,
        columns: { name: string }[],
        rows: QueryResultRow[]
    ): Promise<{ success: boolean; errors?: string[] }>;
    beginTransaction(): Promise<void>;
    commit(): Promise<void>;
    rollback(): Promise<void>;
    createSavepoint(name: string): Promise<void>;
    rollbackToSavepoint(name: string): Promise<void>;
    requestForeignKeyOptions(column: string, referencedTable: string, database: string): Promise<ForeignKeyOption[]>;
}

// ─── Data Transfer ─────────────────────────────────────────────────────────

export interface CsvImportOptions {
    delimiter?: string;
    encoding?: string;
    hasHeaders?: boolean;
    batchSize?: number;
    onError: 'skip' | 'abort';
    dedupStrategy: 'ignore' | 'skip' | 'update';
    mapping?: Record<string, string>;
}

export interface JsonImportOptions {
    batchSize?: number;
    onError: 'skip' | 'abort';
    dedupStrategy: 'ignore' | 'skip' | 'update';
}

export interface ImportErrorEntry {
    row: number;
    message: string;
    data: string;
}

export interface ImportResult {
    success: boolean;
    totalRows: number;
    importedRows: number;
    skippedRows: number;
    errors: ImportErrorEntry[];
}

export interface CsvExportOptions {
    delimiter?: string;
    encoding?: string;
    includeHeaders?: boolean;
}

export interface JsonExportOptions {
    prettyPrint?: boolean;
}

export interface InsertExportOptions {
    batchSize?: number;
}

/**
 * Combined data-transfer port covering both import (CSV/JSON/SQL) and export
 * (CSV/JSON/INSERT statements/DDL) flows used by the query-result panel and
 * the data-transfer dialog.
 *
 * The import methods accept the active {@link IDatabaseAdapter} so the
 * service stays stateless with respect to which connection to write to —
 * the caller (panel) resolves the adapter via {@link IConnectionService}
 * and hands it in. This keeps the port free of connection-management
 * concerns.
 */
export interface IDataTransferService {
    importFromCsv(adapter: IDatabaseAdapter, tableName: string, filePath: string, options: CsvImportOptions): Promise<ImportResult>;
    importFromJson(adapter: IDatabaseAdapter, tableName: string, filePath: string, options: JsonImportOptions): Promise<ImportResult>;
    importFromSql(adapter: IDatabaseAdapter, filePath: string): Promise<ImportResult>;
    detectFileFormat(filePath: string): string;
    detectCsvDelimiter(firstLine: string): string;
    parseCsvLine(line: string, delimiter: string): string[];
    exportToCsv(rows: QueryResultRow[], columns: { name: string }[], options?: CsvExportOptions): Promise<void>;
    exportToJson(rows: QueryResultRow[], columns: { name: string }[], options?: JsonExportOptions): Promise<void>;
    exportToInsert(rows: QueryResultRow[], columns: { name: string }[], tableName: string, options?: InsertExportOptions, adapter?: IDatabaseAdapter): Promise<void>;
    exportToDdl(adapter: IDatabaseAdapter, database: string, table: string): Promise<void>;
}

// ─── Explain Plan ──────────────────────────────────────────────────────────

export interface ExplainPlanRow {
    id: number;
    selectType?: string;
    table?: string;
    type?: string;
    possibleKeys?: string;
    key?: string;
    rows?: number;
    extra?: string;
}

export interface ExplainPlanResult {
    rows: ExplainPlanRow[];
    suggestions: string[];
    rawOutput: string;
}

/**
 * Parsed EXPLAIN output. Mirrors the database-layer `ExplainResult` shape
 * (format + raw + nodes tree) so views-layer panels can render the tree
 * without importing the database adapter types directly.
 */
export interface ExplainResult {
    format: string;
    raw: string;
    nodes: {
        id: string;
        operation: string;
        table?: string;
        rows?: number;
        cost?: number;
        key?: string;
        extra?: string;
        children: ExplainResult['nodes'];
    }[];
}

export interface OptimizationSuggestion {
    severity: 'info' | 'warning' | 'critical';
    message: string;
    table?: string;
}

/**
 * Explain-plan port. The `parseExplain` method mirrors the concrete
 * `ExplainPlan.parseMysqlExplain` static method (accepts the raw EXPLAIN
 * output — string, parsed JSON, or table-format rows — and returns the
 * structured {@link ExplainResult}). `generateSuggestions` mirrors
 * `ExplainPlan.generateSuggestions`.
 */
export interface IExplainPlanService {
    parseExplain(raw: unknown): ExplainResult;
    generateSuggestions(result: ExplainResult): OptimizationSuggestion[];
}
