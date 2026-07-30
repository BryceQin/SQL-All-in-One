import type {
    IMetadataAdapter,
    DatabaseInfo,
    TableInfo,
    ViewInfo,
    MaterializedViewInfo,
    FunctionInfo,
    ProcedureInfo,
    TriggerInfo,
    QueryResult,
    QueryParam,
    QueryRow,
} from "./IDatabaseAdapter";

/**
 * Shared base class for per-dialect metadata sub-adapters.
 *
 * Metadata sub-adapters ({@link MysqlMetadataAdapter},
 * {@link PostgresMetadataAdapter}, ...) implement the catalog-enumeration
 * surface of {@link IMetadataAdapter}. They were previously standalone
 * classes that each repeated the same scaffolding:
 *
 *   - The `executeQuery → if !success return [] → map rows` guard at the
 *     start of every list method.
 *   - The system-database filter in `listDatabases` (MySQL filters
 *     `information_schema`/`mysql`/`performance_schema`/`sys`; SQL Server
 *     filters `master`/`tempdb`/`model`/`msdb`; Postgres filters
 *     `postgres`).
 *   - The no-op `listFunctions`/`listProcedures` in dialects that don't
 *     support them (SQLite).
 *
 * This base class centralises that scaffolding. Concrete subclasses opt
 * into whichever helpers they need; the {@link listDatabases} template
 * method is intentionally overridable for dialects whose semantics diverge
 * (Oracle/Dameng return a single entry derived from `SYS_CONTEXT`; SQLite
 * returns a constant `[{ name: 'main' }]`).
 *
 * Generic over the dialect's shared-context type for parity with
 * {@link BaseSchemaAdapter} / {@link BaseConnectionAdapter}.
 */
export abstract class BaseMetadataAdapter<TShared = unknown> implements IMetadataAdapter {
    constructor(
        protected shared: TShared,
        protected executeQuery: (sql: string, params?: QueryParam[]) => Promise<QueryResult>,
    ) {}

    /**
     * Runs a list query and maps each result row through `rowMapper`.
     * Returns `[]` when the underlying query did not succeed, matching
     * the previous inlined `if (result.status !== 'success') return []`
     * guard present in every dialect's list methods.
     */
    protected async runListQuery<T>(sql: string, params: QueryParam[] | undefined, rowMapper: (row: QueryRow) => T): Promise<T[]> {
        const result = await this.executeQuery(sql, params);
        if (result.status !== "success") {
            return [];
        }
        return result.rows.map(rowMapper);
    }

    /**
     * Returns true if `name` is a built-in system database that should
     * be hidden from {@link listDatabases} results. The default returns
     * false (no filtering); dialects override to filter their own system
     * databases (MySQL: `information_schema`/`mysql`/`performance_schema`/
     * `sys`; SQL Server: `master`/`tempdb`/`model`/`msdb`; Postgres:
     * `postgres`).
     */
    protected isSystemDatabase(_name: string): boolean {
        return false;
    }

    /**
     * Lists databases by running {@link listDatabaseRows} and filtering
     * out system databases via {@link isSystemDatabase}. Dialects whose
     * `listDatabases` semantics diverge from this shape (Oracle/Dameng
     * derive a single entry from `SYS_CONTEXT`; SQLite returns a constant
     * `[{ name: 'main' }]`) override this method end-to-end.
     */
    async listDatabases(): Promise<DatabaseInfo[]> {
        const rows = await this.listDatabaseRows();
        return rows.filter((row) => !this.isSystemDatabase(row.name));
    }

    /**
     * Hook invoked by the default {@link listDatabases} template. Returns
     * the raw `DatabaseInfo[]` rows before system-database filtering.
     * Dialects implement this to run their catalog query and project
     * rows into the `DatabaseInfo` shape.
     */
    protected abstract listDatabaseRows(): Promise<DatabaseInfo[]>;

    /**
     * Default no-op: returns an empty array. Dialects that don't support
     * materialized views inherit this default.
     */
    async listMaterializedViews(_database?: string, _schema?: string): Promise<MaterializedViewInfo[]> {
        return [];
    }

    /**
     * Default no-op: returns an empty array. Dialects that don't support
     * user-defined functions (SQLite, StarRocks) inherit this default
     * instead of overriding with a `return []` body.
     */
    async listFunctions(_database?: string, _schema?: string): Promise<FunctionInfo[]> {
        return [];
    }

    /**
     * Default no-op: returns an empty array. Dialects that don't support
     * stored procedures (SQLite, StarRocks) inherit this default instead
     * of overriding with a `return []` body.
     */
    async listProcedures(_database?: string, _schema?: string): Promise<ProcedureInfo[]> {
        return [];
    }

    abstract listSchemas(database?: string): Promise<string[]>;
    abstract listTables(database?: string, schema?: string, filter?: string): Promise<TableInfo[]>;
    abstract listViews(database?: string, schema?: string): Promise<ViewInfo[]>;
    abstract listTriggers(database?: string, schema?: string): Promise<TriggerInfo[]>;
}
