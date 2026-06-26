import type { IQueryAdapter, QueryResult, QueryRow, QueryParam, SqlStatement } from './IDatabaseAdapter';
import type { Connection } from 'oracledb';
import type { OracleSharedContext } from './OracleSharedContext';
import { t } from '../../i18n/index';
import { generateShortId } from '../../utils/idGenerator';

/**
 * Oracle query adapter.
 *
 * Executes queries via `connection.execute(...)` with `outFormat: OBJECT` so
 * rows are returned as objects keyed by column name. `autoCommit` is disabled
 * so that the adapter controls transaction boundaries explicitly via
 * beginTransaction/commit/rollback.
 *
 * Transactions are managed through a dedicated connection acquired from the
 * pool; queries issued while a transaction is active are routed through that
 * connection. Query cancellation uses `connection.break()` (an alias for
 * `breakExecution()`).
 */
export class OracleQueryAdapter implements IQueryAdapter {
    constructor(private shared: OracleSharedContext) {}

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
                acquiredConn = await this.shared.pool.getConnection();
                this.shared.activeConnectionCount++;
                queryConn = acquiredConn;
                this.shared.activeQueryConnections.set(queryId, acquiredConn);
            }

            try {
                const oracledb = await import('oracledb');
                // Map ? placeholders to oracledb named binds (:1, :2, ...).
                const { finalSql, binds } = this.prepareSqlAndBinds(sql, params);

                const result = await queryConn.execute<QueryRow>(finalSql, binds, {
                    outFormat: oracledb.OUT_FORMAT_OBJECT,
                    autoCommit: false,
                    extendedMetaData: true,
                });
                const executionTime = Date.now() - startTime;

                const rows = (result.rows ?? []) as QueryRow[];
                const columns = (result.metaData ?? []).map(meta => ({
                    name: meta.name,
                    type: String(meta.dbType ?? meta.fetchType ?? 'UNKNOWN'),
                    nullable: meta.nullable ?? true,
                    isPrimaryKey: false,
                    isAutoIncrement: false,
                    isEnum: false,
                }));

                const rowCount = rows.length;
                const affectedRows = typeof result.rowsAffected === 'number' ? result.rowsAffected : undefined;

                return {
                    queryId,
                    status: 'success',
                    columns,
                    rows,
                    rowCount,
                    affectedRows: affectedRows !== undefined && affectedRows > 0 ? affectedRows : undefined,
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
                        console.debug('[SQL All in One] Oracle connection close error:', e);
                    }
                }
            }
        } catch (error: unknown) {
            const executionTime = Date.now() - startTime;
            const oracleError = error as { errorNum?: number; message?: string };
            const code = oracleError.errorNum ? `ORA-${String(oracleError.errorNum).padStart(5, '0')}` : 'EXEC_ERROR';
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

        // Oracle does not have an explicit BEGIN TRANSACTION statement; an
        // implicit transaction starts on the first DML. We acquire a dedicated
        // connection from the pool and hold it until commit/rollback so that
        // subsequent statements are routed through the same transaction.
        this.shared.transactionConnection = await this.shared.pool.getConnection();
        // Disable auto-commit just to be explicit (oracledb defaults to false
        // but we make the intent clear).
    }

    async commit(): Promise<void> {
        if (!this.shared.transactionConnection) {
            throw new Error(t('database.noTransactionInProgress'));
        }

        try {
            await this.shared.transactionConnection.commit();
        } finally {
            try {
                await this.shared.transactionConnection.close();
            } catch (e) {
                console.debug('[SQL All in One] Oracle close after commit error:', e);
            }
            this.shared.transactionConnection = null;
        }
    }

    async rollback(): Promise<void> {
        if (!this.shared.transactionConnection) {
            throw new Error(t('database.noTransactionInProgress'));
        }

        try {
            await this.shared.transactionConnection.rollback();
        } catch (rollbackError) {
            console.error('Oracle rollback failed:', rollbackError);
        } finally {
            try {
                await this.shared.transactionConnection.close();
            } catch (e) {
                console.debug('[SQL All in One] Oracle close after rollback error:', e);
            }
            this.shared.transactionConnection = null;
        }
    }

    async cancelQuery(queryId: string): Promise<void> {
        // Prefer the connection tracked for this query id; fall back to the
        // transaction connection (queries issued inside a transaction share it).
        const conn = this.shared.activeQueryConnections.get(queryId) ?? this.shared.transactionConnection;
        if (!conn) {
            return;
        }

        try {
            // break() is the documented alias for breakExecution() in oracledb.
            await conn.break();
        } catch (e) {
            console.debug('[SQL All in One] Oracle cancel query error:', e);
        }
    }

    /**
     * Converts `?` placeholders in the SQL string to oracledb named binds
     * (`:1`, `:2`, ...) and builds the bind values array in order. Literal
     * question marks inside string literals are preserved by tracking
     * single-quote state.
     *
     * oracledb accepts either a positional array (matching :1, :2, ...) or an
     * object keyed by bind name. We use the positional array form because it
     * matches the existing QueryParam[] shape used by the other adapters.
     */
    private prepareSqlAndBinds(
        sql: string,
        params?: QueryParam[]
    ): { finalSql: string; binds: unknown[] } {
        const binds: unknown[] = [];
        if (!params || params.length === 0) {
            return { finalSql: sql, binds };
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
                if (paramIndex < params.length) {
                    const param = params[paramIndex++];
                    result += `:${paramIndex}`;
                    binds.push(param.value);
                } else {
                    result += ch;
                }
                continue;
            }

            result += ch;
        }

        return { finalSql: result, binds };
    }
}
