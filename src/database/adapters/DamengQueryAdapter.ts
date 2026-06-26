import type { IQueryAdapter, QueryResult, QueryRow, QueryParam, SqlStatement } from './IDatabaseAdapter';
import type { Connection } from 'odbc';
import type { DamengSharedContext } from './DamengSharedContext';
import { t } from '../../i18n/index';
import { generateShortId } from '../../utils/idGenerator';

/**
 * Dameng (DM8) query adapter.
 *
 * Executes queries via `connection.query(sql, params, options)` through the
 * `odbc` npm package. ODBC uses `?` positional placeholders and accepts a flat
 * array of primitive bind values, which matches the existing QueryParam[]
 * shape used by the other adapters (we only need to flatten the `.value`
 * fields and coerce booleans to 0/1).
 *
 * Transactions are managed through a dedicated connection acquired from the
 * pool; queries issued while a transaction is active are routed through that
 * connection. Auto-commit is left enabled on the pool connections and
 * disabled only on the transaction connection via `beginTransaction()`.
 *
 * Query cancellation: ODBC does not expose a native cancel API on the
 * connection object. We enforce a per-query timeout via the odbc
 * `query(sql, params, { timeout })` option (see DEFAULT_QUERY_TIMEOUT_MS).
 * Explicit `cancelQuery()` requests cannot safely target the exact running
 * session without risking killing unrelated same-user sessions on shared
 * pools, so `cancelQuery` is a no-op and relies on the per-query timeout.
 */
export class DamengQueryAdapter implements IQueryAdapter {
    /** Per-query timeout (ms) passed to odbc `query` options. Bounds runaway queries. */
    private static readonly DEFAULT_QUERY_TIMEOUT_MS = 30000;

    constructor(private shared: DamengSharedContext) {}

    async execute(sql: string, params?: QueryParam[]): Promise<QueryResult> {
        const startTime = Date.now();
        const queryId = generateShortId('query');

        if (!this.shared.pool) {
            const executionTime = Date.now() - startTime;
            return {
                queryId,
                status: 'error',
                columns: [],
                rows: [],
                rowCount: 0,
                executionTime,
                error: {
                    code: 'NOT_CONNECTED',
                    message: t('database.notConnected'),
                    sql,
                },
                database: this.shared.config?.database,
            };
        }

        let acquiredConn: Connection | null = null;
        try {
            this.shared.lastActivityTime = Date.now();

            // Use the transaction connection if active, otherwise acquire one
            // from the pool for the duration of this query.
            let queryConn: Connection;
            if (this.shared.transactionConnection) {
                queryConn = this.shared.transactionConnection;
            } else {
                acquiredConn = await this.shared.pool.connect();
                this.shared.activeConnectionCount++;
                queryConn = acquiredConn;
                this.shared.activeQueryConnections.set(queryId, acquiredConn);
            }

            try {
                const { finalSql, binds } = this.prepareSqlAndBinds(sql, params);
                // Pass the per-query timeout so ODBC aborts runaway queries.
                // ODBC's QueryOptions.timeout is in seconds; convert ms -> s.
                const timeoutSeconds = Math.max(1, Math.floor(DamengQueryAdapter.DEFAULT_QUERY_TIMEOUT_MS / 1000));
                const result = await queryConn.query<QueryRow, { timeout: number }>(
                    finalSql,
                    binds as Array<number | string>,
                    { timeout: timeoutSeconds },
                );
                const executionTime = Date.now() - startTime;

                // odbc's Result extends Array<T>, so the rows ARE the result
                // itself. `count` holds the affected-rows count for DML.
                const rows = Array.isArray(result) ? (result as QueryRow[]) : [];
                const columns = (result.columns ?? []).map(col => ({
                    name: col.name,
                    type: col.dataTypeName || String(col.dataType) || 'UNKNOWN',
                    nullable: col.nullable ?? true,
                    isPrimaryKey: false,
                    isAutoIncrement: false,
                    isEnum: false,
                }));

                const rowCount = rows.length;
                const affectedRows = typeof result.count === 'number' && result.count > 0
                    ? result.count
                    : undefined;

                return {
                    queryId,
                    status: 'success',
                    columns,
                    rows,
                    rowCount,
                    affectedRows,
                    executionTime,
                    database: this.shared.config?.database,
                };
            } finally {
                if (acquiredConn) {
                    this.shared.activeConnectionCount--;
                    this.shared.activeQueryConnections.delete(queryId);
                    try {
                        await acquiredConn.close();
                    } catch (e) {
                        console.debug('[SQL All in One] Dameng connection close error:', e);
                    }
                }
            }
        } catch (error: unknown) {
            const executionTime = Date.now() - startTime;
            const odbcError = error as { odbcErrors?: Array<{ code?: number; state?: string }>; message?: string };
            const firstError = odbcError.odbcErrors?.[0];
            const code = firstError?.code !== undefined
                ? `DM-${String(firstError.code)}`
                : (firstError?.state ?? 'EXEC_ERROR');
            return {
                queryId,
                status: 'error',
                columns: [],
                rows: [],
                rowCount: 0,
                executionTime,
                error: {
                    code,
                    message: error instanceof Error ? error.message : String(error),
                    sql,
                },
                database: this.shared.config?.database,
            };
        }
    }

