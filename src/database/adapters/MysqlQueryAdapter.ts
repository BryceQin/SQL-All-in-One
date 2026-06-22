import type { IQueryAdapter, QueryResult, QueryRow, QueryParam, SqlStatement } from './IDatabaseAdapter';
import type { Pool, PoolConnection, RowDataPacket, FieldPacket, ResultSetHeader } from 'mysql2/promise';
import type { MysqlSharedContext } from './MysqlSharedContext';
import { t } from '../../i18n/index';
import { generateShortId } from '../../utils/idGenerator';

export class MysqlQueryAdapter implements IQueryAdapter {
    constructor(private shared: MysqlSharedContext) {}

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
            const acquireTimeout = this.shared.config?.poolConfig?.acquireTimeout ?? 60000;
            let queryConn: Pool | PoolConnection = this.shared.transactionConnection ?? this.shared.pool;
            let acquiredConn: PoolConnection | null = null;

            if (!this.shared.transactionConnection && this.shared.pool) {
                acquiredConn = await this.acquireConnectionWithTimeout(acquireTimeout);
                this.shared.activeConnectionCount++;
                queryConn = acquiredConn;
                this.shared.activeQueryThreadIds.set(queryId, (acquiredConn as unknown as { threadId: number }).threadId);
            }

            try {
                const [result, fields] = await queryConn.query(sql, values);
                const executionTime = Date.now() - startTime;

                if (Array.isArray(result)) {
                    const rows = result as RowDataPacket[];
                    const fieldPackets = fields as FieldPacket[];

                    const columns = fieldPackets.map(field => {
                        const flags = field.flags as number;
                        return {
                            name: field.name,
                            type: String(field.type ?? 'UNKNOWN'),
                            nullable: (flags & 0x0001) === 0,
                            isPrimaryKey: (flags & 0x0002) !== 0,
                            isAutoIncrement: (flags & 0x0200) !== 0,
                            isEnum: field.columnType === 247,
                        };
                    });

                    return {
                        queryId,
                        status: 'success',
                        columns,
                        rows: rows as QueryRow[],
                        rowCount: rows.length,
                        executionTime,
                        database: this.shared.config?.database,
                    };
                } else {
                    const header = result as ResultSetHeader;
                    return {
                        queryId,
                        status: 'success',
                        columns: [],
                        rows: [],
                        rowCount: 0,
                        affectedRows: header.affectedRows,
                        executionTime,
                        database: this.shared.config?.database,
                    };
                }
            } finally {
                if (acquiredConn) {
                    this.shared.activeConnectionCount--;
                    acquiredConn.release();
                }
                this.shared.activeQueryThreadIds.delete(queryId);
            }
        } catch (error: unknown) {
            const executionTime = Date.now() - startTime;
            const mysqlError = error as { code?: string; errno?: number; sqlMessage?: string };
            return {
                queryId,
                status: 'error',
                columns: [],
                rows: [],
                rowCount: 0,
                executionTime,
                error: {
                    code: mysqlError.code ?? String(mysqlError.errno ?? 'EXEC_ERROR'),
                    message: mysqlError.sqlMessage ?? (error instanceof Error ? error.message : String(error)),
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

        this.shared.transactionConnection = await this.shared.pool.getConnection();
        await this.shared.transactionConnection.beginTransaction();
    }

    async commit(): Promise<void> {
        if (!this.shared.transactionConnection) {
            throw new Error(t('database.noTransactionInProgress'));
        }

        try {
            await this.shared.transactionConnection.commit();
        } finally {
            this.shared.transactionConnection.release();
            this.shared.transactionConnection = null;
        }
    }

    async rollback(): Promise<void> {
        if (!this.shared.transactionConnection) {
            throw new Error(t('database.noTransactionInProgress'));
        }

        try {
            await this.shared.transactionConnection.rollback();
            this.shared.transactionConnection.release();
        } catch (rollbackError) {
            this.shared.transactionConnection.destroy();
            console.error('Rollback failed, connection destroyed:', rollbackError);
        } finally {
            this.shared.transactionConnection = null;
        }
    }

    async cancelQuery(_queryId: string): Promise<void> {
        if (!this.shared.pool) {
            return;
        }

        const threadId = this.shared.activeQueryThreadIds.get(_queryId);
        if (!threadId) {
            return;
        }

        try {
            const conn = await this.shared.pool.getConnection();
            try {
                await conn.query(`KILL QUERY ${threadId}`);
            } finally {
                conn.release();
            }
        } catch (e) {
            console.debug('[SQL All in One] Cancel query error:', e);
        }
    }

    private async acquireConnectionWithTimeout(timeout: number): Promise<PoolConnection> {
        return new Promise<PoolConnection>((resolve, reject) => {
            let timedOut = false;
            const timer = setTimeout(() => {
                timedOut = true;
                reject(new Error(t('database.connectionAcquireTimeout', String(timeout))));
            }, timeout);

            this.shared.pool!.getConnection()
                .then((conn) => {
                    clearTimeout(timer);
                    if (timedOut) {
                        conn.release();
                    } else {
                        resolve(conn);
                    }
                })
                .catch((error: unknown) => {
                    clearTimeout(timer);
                    if (!timedOut) {
                        reject(error);
                    }
                });
        });
    }
}
