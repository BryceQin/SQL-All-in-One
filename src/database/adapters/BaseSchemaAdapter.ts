import type {
    ISchemaAdapter,
    QueryResult,
    QueryParam,
    QueryRow,
    TableStructure,
    TriggerInfo,
    DialectCapabilities,
    DataTypeCategory,
    ExplainResult,
    RoutineParameterInfo,
} from './IDatabaseAdapter';
import { validateIdentifier as validateIdentifierHelper } from './identifierValidator';
import { t } from '../../i18n/index';
import { generateShortId } from '../../utils/idGenerator';

/**
 * Shared base class for per-dialect schema sub-adapters.
 *
 * Schema sub-adapters ({@link MysqlSchemaAdapter},
 * {@link PostgresSchemaAdapter}, ...) implement the catalog-query /
 * DDL-retrieval / EXPLAIN surface of {@link ISchemaAdapter}. They were
 * previously standalone classes that each repeated the same scaffolding:
 *
 *   - The `executeQuery → if !success return [] → map rows` guard at the
 *     start of every list/describe method.
 *   - The Map-accumulator loop body in `describeTableIndexes` /
 *     `describeTableForeignKeys` (collect columns under a key, push into a
 *     `columns` array on the accumulator).
 *   - The `quoteIdentifier` body, which differs only in the quote char
 *     (backtick for MySQL, double-quote for Postgres/Oracle/SQLite/Dameng,
 *     `[` for SQL Server).
 *   - The `validateIdentifier` wrapper, which differs only in the max
 *     length (64 / 63 / 128).
 *   - The `getDialectCapabilities` literal, which is ~95% identical across
 *     dialects.
 *   - The `buildNotConnectedResult` / `buildErrorResult` helpers in
 *     dialects that surface NOT_CONNECTED early-returns (currently inlined
 *     in the query layer; provided here so schema-side methods that need
 *     to short-circuit on a missing pool can reuse the same shape).
 *
 * This base class centralises that scaffolding. Concrete subclasses opt
 * into whichever helpers they need; the {@link describeTable} template
 * method is intentionally NOT provided here because the per-dialect
 * describe-helpers have divergent argument passing (Oracle/Dameng use
 * (table, owner), Postgres/SqlServer/SQLite use (_database, table,
 * schema), MySQL uses (database, table)). Forcing them into a common
 * signature would require rewriting every dialect's private helpers for
 * no behavior change and significant risk.
 *
 * Generic over the dialect's shared-context type for parity with
 * {@link BaseConnectionAdapter} / {@link BaseQueryAdapter}.
 */
export abstract class BaseSchemaAdapter<TShared = unknown> implements ISchemaAdapter {
    constructor(
        protected shared: TShared,
        protected executeQuery: (sql: string, params?: QueryParam[]) => Promise<QueryResult>,
        protected listTriggersFn: (database?: string, schema?: string) => Promise<TriggerInfo[]>,
    ) {}

    // ----- Common helpers -------------------------------------------------

    /**
     * Runs a list/describe query and maps each result row through
     * `rowMapper`. Returns `[]` when the underlying query did not succeed,
     * matching the previous inlined if (result.status !== 'success')
     * return [] guard.
     */
    protected async runListQuery<T>(
        sql: string,
        params: QueryParam[] | undefined,
        rowMapper: (row: QueryRow) => T,
    ): Promise<T[]> {
        const result = await this.executeQuery(sql, params);
        if (result.status !== 'success') {
            return [];
        }
        return result.rows.map(rowMapper);
    }

    /**
     * Runs a row-count query and returns the numeric value of the first
     * row's `rowField` (default `'row_count'`). Returns `0` when the query
     * fails or yields no rows, matching the previous inlined guards in
     * `getTableRowCount` across dialects.
     */
    protected async runRowCountQuery(
        sql: string,
        params: QueryParam[],
        rowField = 'row_count',
    ): Promise<number> {
        const result = await this.executeQuery(sql, params);
        if (result.status !== 'success' || result.rows.length === 0) {
            return 0;
        }
        const v = result.rows[0][rowField];
        return v != null ? Number(v) : 0;
    }

    /**
     * Accumulates `rows` into a list of `T` keyed by `keyExtractor`.
     *
     * The first row with a given key creates the accumulator via `creator`;
     * subsequent rows with the same key (and the first row itself) are
     * passed to `reducer` so it can append columns / merge fields. This
     * matches the Map-accumulator pattern that was duplicated verbatim in
     * `describeTableIndexes` / `describeTableForeignKeys` across every
     * dialect.
     */
    protected accumulateByKey<T, K>(
        rows: QueryRow[],
        keyExtractor: (row: QueryRow) => K,
        creator: (row: QueryRow, key: K) => T,
        reducer: (acc: T, row: QueryRow) => void,
    ): T[] {
        const map = new Map<K, T>();
        for (const row of rows) {
            const key = keyExtractor(row);
            if (!map.has(key)) {
                map.set(key, creator(row, key));
            }
            reducer(map.get(key)!, row);
        }
        return Array.from(map.values());
    }