    async executeBatch(statements: SqlStatement[]): Promise<QueryResult[]> {
        const results: QueryResult[] = [];
        for (const stmt of statements) {
            results.push(await this.execute(stmt.sql, stmt.params));
        }
        return results;
    }

    async beginTransaction(): Promise<void> {
        if (this.shared.transactionConnection) {
            throw new Error(t('database.transactionInProgress'));
        }
        if (!this.shared.pool) {
            throw new Error(t('database.notConnected'));
        }

        // Acquire a dedicated connection from the pool and start an explicit
        // transaction on it. Subsequent statements are routed through this
        // connection until commit/rollback.
        const conn = await this.shared.pool.connect();
        try {
            await conn.beginTransaction();
        } catch (e) {
            try {
                await conn.close();
            } catch (closeErr) {
                console.debug('[SQL All in One] Dameng close after beginTransaction error:', closeErr);
            }
            throw e;
        }
        this.shared.transactionConnection = conn;
    }

    async commit(): Promise<void> {
        if (!this.shared.transactionConnection) {
            throw new Error(t('database.noTransactionInProgress'));
        }

        const conn = this.shared.transactionConnection;
        try {
            await conn.commit();
        } finally {
            this.shared.transactionConnection = null;
            try {
                await conn.close();
            } catch (e) {
                console.debug('[SQL All in One] Dameng close after commit error:', e);
            }
        }
    }

    async rollback(): Promise<void> {
        if (!this.shared.transactionConnection) {
            throw new Error(t('database.noTransactionInProgress'));
        }

        const conn = this.shared.transactionConnection;
        try {
            await conn.rollback();
        } catch (rollbackError) {
            console.error('Dameng rollback failed:', rollbackError);
        } finally {
            this.shared.transactionConnection = null;
            try {
                await conn.close();
            } catch (e) {
                console.debug('[SQL All in One] Dameng close after rollback error:', e);
            }
        }
    }

    async cancelQuery(_queryId: string): Promise<void> {
        // ODBC does not expose a native cancel() on a running statement, and
        // the previous best-effort `ALTER SYSTEM KILL SESSION` approach was
        // unsafe: it targeted the most recently logged-in active session for
        // the same user, which on a shared pool could kill an unrelated
        // query from the same user.
        //
        // Cancellation is instead bounded by the per-query `timeout` option
        // passed to `connection.query(...)` in execute() (see
        // DEFAULT_QUERY_TIMEOUT_MS). This method is intentionally a no-op so
        // that callers can call it without risk, while runaway queries are
        // still terminated by the ODBC timeout.
        //
        // The associated activeQueryConnections entry is cleaned up lazily
        // by execute()'s finally block once the query returns/times out.
        void _queryId;
    }

    /**
     * Returns the per-query timeout (ms) passed to the odbc `query` options.
     * Exposed so callers can centralise timeout derivation if needed.
     */
    static getQueryTimeoutMs(): number {
        return DamengQueryAdapter.DEFAULT_QUERY_TIMEOUT_MS;
    }

    /**
     * Converts the QueryParam[] into the flat `Array<number|string>` shape
     * expected by the odbc driver. Booleans are coerced to 0/1 because ODBC
     * has no native boolean type; null/undefined are passed through as null
     * (ODBC treats unbound parameters as NULL). The SQL text is returned
     * unchanged because odbc uses `?` positional placeholders natively.
     *
     * Literal question marks inside string literals are preserved by the
     * caller: since we do not rewrite the SQL, the driver handles the
     * placeholder binding directly.
     */
    private prepareSqlAndBinds(
        sql: string,
        params?: QueryParam[]
    ): { finalSql: string; binds: Array<number | string | null> } {
        if (!params || params.length === 0) {
            return { finalSql: sql, binds: [] };
        }

        const binds: Array<number | string | null> = [];
        for (const p of params) {
            const v = p.value;
            if (v === null || v === undefined) {
                binds.push(null);
            } else if (typeof v === 'boolean') {
                binds.push(v ? 1 : 0);
            } else if (typeof v === 'number') {
                binds.push(v);
            } else {
                binds.push(String(v));
            }
        }
        return { finalSql: sql, binds };
    }
}
