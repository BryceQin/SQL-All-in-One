import type { IQueryAdapter, QueryResult, QueryRow, QueryParam, SqlStatement } from './IDatabaseAdapter';
import type { SqliteSharedContext } from './SqliteSharedContext';
import { t } from '../../i18n/index';
import { generateShortId } from '../../utils/idGenerator';

export class SqliteQueryAdapter implements IQueryAdapter {
    constructor(private shared: SqliteSharedContext) {}

    async execute(sql: string, params?: QueryParam[]): Promise<QueryResult> {
        const startTime = Date.now();
        const queryId = generateShortId('query');

        if (!this.shared.db) {
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
            };
        }

        try {
            this.shared.lastActivityTime = Date.now();
            const values = params?.map(p => p.value);
            const trimmedSql = sql.trim().toUpperCase();

            if (trimmedSql.startsWith('SELECT') || trimmedSql.startsWith('PRAGMA') || trimmedSql.startsWith('WITH') || trimmedSql.startsWith('EXPLAIN')) {
                const stmt = this.shared.db.prepare(sql);
                const rows = values && values.length > 0 ? stmt.all(...values) as QueryRow[] : stmt.all() as QueryRow[];
                const columns = stmt.columns().map(col => ({
                    name: col.name,
                    type: String(col.type ?? 'UNKNOWN'),
                    nullable: true,
                    isPrimaryKey: false,
                    isAutoIncrement: false,
                    isEnum: false,
                }));

                return {
                    queryId,
                    status: 'success',
                    columns,
                    rows,
                    rowCount: rows.length,
                    executionTime: Date.now() - startTime,
                };
            } else {
                const info = values && values.length > 0
                    ? this.shared.db.prepare(sql).run(...values)
                    : this.shared.db.prepare(sql).run();

                return {
                    queryId,
                    status: 'success',
                    columns: [],
                    rows: [],
                    rowCount: 0,
                    affectedRows: info.changes,
                    executionTime: Date.now() - startTime,
                };
            }
        } catch (error: unknown) {
            const executionTime = Date.now() - startTime;
            const sqliteError = error as { code?: string; message?: string };
            return {
                queryId,
                status: 'error',
                columns: [],
                rows: [],
                rowCount: 0,
                executionTime,
                error: {
                    code: sqliteError.code ?? 'EXEC_ERROR',
                    message: error instanceof Error ? error.message : String(error),
                    sql,
                },
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
        if (this.shared.inTransaction) {
            throw new Error(t('database.transactionInProgress'));
        }
        if (!this.shared.db) {
            throw new Error(t('database.notConnected'));
        }
        this.shared.db.exec('BEGIN');
        this.shared.inTransaction = true;
    }

    async commit(): Promise<void> {
        if (!this.shared.inTransaction) {
            throw new Error(t('database.noTransactionInProgress'));
        }
        this.shared.db!.exec('COMMIT');
        this.shared.inTransaction = false;
    }

    async rollback(): Promise<void> {
        if (!this.shared.inTransaction) {
            throw new Error(t('database.noTransactionInProgress'));
        }
        try {
            this.shared.db!.exec('ROLLBACK');
        } catch (e) {
            console.error('SQLite rollback failed:', e);
        } finally {
            this.shared.inTransaction = false;
        }
    }

    async cancelQuery(_queryId: string): Promise<void> {
        if (!this.shared.db) {
            return;
        }
        try {
            (this.shared.db as unknown as { interrupt(): void }).interrupt();
        } catch (e) {
            console.debug('[SQL All in One] SQLite interrupt error:', e);
        }
    }
}
