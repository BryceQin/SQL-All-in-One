import type {
    IConnectionService,
    IQueryService,
    ISchemaService,
    IDataEditService,
    IDataTransferService,
    IExplainPlanService,
    IConnectionStore,
    IDialectMetadataProvider,
    ConnectionEvent,
    ConnectionStateEvent,
    ActiveConnectionEvent,
    PortEvent,
    QueryExecutionResult,
    QueryResultRow,
    CsvImportOptions,
    JsonImportOptions,
    ImportResult,
    CsvExportOptions,
    JsonExportOptions,
    InsertExportOptions,
    ExplainResult,
    OptimizationSuggestion,
    IDatabaseAdapter,
    IQueryAdapter,
} from './ports';
import type { PendingChange, ForeignKeyOption } from '../shared/editTypes';
import type { ConnectionConfig, TestConnectionResult } from '../database/connection/ConnectionConfig';
import type { ConnectionState } from '../shared/treeNodeTypes';
import { getConnectionManager } from '../database/connection/ConnectionManager';
import { getConnectionStore } from '../database/connection/ConnectionStore';
import { getSchemaCache } from '../database/schema/SchemaCache';
import {
    generateEditSql,
    executeInTransaction,
    getActiveAdapter,
} from '../database/query/DataEditService';
import { ExplainPlan } from '../database/query/ExplainPlan';
import {
    importFromCsv as dbImportFromCsv,
    importFromJson as dbImportFromJson,
    importFromSql as dbImportFromSql,
    detectFileFormat as dbDetectFileFormat,
    detectCsvDelimiter as dbDetectCsvDelimiter,
    parseCsvLine as dbParseCsvLine,
} from '../database/transfer/DataImporter';
import { DataExporter } from '../database/transfer/DataExporter';
import { AdapterFactory } from '../database/adapters/AdapterFactory';
import { getContainer, Tokens } from '../core/diContainer';
import type { QueryExecutor } from '../database/query/QueryExecutor';
import type {
    DatabaseInfo,
    TableInfo,
    ViewInfo,
    FunctionInfo,
    ProcedureInfo,
    ColumnInfo,
    ColumnMeta,
    QueryRow,
    QueryResult,
    SqlStatement,
    ExplainResult as DbExplainResult,
} from '../database/adapters/IDatabaseAdapter';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/**
 * Wrap a `vscode.Event` subscription into the generic {@link PortEvent}
 * shape so port consumers do not need to import the `vscode` module.
 */
function wrapEvent<T>(event: import('vscode').Event<T>): PortEvent<T> {
    return (listener: (e: T) => void): { dispose(): void } => {
        return event(listener);
    };
}

// ---------------------------------------------------------------------------
// ConnectionStore
// ---------------------------------------------------------------------------

export class ConnectionStoreImpl implements IConnectionStore {
    getConnections(): ConnectionConfig[] {
        return getConnectionStore().getConnections();
    }
    getConnection(id: string): ConnectionConfig | undefined {
        return getConnectionStore().getConnection(id);
    }
    getGroups(): import('../database/connection/ConnectionConfig').ConnectionGroup[] {
        return getConnectionStore().getGroups();
    }
    async getPassword(id: string): Promise<string | undefined> {
        return getConnectionStore().getPassword(id);
    }
    async getSshPassword(id: string): Promise<string | undefined> {
        return getConnectionStore().getSshPassword(id);
    }
    async getSshPassphrase(id: string): Promise<string | undefined> {
        return getConnectionStore().getSshPassphrase(id);
    }
}

// ---------------------------------------------------------------------------
// DialectMetadataProvider
// ---------------------------------------------------------------------------

export class DialectMetadataProviderImpl implements IDialectMetadataProvider {
    getAllMetadata(): import('../database/adapters/IDatabaseAdapter').DialectMetadata[] {
        return AdapterFactory.getAllMetadata();
    }
}

// ---------------------------------------------------------------------------
// ConnectionService
// ---------------------------------------------------------------------------