    /**
     * Builds the standard `NOT_CONNECTED` error result. Provided so schema-
     * side methods that need to short-circuit on a missing pool produce the
     * same shape as the query-layer early-returns.
     */
    protected buildNotConnectedResult(sql: string, startTime: number): QueryResult {
        const executionTime = Date.now() - startTime;
        const queryId = generateShortId('query');
        return {
            queryId,
            status: 'error',
            columns: [],
            rows: [],
            rowCount: 0,
            executionTime,
            error: { code: 'NOT_CONNECTED', message: t('database.notConnected'), sql },
        };
    }

    /**
     * Builds a standard error result for schema-side queries that surface
     * errors inline rather than throwing.
     */
    protected buildErrorResult(error: unknown, sql: string, startTime: number, code = 'EXECUTION_ERROR'): QueryResult {
        const executionTime = Date.now() - startTime;
        const queryId = generateShortId('query');
        const message = error instanceof Error ? error.message : String(error);
        return {
            queryId,
            status: 'error',
            columns: [],
            rows: [],
            rowCount: 0,
            executionTime,
            error: { code, message, sql },
        };
    }

    // ----- Default `quoteIdentifier` parameterised by `quoteChar` --------

    /**
     * The quote character used by {@link quoteIdentifier}. Subclasses
     * declare this as a `protected` field: single-quote for MySQL/StarRocks,
     * double-quote for Postgres/Oracle/SQLite/Dameng, `[` for SQL Server.
     *
     * `abstract` rather than default-valued so that forgetting to declare
     * it is a compile error rather than a silent quoting bug.
     */
    protected abstract readonly quoteChar: '"' | '`' | '[';

    quoteIdentifier(identifier: string): string {
        // Bracket-quoting (SQL Server) escapes `]` as `]]`; the backtick
        // and double-quote forms escape their quote char by doubling it.
        if (this.quoteChar === '[') {
            return `[${identifier.replace(/]/g, ']]')}]`;
        }
        const ch = this.quoteChar;
        return `${ch}${identifier.replace(new RegExp(`[${ch}]`, 'g'), (m) => m + m)}${ch}`;
    }

    // ----- Default `validateIdentifier` parameterised by `maxLength` -----

    /**
     * Validates an identifier against the dialect's max length. Subclasses
     * override either {@link identifierMaxLength} (the simple case) or the
     * whole method (if additional dialect-specific rules apply).
     */
    protected validateIdentifier(identifier: string): void {
        validateIdentifierHelper(identifier, this.identifierMaxLength());
    }

    /** The dialect's maximum identifier length (64 for MySQL/StarRocks, 63
     *  for Postgres, 128 for Oracle/SQL Server/Dameng). */
    protected identifierMaxLength(): number {
        return 128;
    }

    // ----- Default `getDialectCapabilities` ------------------------------

    /**
     * Returns the dialect's capability flags. The default matches the most-
     * common shape across dialects; subclasses override individual fields
     * (or the whole method) when they diverge.
     */
    getDialectCapabilities(): DialectCapabilities {
        return {
            supportsSchema: false,
            supportsMultipleDatabases: true,
            maxConcurrentQueries: 5,
            supportsPreparedStatement: true,
            supportsExplain: true,
            supportsExplainAnalyze: false,
            supportsCancel: true,
            supportsSshTunnel: true,
            supportedObjectTypes: ['table', 'view', 'function', 'procedure', 'trigger', 'index'],
        };
    }

    // ----- Abstract members (declared by every concrete dialect) ---------

    abstract describeTable(database: string, table: string, schema?: string): Promise<TableStructure>;
    abstract getTableDDL(database: string, table: string, schema?: string): Promise<string>;
    abstract getViewDDL(database: string, view: string, schema?: string): Promise<string>;
    abstract getMaterializedViewDDL(database: string, mvName: string, schema?: string): Promise<string>;
    abstract getFunctionDDL(database: string, functionName: string, schema?: string): Promise<string>;
    abstract getProcedureDDL(database: string, procedureName: string, schema?: string): Promise<string>;
    abstract getTriggerDDL(database: string, triggerName: string, schema?: string): Promise<string>;
    abstract getRoutineParameters(database: string, routineName: string, routineType: 'FUNCTION' | 'PROCEDURE', schema?: string): Promise<RoutineParameterInfo[]>;
    abstract getExplainPlan(database: string, sql: string): Promise<ExplainResult>;
    abstract getTableRowCount(database: string, table: string, schema?: string): Promise<number>;
    abstract getSupportedDataTypes(): DataTypeCategory[];
}
