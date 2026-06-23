import type { IQueryAdapter, QueryResult, QueryRow, QueryParam, SqlStatement } from './IDatabaseAdapter';
import type { PoolClient, QueryResult as PgQueryResult } from 'pg';
import type { PostgresSharedContext } from './PostgresSharedContext';
import { t } from '../../i18n/index';
import { generateShortId } from '../../utils/idGenerator';

export class PostgresQueryAdapter implements IQueryAdapter {
    constructor(private shared: PostgresSharedContext) {}

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
            const values = params?.map(p => p.value);
            let queryConn: PoolClient | typeof this.shared.pool = this.shared.transactionClient ?? this.shared.pool;
            let acquiredClient: PoolClient | null = null;

            if (!this.shared.transactionClient && this.shared.pool) {
                acquiredClient = await this.shared.pool.connect();
                this.shared.activeConnectionCount++;
                queryConn = acquiredClient;
                const pidRow = await acquiredClient.query('SELECT pg_backend_pid() AS pid');
                const pid = (pidRow.rows[0] as Record<string, unknown>)?.pid as number;
                this.shared.activeQueryPids.set(queryId, pid);
            }

            try {
                const pgResult: PgQueryResult = await queryConn.query(sql, values);
                const executionTime = Date.now() - startTime;

                const columns = pgResult.fields.map(field => ({
                    name: field.name,
                    type: String(field.dataTypeID ?? 'UNKNOWN'),
                    nullable: true,
                    isPrimaryKey: false,
                    isAutoIncrement: false,
                    isEnum: false,
                }));

                return {
                    queryId,
                    status: 'success',
                    columns,
                    rows: pgResult.rows as QueryRow[],
                    rowCount: pgResult.rowCount ?? pgResult.rows.length,
                    affectedRows: pgResult.rowCount ?? undefined,
                    executionTime,
                    database: this.shared.config?.database,
                };
            } finally {
                if (acquiredClient) {
                    this.shared.activeConnectionCount--;
                    acquiredClient.release();
                }
                this.shared.activeQueryPids.delete(queryId);
            }
        } catch (error: unknown) {
            const executionTime = Date.now() - startTime;
            const pgError = error as { code?: string; message?: string };
            return {
                queryId,
                status: 'error',
                columns: [],
                rows: [],
                rowCount: 0,
                executionTime,
                error: {
                    code: pgError.code ?? 'EXEC_ERROR',
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
        if (this.shared.transactionClient) {
            throw new Error(t('database.transactionInProgress'));
        }
        if (!this.shared.pool) {
            throw new Error(t('database.notConnected'));
        }

        this.shared.transactionClient = await this.shared.pool.connect();
        await this.shared.transactionClient.query('BEGIN');
    }

    async commit(): Promise<void> {
        if (!this.shared.transactionClient) {
            throw new Error(t('database.noTransactionInProgress'));
        }

        try {
            await this.shared.transactionClient.query('COMMIT');
        } finally {
            this.shared.transactionClient.release();
            this.shared.transactionClient = null;
        }
    }

    async rollback(): Promise<void> {
        if (!this.shared.transactionClient) {
            throw new Error(t('database.noTransactionInProgress'));
        }

        try {
            await this.shared.transactionClient.query('ROLLBACK');
            this.shared.transactionClient.release();
        } catch (rollbackError) {
            console.error('PG rollback failed:', rollbackError);
        } finally {
            this.shared.transactionClient = null;
        }
    }

    async cancelQuery(queryId: string): Promise<void> {
        if (!this.shared.pool) {
            return;
        }

        const pid = this.shared.activeQueryPids.get(queryId);
        if (!pid) {
            return;
        }

        try {
            const client = await this.shared.pool.connect();
            try {
                await client.query(`SELECT pg_cancel_backend(${pid})`);
            } finally {
                client.release();
            }
        } catch (e) {
            console.debug('[SQL All in One] PG cancel query error:', e);
        }
    }
}