export class ConnectionServiceImpl implements IConnectionService {
    getActiveConnection(): ConnectionConfig | undefined {
        return getConnectionManager().getActiveConnection();
    }
    getAllConnections(): ConnectionConfig[] {
        return getConnectionManager().getAllConnections();
    }
    getConnection(id: string): ConnectionConfig | undefined {
        // ConnectionManager does not expose getConnection(id) publicly; it
        // owns runtime adapter state and delegates config lookup to the
        // store. The store is the source of truth for persisted configs.
        return getConnectionStore().getConnection(id);
    }
    getState(id: string): ConnectionState {
        return getConnectionManager().getState(id);
    }
    getAdapter(id: string): IDatabaseAdapter | undefined {
        return getConnectionManager().getAdapter(id);
    }
    setActiveConnection(id: string): void {
        getConnectionManager().setActiveConnection(id);
    }
    async updateConnection(
        id: string,
        config: ConnectionConfig,
        password?: string,
    ): Promise<void> {
        await getConnectionManager().updateConnection(id, config, password);
    }
    async addConnection(
        config: ConnectionConfig,
        password?: string,
    ): Promise<void> {
        await getConnectionManager().addConnection(config, password);
    }
    async testConnection(
        config: ConnectionConfig,
        password?: string,
    ): Promise<TestConnectionResult> {
        return getConnectionManager().testConnection(config, password);
    }
    get onDidChangeConnections(): PortEvent<ConnectionEvent> {
        return wrapEvent(getConnectionManager().onDidChangeConnections);
    }
    get onDidChangeConnectionState(): PortEvent<ConnectionStateEvent> {
        return wrapEvent(getConnectionManager().onDidChangeConnectionState);
    }
    get onDidChangeActiveConnection(): PortEvent<ActiveConnectionEvent> {
        return wrapEvent(getConnectionManager().onDidChangeActiveConnection);
    }
}

// ---------------------------------------------------------------------------
// QueryService
// ---------------------------------------------------------------------------

export class QueryServiceImpl implements IQueryService {
    /**
     * Resolve the active {@link QueryExecutor} from the DI container. The
     * executor is registered as a singleton in serviceRegistration.
     */
    private getExecutor(): QueryExecutor {
        return getContainer().get<QueryExecutor>(Tokens.QueryExecutor);
    }

    async execute(
        adapterId: string,
        sql: string,
        options?: { database?: string },
    ): Promise<QueryExecutionResult> {
        const adapter = getConnectionManager().getAdapter(adapterId);
        if (!adapter) {
            return {
                status: 'error',
                error: {
                    code: 'NO_ADAPTER',
                    message: 'No adapter available for connection: ' + adapterId,
                    sql,
                },
            };
        }
        const executor = this.getExecutor();
        const result: QueryResult = await executor.execute(
            adapter,
            sql,
            { database: options?.database },
            adapterId,
        );
        return mapQueryResult(result);
    }

    getActiveAdapter(): IQueryAdapter | undefined {
        const adapter = getActiveAdapter();
        if (!adapter) return undefined;
        return adapter.queryAdapter;
    }

    getActiveAdapterId(): string | undefined {
        return getConnectionManager().getActiveConnection()?.id;
    }

    async listDatabases(): Promise<{ name: string }[]> {
        const adapter = getActiveAdapter();
        if (!adapter) return [];
        const dbs: DatabaseInfo[] = await adapter.metadataAdapter.listDatabases();
        return dbs.map((d) => ({ name: d.name }));
    }
}

/**
 * Map the database-layer {@link QueryResult} to the application-layer
 * {@link QueryExecutionResult} port shape. The two types are structurally
 * similar but the port omits driver-specific fields like `queryId` and
 * `database`.
 */
function mapQueryResult(result: QueryResult): QueryExecutionResult {
    if (result.status === 'error') {
        return {
            status: 'error',
            error: result.error
                ? {
                      code: result.error.code,
                      message: result.error.message,
                      sql: result.error.sql,
                  }
                : undefined,
            executionTime: result.executionTime,
        };
    }
    return {
        status: 'success',
        rows: result.rows,
        columns: result.columns.map((c) => ({ name: c.name, type: c.type })),
        executionTime: result.executionTime,
        rowCount: result.rowCount,
        affectedRows: result.affectedRows,
    };
}

// ---------------------------------------------------------------------------
// SchemaService
// ---------------------------------------------------------------------------

export class SchemaServiceImpl implements ISchemaService {
    async getDatabases(
        connectionId: string,
    ): Promise<{ name: string; charset?: string; collation?: string }[]> {
        return getSchemaCache().getDatabases(connectionId);
    }

    async getTables(
        connectionId: string,
        database: string,
    ): Promise<{ name: string; type?: string; rowCount?: number; comment?: string }[]> {
        const tables: TableInfo[] = await getSchemaCache().getTables(connectionId, database);
        return tables.map((t) => ({
            name: t.name,
            type: t.type,
            rowCount: t.rowCount,
            comment: t.comment,
        }));
    }

    async getViews(
        connectionId: string,
        database: string,
    ): Promise<{ name: string; definition?: string; comment?: string }[]> {
        const views: ViewInfo[] = await getSchemaCache().getViews(connectionId, database);
        return views.map((v) => ({
            name: v.name,
            definition: v.definition,
            comment: v.comment,
        }));
    }

    async getFunctions(
        connectionId: string,
        database: string,
    ): Promise<{ name: string; returns?: string; definition?: string }[]> {
        const fns: FunctionInfo[] = await getSchemaCache().getFunctions(connectionId, database);
        return fns.map((f) => ({
            name: f.name,
            returns: f.returns,
            definition: f.definition,
        }));
    }

