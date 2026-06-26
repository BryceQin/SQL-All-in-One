import type { IQueryAdapter, QueryResult, QueryRow, QueryParam, SqlStatement } from './IDatabaseAdapter';
import type { Request, IResult, IColumnMetadata } from 'mssql';
import type { SqlServerSharedContext } from './SqlServerSharedContext';
import { t } from '../../i18n/index';
import { generateShortId } from '../../utils/idGenerator';

/**
 * SQL Server query adapter.
 *
 * Executes queries via `pool.request().query(...)`. Transactions are managed
 * through mssql's Transaction object; queries issued while a transaction is
 * active are routed through `transaction.request()`. Query cancellation uses
 * `request.cancel()`.
 */
export class SqlServerQueryAdapter implements IQueryAdapter {
    constructor(private shared: SqlServerSharedContext) {}

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

        try {
            this.shared.lastActivityTime = Date.now();

            // Build the request from the transaction (if active) or the pool.
            const request = this.shared.transaction
                ? this.shared.transaction.request()
                : this.shared.pool.request();

            // Bind parameters positionally via @p1, @p2, ... (mssql uses named params).
            let finalSql = sql;
            if (params && params.length > 0) {
                const paramNames: string[] = [];
                params.forEach((p, idx) => {
                    const name = `p${idx + 1}`;
                    request.input(name, p.value);
                    paramNames.push(`@${name}`);
                });
                // Replace ? placeholders with named params in order.
                finalSql = this.replacePlaceholders(sql, paramNames);
            }

            // Track the request so it can be cancelled.
            this.shared.activeRequests.set(queryId, request);

            try {
                const result: IResult<unknown> = await request.query(finalSql);
                const executionTime = Date.now() - startTime;

                const recordset = result.recordset as unknown as QueryRow[] | undefined;
                const rows = recordset ?? [];
                const columns = this.extractColumns(result, request);

                const rowCount = rows.length;
                const affectedRows = result.rowsAffected.reduce((sum, n) => sum + n, 0);

                return {
                    queryId,
                    status: 'success',
                    columns,
                    rows,
                    rowCount,
                    affectedRows: affectedRows > 0 ? affectedRows : undefined,
                    executionTime,
                    database: this.shared.config?.database,
                };
            } finally {
                this.shared.activeRequests.delete(queryId);
            }
        } catch (error: unknown) {
            const executionTime = Date.now() - startTime;
            const mssqlError = error as { code?: string; message?: string };
            return {
                queryId,
                status: 'error',
                columns: [],
                rows: [],
                rowCount: 0,
                executionTime,
                error: {
                    code: mssqlError.code ?? 'EXEC_ERROR',
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
        if (this.shared.transaction) {
            throw new Error(t('database.transactionInProgress'));
        }
        if (!this.shared.pool) {
            throw new Error(t('database.notConnected'));
        }

        const transaction = this.shared.pool.transaction();
        await transaction.begin();
        this.shared.transaction = transaction;
    }

    async commit(): Promise<void> {
        if (!this.shared.transaction) {
            throw new Error(t('database.noTransactionInProgress'));
        }

        try {
            await this.shared.transaction.commit();
        } finally {
            this.shared.transaction = null;
        }
    }

    async rollback(): Promise<void> {
        if (!this.shared.transaction) {
            throw new Error(t('database.noTransactionInProgress'));
        }

        try {
            await this.shared.transaction.rollback();
        } catch (rollbackError) {
            console.error('SQL Server rollback failed:', rollbackError);
        } finally {
            this.shared.transaction = null;
        }
    }

    async cancelQuery(queryId: string): Promise<void> {
        const request = this.shared.activeRequests.get(queryId);
        if (!request) {
            return;
        }

        try {
            request.cancel();
        } catch (e) {
            console.debug('[SQL All in One] SQL Server cancel query error:', e);
        }
    }

    /**
     * Replaces `?` placeholders in the SQL string with the provided named
     * parameter references, in order. Literal question marks inside string
     * literals are preserved by tracking single-quote state.
     */
    private replacePlaceholders(sql: string, paramNames: string[]): string {
        if (paramNames.length === 0) {
            return sql;
        }

        let result = '';
        let paramIndex = 0;
        let inString = false;

        for (let i = 0; i < sql.length; i++) {
            const ch = sql[i];

            if (ch === "'") {
                // Toggle string state (handle escaped '' inside strings).
                if (inString && sql[i + 1] === "'") {
                    result += "''";
                    i++;
                    continue;
                }
                inString = !inString;
                result += ch;
                continue;
            }

            if (ch === '?' && !inString) {
                if (paramIndex < paramNames.length) {
                    result += paramNames[paramIndex++];
                } else {
                    result += ch;
                }
                continue;
            }

            result += ch;
        }

        return result;
    }

    private extractColumns(result: IResult<unknown>, _request: Request): QueryResult['columns'] {
        const recordset = (result.recordsets as unknown[] | undefined)?.[0] as
            | { columns?: IColumnMetadata }
            | undefined;
        const meta = recordset?.columns;
        if (!meta) {
            return [];
        }

        return Object.values(meta).map(col => ({
            name: col.name,
            type: typeof col.type === 'function' ? col.type.name : String(col.type ?? 'UNKNOWN'),
            nullable: col.nullable,
            isPrimaryKey: false,
            isAutoIncrement: col.identity,
            isEnum: false,
        }));
    }
}
