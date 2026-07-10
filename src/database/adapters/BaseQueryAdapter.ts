import type { IQueryAdapter, QueryResult, QueryParam, SqlStatement, ConnectionConfig } from "./IDatabaseAdapter";
import { t } from "../../i18n/index";
import { generateShortId } from "../../utils/idGenerator";

/**
 * Minimal shared-context contract required by {@link BaseQueryAdapter}'s
 * default {@link BaseQueryAdapter.execute} template.
 *
 * Every concrete dialect's shared context (MysqlSharedContext,
 * PostgresSharedContext, OracleSharedContext, DamengSharedContext,
 * SqlServerSharedContext, SqliteSharedContext) satisfies this contract:
 * pool-based dialects expose `pool`, SQLite exposes `db`, and all of them
 * inherit `lastActivityTime` and `config` from {@link BaseSharedContext}.
 */
export interface IQuerySharedContext {
    pool?: unknown;
    db?: unknown;
    config?: ConnectionConfig;
    lastActivityTime: number;
}

/**
 * Shared base class for per-dialect query sub-adapters.
 *
 * Query sub-adapters ({@link MysqlQueryAdapter}, {@link PostgresQueryAdapter},
 * ...) implement the execute / executeBatch / transaction / cancel surface of
 * {@link IQueryAdapter}. They were previously standalone classes that each
 * repeated the same scaffolding at the top of every `execute` body:
 *
 *   - `startTime = Date.now()` + `queryId = generateShortId('query')`.
 *   - The NOT_CONNECTED early-return when no pool/db handle is present.
 *   - `this.shared.lastActivityTime = Date.now()` before the driver call.
 *   - The try/catch wrapper that converts thrown driver errors into
 *     `status: 'error'` {@link QueryResult}s.
 *
 * This base class centralises that scaffolding via a template-method
 * {@link execute} that calls into the dialect-specific
 * {@link executeWithConnection} hook for the actual driver interaction and
 * {@link mapError} for dialect-specific error-code extraction.
 *
 * {@link executeBatch} is also centralised because its body was
 * byte-for-byte identical in every dialect.
 *
 * Generic over the dialect's shared-context type for parity with
 * {@link BaseConnectionAdapter} / {@link BaseSchemaAdapter} /
 * {@link BaseMetadataAdapter}.
 */
export abstract class BaseQueryAdapter<TShared extends IQuerySharedContext = IQuerySharedContext> implements IQueryAdapter {
    constructor(protected shared: TShared) {}

    /**
     * Template-method execute: handles the universal scaffolding
     * (startTime/queryId, NOT_CONNECTED early-return, `lastActivityTime`
     * stamp, try/catch wrapper) and delegates the driver-specific work to
     * {@link executeWithConnection}. Dialect-specific error-code extraction
     * lives in {@link mapError}.
     */
    async execute(sql: string, params?: QueryParam[]): Promise<QueryResult> {
        const startTime = Date.now();
        const queryId = generateShortId("query");

        if (!this.isConnected()) {
            return this.buildNotConnectedResult(sql, queryId, startTime);
        }

        this.shared.lastActivityTime = Date.now();
        try {
            return await this.executeWithConnection(sql, params, queryId, startTime);
        } catch (error: unknown) {
            const executionTime = Date.now() - startTime;
            return this.mapError(error, sql, queryId, executionTime);
        }
    }

    /**
     * Returns true when a pool or db handle is present. Pool-based dialects
     * satisfy this via `pool`; SQLite satisfies it via `db`. The default
     * checks both so concrete dialects do not need to override.
     */
    protected isConnected(): boolean {
        return !!(this.shared.pool ?? this.shared.db);
    }

    /**
     * Builds the standard `NOT_CONNECTED` error result. Includes the
     * `database` field derived from `shared.config?.database` to match the
     * shape produced by every pool-based dialect. SQLite historically
     * omitted the `database` field; it overrides this method to preserve
     * that exact shape.
     */
    protected buildNotConnectedResult(sql: string, queryId: string, startTime: number): QueryResult {
        const executionTime = Date.now() - startTime;
        return {
            queryId,
            status: "error",
            columns: [],
            rows: [],
            rowCount: 0,
            executionTime,
            error: {
                code: "NOT_CONNECTED",
                message: t("database.notConnected"),
                sql,
            },
            database: this.shared.config?.database,
        };
    }

    /**
     * Default error mapping: code = `'EXEC_ERROR'`, message = the thrown
     * error's message. Dialects override to extract driver-specific codes
     * (MySQL `ER_*` / `errno`; Oracle `ORA-XXXXX`; ODBC `DM-XXXX`; pg
     * `error.code`; mssql `error.code`).
     *
     * The result always carries `database: this.shared.config?.database`
     * for parity with the existing dialect implementations.
     */
    protected mapError(error: unknown, sql: string, queryId: string, executionTime: number): QueryResult {
        const message = error instanceof Error ? error.message : String(error);
        return {
            queryId,
            status: "error",
            columns: [],
            rows: [],
            rowCount: 0,
            executionTime,
            error: {
                code: "EXEC_ERROR",
                message,
                sql,
            },
            database: this.shared.config?.database,
        };
    }

    /**
     * Driver-specific query execution. The template-method {@link execute}
     * has already validated the connection, stamped `lastActivityTime`, and
     * wrapped the call in a try/catch that delegates to {@link mapError} on
     * failure. Concrete dialects implement the actual driver call, column
     * extraction, and result shaping here.
     */
    protected abstract executeWithConnection(
        sql: string,
        params: QueryParam[] | undefined,
        queryId: string,
        startTime: number,
    ): Promise<QueryResult>;

    /**
     * Default executeBatch — runs each statement sequentially via
     * {@link execute} and collects the results. Identical to the body that
     * was duplicated verbatim across every dialect's query adapter.
     */
    async executeBatch(statements: SqlStatement[]): Promise<QueryResult[]> {
        const results: QueryResult[] = [];
        for (const stmt of statements) {
            results.push(await this.execute(stmt.sql, stmt.params));
        }
        return results;
    }

    abstract beginTransaction(): Promise<void>;
    abstract commit(): Promise<void>;
    abstract rollback(): Promise<void>;
    abstract cancelQuery(queryId: string): Promise<void>;
}