    async getProcedures(
        connectionId: string,
        database: string,
    ): Promise<{ name: string; definition?: string }[]> {
        const procs: ProcedureInfo[] = await getSchemaCache().getProcedures(connectionId, database);
        return procs.map((p) => ({
            name: p.name,
            definition: p.definition,
        }));
    }

    async getColumns(
        connectionId: string,
        database: string,
        table: string,
    ): Promise<ColumnInfo[]> {
        return getSchemaCache().getColumns(connectionId, database, table);
    }

    async describeTable(database: string, tableName: string): Promise<import('./ports').TableStructure> {
        const adapter = getActiveAdapter();
        if (!adapter) {
            throw new Error('No active database adapter.');
        }
        return adapter.schemaAdapter.describeTable(database, tableName);
    }

    quoteIdentifier(name: string): string {
        const adapter = getActiveAdapter();
        if (!adapter) {
            // Fallback: MySQL-style quoting. Keeps the port usable when no
            // connection is active (e.g. for static SQL generation).
            return '`' + name.replace(/`/g, '``') + '`';
        }
        return adapter.schemaAdapter.quoteIdentifier(name);
    }

    invalidateCache(connectionId: string, type?: string, database?: string): void {
        // Map the legacy (connectionId, type, database) signature to the
        // concrete SchemaCache.invalidate(connectionId, scope, database)
        // signature. `type` here is the legacy scope name.
        const scope = type as
            | 'database'
            | 'table'
            | 'column'
            | 'function'
            | 'procedure'
            | 'view'
            | undefined;
        getSchemaCache().invalidate(connectionId, scope, database);
    }

    invalidate(connectionId: string, scope?: string, database?: string, table?: string): void {
        const s = scope as
            | 'database'
            | 'table'
            | 'column'
            | 'function'
            | 'procedure'
            | 'view'
            | undefined;
        getSchemaCache().invalidate(connectionId, s, database, table);
    }

    async listDatabases(): Promise<{ name: string }[]> {
        const adapter = getActiveAdapter();
        if (!adapter) return [];
        const dbs: DatabaseInfo[] = await adapter.metadataAdapter.listDatabases();
        return dbs.map((d) => ({ name: d.name }));
    }
}

// ---------------------------------------------------------------------------
// DataEditService
// ---------------------------------------------------------------------------

export class DataEditServiceImpl implements IDataEditService {
    async commitChanges(
        changes: PendingChange[],
        tableName: string,
        database: string,
        columns: { name: string }[],
        rows: QueryResultRow[],
    ): Promise<{ success: boolean; errors?: string[] }> {
        const adapter = getActiveAdapter();
        if (!adapter) {
            return { success: false, errors: ['No active database adapter.'] };
        }

        // `database` is accepted to satisfy the port contract and is used to
        // decide whether we can rely on the active connection's default
        // database. The database-layer generateEditSql only takes a table
        // name (it does not support schema-qualified names), so we do not
        // prefix `database.` here; callers are responsible for ensuring the
        // active connection's default database matches `database` before
        // committing edits. This mirrors the behaviour of the former
        // queryResultCallbacks.ts implementation.
        void database;

        // The database-layer generateEditSql expects ColumnMeta (with
        // nullable/isPrimaryKey/...) but only reads `name` for INSERT
        // statement generation. Cast the lightweight column shape through
        // the ColumnMeta type so we do not have to fabricate the extra
        // fields the function never reads.
        const columnMetas = columns as unknown as ColumnMeta[];
        const dbRows = rows as QueryRow[];

        const statements: SqlStatement[] = generateEditSql(
            changes,
            tableName,
            columnMetas,
            dbRows,
            (id: string) => adapter.schemaAdapter.quoteIdentifier(id),
        );

        return executeInTransaction(adapter, statements);
    }

    async beginTransaction(): Promise<void> {
        const adapter = getActiveAdapter();
        if (!adapter) return;
        await adapter.queryAdapter.beginTransaction();
    }

    async commit(): Promise<void> {
        const adapter = getActiveAdapter();
        if (!adapter) return;
        await adapter.queryAdapter.commit();
    }

    async rollback(): Promise<void> {
        const adapter = getActiveAdapter();
        if (!adapter) return;
        await adapter.queryAdapter.rollback();
    }

    async createSavepoint(name: string): Promise<void> {
        const adapter = getActiveAdapter();
        if (!adapter) return;
        await adapter.queryAdapter.execute(`SAVEPOINT ${adapter.schemaAdapter.quoteIdentifier(name)}`);
    }

    async rollbackToSavepoint(name: string): Promise<void> {
        const adapter = getActiveAdapter();
        if (!adapter) return;
        await adapter.queryAdapter.execute(`ROLLBACK TO SAVEPOINT ${adapter.schemaAdapter.quoteIdentifier(name)}`);
    }

    async requestForeignKeyOptions(
        column: string,
        referencedTable: string,
        database: string,
    ): Promise<ForeignKeyOption[]> {
        const adapter = getActiveAdapter();
        if (!adapter) return [];

        // `column` identifies the foreign-key column the user is editing in
        // the result panel. The option list is populated from the referenced
        // table's primary key values, so `column` itself is not needed to
        // build the query — it is part of the port contract for callers that
        // may want to filter / label the options per-column.
        void column;

        try {
            const structure = await adapter.schemaAdapter.describeTable(database, referencedTable);
            const pkColumns = structure.columns.filter((c) => c.isPrimaryKey);
            if (pkColumns.length === 0) {
                return [];
            }
            // Fetch the first rows of the referenced table to populate the
            // dropdown with real values. Limit to 200 rows to bound the
            // result; the editor surfaces a typeahead on top of these.
            const quotedTable =
                adapter.schemaAdapter.quoteIdentifier(database) +
                '.' +
                adapter.schemaAdapter.quoteIdentifier(referencedTable);
            const quotedPk = pkColumns
                .map((c) => adapter.schemaAdapter.quoteIdentifier(c.name))
                .join(', ');
            const result = await adapter.queryAdapter.execute(
                `SELECT ${quotedPk} FROM ${quotedTable} LIMIT 200`,
            );
            const options: ForeignKeyOption[] = [];
            const pkName = pkColumns[0].name;
            for (const row of result.rows) {
                const value = row[pkName];
                if (value === null || value === undefined) continue;
                options.push({
                    value,
                    displayText: String(value),
                });
            }
            return options;
        } catch {
            // Best-effort lookup; surface an empty list on failure so the
            // editor still lets the user type a value manually.
            return [];
        }
    }
}

// ---------------------------------------------------------------------------
// DataTransferService
// ---------------------------------------------------------------------------

export class DataTransferServiceImpl implements IDataTransferService {
    async importFromCsv(
        adapter: IDatabaseAdapter,
        tableName: string,
        filePath: string,
        options: CsvImportOptions,
    ): Promise<ImportResult> {
        return dbImportFromCsv(adapter, tableName, filePath, options);
    }

    async importFromJson(
        adapter: IDatabaseAdapter,
        tableName: string,
        filePath: string,
        options: JsonImportOptions,
    ): Promise<ImportResult> {
        return dbImportFromJson(adapter, tableName, filePath, options);
    }

    async importFromSql(
        adapter: IDatabaseAdapter,
        filePath: string,
    ): Promise<ImportResult> {
        return dbImportFromSql(adapter, filePath);
    }

    detectFileFormat(filePath: string): string {
        return dbDetectFileFormat(filePath);
    }

    detectCsvDelimiter(firstLine: string): string {
        return dbDetectCsvDelimiter(firstLine);
    }

    parseCsvLine(line: string, delimiter: string): string[] {
        return dbParseCsvLine(line, delimiter);
    }

    async exportToCsv(
        rows: QueryResultRow[],
        columns: { name: string }[],
        options?: CsvExportOptions,
    ): Promise<void> {
        const exporter = new DataExporter();
        await exporter.exportToCsv(rows as QueryRow[], columns as ColumnMeta[], options);
    }

    async exportToJson(
        rows: QueryResultRow[],
        columns: { name: string }[],
        options?: JsonExportOptions,
    ): Promise<void> {
        const exporter = new DataExporter();
        await exporter.exportToJson(rows as QueryRow[], columns as ColumnMeta[], options);
    }

    async exportToInsert(
        rows: QueryResultRow[],
        columns: { name: string }[],
        tableName: string,
        options?: InsertExportOptions,
        adapter?: IDatabaseAdapter,
    ): Promise<void> {
        const exporter = new DataExporter();
        await exporter.exportToInsert(
            rows as QueryRow[],
            columns as ColumnMeta[],
            tableName,
            options,
            adapter,
        );
    }

    async exportToDdl(
        adapter: IDatabaseAdapter,
        database: string,
        table: string,
    ): Promise<void> {
        const exporter = new DataExporter();
        await exporter.exportToDdl(adapter, database, table);
    }
}

// ---------------------------------------------------------------------------
// ExplainPlanService
// ---------------------------------------------------------------------------

export class ExplainPlanServiceImpl implements IExplainPlanService {
    parseExplain(raw: unknown): ExplainResult {
        const result: DbExplainResult = ExplainPlan.parseMysqlExplain(raw);
        return {
            format: result.format,
            raw: result.raw,
            nodes: result.nodes,
        };
    }

    generateSuggestions(result: ExplainResult): OptimizationSuggestion[] {
        return ExplainPlan.generateSuggestions(result as DbExplainResult);
    }
}
