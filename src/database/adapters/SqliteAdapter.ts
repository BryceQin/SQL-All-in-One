import type Database from 'better-sqlite3';
import { t } from '../../i18n/index';
import type {
    ColumnInfo,
    ConnectionConfig,
    DataTypeCategory,
    DatabaseInfo,
    DialectCapabilities,
    DialectMetadata,
    ExplainNode,
    ExplainResult,
    ForeignKeyInfo,
    IConnectionLifecycle,
    IMetadataAdapter,
    IQueryAdapter,
    ISchemaAdapter,
    IndexInfo,
    QueryParam,
    QueryResult,
    QueryRow,
    RoutineParameterInfo,
    TableInfo,
    TableStructure,
    TestConnectionResult,
    TriggerInfo,
    ViewInfo,
} from './IDatabaseAdapter';
import { BaseConnectionAdapter } from './BaseConnectionAdapter';
import { BaseDatabaseAdapter } from './BaseDatabaseAdapter';
import { BaseMetadataAdapter } from './BaseMetadataAdapter';
import { BaseQueryAdapter } from './BaseQueryAdapter';
import { BaseSharedContext } from './BaseSharedContext';

/**
 * SQLite shared context.
 *
 * Holds the better-sqlite3 Database handle and the in-transaction flag used
 * by the query/schema/connection sub-adapters. Common adapter-delegated
 * state (config / connectionId / activity counters / reap timer) is
 * inherited from {@link BaseSharedContext}.
 */
class SqliteSharedContext extends BaseSharedContext {
    db: Database.Database | null = null;
    inTransaction = false;
}

class SqliteConnectionAdapter extends BaseConnectionAdapter<SqliteSharedContext> {
    constructor(protected shared: SqliteSharedContext) {
        super();
    }

    async connect(config: ConnectionConfig): Promise<void> {
        try {
            const Database = (await import('better-sqlite3')).default;
            this.shared.db = new Database(config.host, { readonly: false });
            this.shared.db.pragma('journal_mode = WAL');
            this.shared.totalConnectionCount = 1;
            this.shared.activeConnectionCount = 0;
            this.shared.lastActivityTime = Date.now();
        } catch (error: unknown) {
            this.shared.db = null;
            throw this.formatConnectionError(error, config);
        }
    }

    async disconnect(): Promise<void> {
        if (this.shared.db) {
            if (this.shared.inTransaction) {
                try {
                    this.shared.db.exec('ROLLBACK');
                } catch (e) {
                    console.debug('[SQL All in One] SQLite rollback on disconnect:', e);
                }
                this.shared.inTransaction = false;
            }
            this.shared.db.close();
            this.shared.db = null;
        }
    }

    async testConnection(config: ConnectionConfig): Promise<TestConnectionResult> {
        const startTime = Date.now();
        let tempDb: import('better-sqlite3').Database | null = null;

        try {
            const Database = (await import('better-sqlite3')).default;
            tempDb = new Database(config.host, { readonly: true });
            const version = tempDb.prepare('SELECT sqlite_version() AS version').get() as Record<string, unknown>;
            const endTime = Date.now();
            return {
                success: true,
                serverVersion: `SQLite ${version.version}`,
                latency: endTime - startTime,
            };
        } catch (error: unknown) {
            const formatted = this.formatConnectionError(error, config);
            return {
                success: false,
                error: formatted.message,
            };
        } finally {
            if (tempDb) {
                tempDb.close();
            }
        }
    }

    async checkConnectionHealth(): Promise<boolean> {
        if (!this.shared.db) {
            return false;
        }
        try {
            this.shared.db.prepare('SELECT 1').get();
            return true;
        } catch (e) {
            console.debug('[SQL All in One] SqliteConnectionAdapter.checkConnectionHealth failed:', e);
            return false;
        }
    }

    protected override formatDriverSpecificError(error: unknown, config: ConnectionConfig): Error | undefined {
        const msg = error instanceof Error ? error.message : String(error);

        if (msg.includes('SQLITE_CANTOPEN') || msg.includes('unable to open database')) {
            return new Error(t('database.databaseNotExist', config.host, config.host));
        }
        if (msg.includes('SQLITE_READONLY')) {
            return new Error(t('database.sqliteReadonly', config.host));
        }

        // SQLite is file-based; there are no network/SSL errors to fall back
        // to, but the base class still wraps non-Error throws.
        return undefined;
    }
}

class SqliteQueryAdapter extends BaseQueryAdapter<SqliteSharedContext> {
    /**
     * SQLite's NOT_CONNECTED result historically omitted the `database` field
     * (SQLite has a single in-memory/on-disk database named `main` and does
     * not surface a `database` field on its results). Override to preserve
     * that exact shape rather than emitting `database: undefined`.
     */
    protected override buildNotConnectedResult(sql: string, queryId: string, startTime: number): QueryResult {
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

    protected override async executeWithConnection(sql: string, params: QueryParam[] | undefined, queryId: string, startTime: number): Promise<QueryResult> {
        const values = params?.map(p => p.value);
        const trimmedSql = sql.trim().toUpperCase();

        if (trimmedSql.startsWith('SELECT') || trimmedSql.startsWith('PRAGMA') || trimmedSql.startsWith('WITH') || trimmedSql.startsWith('EXPLAIN')) {
            const stmt = this.shared.db!.prepare(sql);
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
                ? this.shared.db!.prepare(sql).run(...values)
                : this.shared.db!.prepare(sql).run();

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
    }

    /**
     * SQLite-specific error mapping: extracts `error.code` from the
     * better-sqlite3 error shape (e.g. `SQLITE_CONSTRAINT`).
     *
     * Note: SQLite's error result historically omitted the `database` field
     * (matching {@link buildNotConnectedResult}); we preserve that here.
     */
    protected override mapError(error: unknown, sql: string, queryId: string, executionTime: number): QueryResult {
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

class SqliteMetadataAdapter extends BaseMetadataAdapter<SqliteSharedContext> {
    /**
     * SQLite has a single in-memory/on-disk database named `main`; there is
     * no catalog query to run. {@link listDatabases} is overridden end-to-end
     * to return this constant rather than going through {@link listDatabaseRows}.
     */
    protected async listDatabaseRows(): Promise<DatabaseInfo[]> {
        return [{ name: 'main' }];
    }

    override async listDatabases(): Promise<DatabaseInfo[]> {
        return [{ name: 'main' }];
    }

    async listSchemas(_database?: string): Promise<string[]> {
        return ['main'];
    }

    async listTables(_database?: string, _schema?: string, filter?: string): Promise<TableInfo[]> {
        let sql = `SELECT name, type FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`;
        const params: QueryParam[] = [];

        if (filter) {
            sql += ` AND name LIKE ?`;
            params.push({ value: `%${filter}%` });
        }

        sql += ` ORDER BY name`;
        return this.runListQuery<TableInfo>(sql, params, (row: QueryRow) => ({
            name: row.name as string,
            type: 'table',
        }));
    }

    async listViews(_database?: string, _schema?: string): Promise<ViewInfo[]> {
        const sql = `SELECT name FROM sqlite_master WHERE type = 'view' ORDER BY name`;
        return this.runListQuery<ViewInfo>(sql, undefined, (row: QueryRow) => ({
            name: row.name as string,
        }));
    }

    async listTriggers(_database?: string, _schema?: string): Promise<TriggerInfo[]> {
        const sql = `SELECT name, tbl_name, sql FROM sqlite_master WHERE type = 'trigger' ORDER BY name`;
        return this.runListQuery<TriggerInfo>(sql, undefined, (row: QueryRow) => {
            const sqlText = row.sql as string;
            const timingMatch = sqlText.match(/(?:BEFORE|AFTER|INSTEAD OF)/i);
            const eventMatch = sqlText.match(/(?:INSERT|UPDATE|DELETE)/i);
            return {
                name: row.name as string,
                event: eventMatch ? eventMatch[0].toUpperCase() : 'UNKNOWN',
                timing: timingMatch ? timingMatch[0].toUpperCase() : 'UNKNOWN',
                statement: sqlText,
            };
        });
    }
}

class SqliteSchemaAdapter implements ISchemaAdapter {
    constructor(
        private executeQuery: (sql: string, params?: QueryParam[]) => Promise<QueryResult>,
        private listTriggersFn: (database?: string, schema?: string) => Promise<TriggerInfo[]>
    ) {}

    async describeTable(_database: string, table: string, _schema?: string): Promise<TableStructure> {
        const [columns, indexes, foreignKeys, triggers] = await Promise.all([
            this.describeTableColumns(table),
            this.describeTableIndexes(table),
            this.describeTableForeignKeys(table),
            this.listTriggersFn(),
        ]);

        return { columns, indexes, foreignKeys, triggers };
    }

    async getTableDDL(_database: string, table: string, _schema?: string): Promise<string> {
        const result = await this.executeQuery(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`, [{ value: table }]);
        if (result.status !== 'success' || result.rows.length === 0) {
            return '';
        }
        return (result.rows[0].sql as string) ?? '';
    }

    async getViewDDL(_database: string, view: string, _schema?: string): Promise<string> {
        const result = await this.executeQuery(`SELECT sql FROM sqlite_master WHERE type = 'view' AND name = ?`, [{ value: view }]);
        if (result.status !== 'success' || result.rows.length === 0) {
            return '';
        }
        return (result.rows[0].sql as string) ?? '';
    }

    async getFunctionDDL(_database: string, _functionName: string, _schema?: string): Promise<string> {
        return '';
    }

    async getProcedureDDL(_database: string, _procedureName: string, _schema?: string): Promise<string> {
        return '';
    }

    async getTriggerDDL(_database: string, triggerName: string, _schema?: string): Promise<string> {
        const result = await this.executeQuery(`SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = ?`, [{ value: triggerName }]);
        if (result.status !== 'success' || result.rows.length === 0) {
            return '';
        }
        return (result.rows[0].sql as string) ?? '';
    }

    async getRoutineParameters(_database: string, _routineName: string, _routineType: 'FUNCTION' | 'PROCEDURE', _schema?: string): Promise<RoutineParameterInfo[]> {
        return [];
    }

    async getExplainPlan(_database: string, sql: string): Promise<ExplainResult> {
        const result = await this.executeQuery(`EXPLAIN QUERY PLAN ${sql}`);
        if (result.status !== 'success') {
            return { format: 'text', raw: '', nodes: [] };
        }

        const nodes = this.parseExplainRows(result.rows);
        return { format: 'text', raw: JSON.stringify(result.rows), nodes };
    }

    async getTableRowCount(_database: string, table: string, _schema?: string): Promise<number> {
        const result = await this.executeQuery(`SELECT COUNT(*) AS cnt FROM ${this.quoteIdentifier(table)}`);
        if (result.status !== 'success' || result.rows.length === 0) {
            return 0;
        }
        const cnt = result.rows[0].cnt;
        return cnt != null ? Number(cnt) : 0;
    }

    getDialectCapabilities(): DialectCapabilities {
        return {
            supportsSchema: false,
            supportsMultipleDatabases: false,
            maxConcurrentQueries: 1,
            supportsPreparedStatement: true,
            supportsExplain: true,
            supportsExplainAnalyze: false,
            supportsCancel: true,
            supportsSshTunnel: false,
            supportedObjectTypes: ['table', 'view', 'trigger', 'index'],
        };
    }

    getSupportedDataTypes(): DataTypeCategory[] {
        return [
            {
                category: 'Integer',
                types: [
                    { name: 'INTEGER' },
                    { name: 'INT' },
                    { name: 'TINYINT' },
                    { name: 'SMALLINT' },
                    { name: 'MEDIUMINT' },
                    { name: 'BIGINT' },
                    { name: 'UNSIGNED BIG INT' },
                ],
            },
            {
                category: 'Float',
                types: [
                    { name: 'REAL' },
                    { name: 'DOUBLE' },
                    { name: 'DOUBLE PRECISION' },
                    { name: 'FLOAT' },
                    { name: 'DECIMAL', needsPrecision: true, needsScale: true },
                ],
            },
            {
                category: 'String',
                types: [
                    { name: 'TEXT' },
                    { name: 'CHARACTER', needsLength: true },
                    { name: 'VARCHAR', needsLength: true },
                    { name: 'NCHAR', needsLength: true },
                    { name: 'NVARCHAR', needsLength: true },
                    { name: 'CLOB' },
                ],
            },
            {
                category: 'Date & Time',
                types: [
                    { name: 'DATE' },
                    { name: 'DATETIME' },
                    { name: 'TIMESTAMP' },
                    { name: 'TIME' },
                ],
            },
            {
                category: 'Binary',
                types: [{ name: 'BLOB' }],
            },
            {
                category: 'Other',
                types: [
                    { name: 'NUMERIC' },
                    { name: 'BOOLEAN' },
                    { name: 'NULL' },
                    { name: 'JSON' },
                ],
            },
        ];
    }

    quoteIdentifier(identifier: string): string {
        return '"' + identifier.replace(/"/g, '""') + '"';
    }

    private async describeTableColumns(table: string): Promise<ColumnInfo[]> {
        const result = await this.executeQuery(`PRAGMA table_info(${this.quoteIdentifier(table)})`);
        if (result.status !== 'success') {
            return [];
        }

        return result.rows.map((row: QueryRow) => {
            const typeStr = row.type as string;
            const lengthMatch = typeStr.match(/\((\d+)\)/);
            return {
                name: row.name as string,
                type: typeStr.replace(/\(.*\)/, '').trim(),
                length: lengthMatch ? parseInt(lengthMatch[1], 10) : undefined,
                nullable: Number(row.notnull) === 0,
                defaultValue: row.dflt_value as string | number | boolean | null,
                isPrimaryKey: Number(row.pk) > 0,
                isAutoIncrement: false,
                isUnique: false,
            };
        });
    }

    private async describeTableIndexes(table: string): Promise<IndexInfo[]> {
        const result = await this.executeQuery(`PRAGMA index_list(${this.quoteIdentifier(table)})`);
        if (result.status !== 'success') {
            return [];
        }

        const indexes: IndexInfo[] = [];
        for (const row of result.rows) {
            const indexName = row.name as string;
            const indexInfoResult = await this.executeQuery(`PRAGMA index_info(${this.quoteIdentifier(indexName)})`);
            const columns: string[] = [];
            if (indexInfoResult.status === 'success') {
                for (const infoRow of indexInfoResult.rows) {
                    columns.push(infoRow.name as string);
                }
            }
            indexes.push({
                name: indexName,
                type: 'btree',
                columns,
                isUnique: Number(row.unique) === 1,
                isPrimary: (row.origin as string) === 'pk',
            });
        }

        return indexes;
    }

    private async describeTableForeignKeys(table: string): Promise<ForeignKeyInfo[]> {
        const result = await this.executeQuery(`PRAGMA foreign_key_list(${this.quoteIdentifier(table)})`);
        if (result.status !== 'success') {
            return [];
        }

        const fkMap = new Map<number, ForeignKeyInfo>();
        for (const row of result.rows) {
            const id = Number(row.id);
            if (!fkMap.has(id)) {
                fkMap.set(id, {
                    name: `fk_${id}`,
                    columns: [],
                    referencedTable: row.table as string,
                    referencedColumns: [],
                    onDelete: (row.on_delete as string) || 'NO ACTION',
                    onUpdate: (row.on_update as string) || 'NO ACTION',
                });
            }
            const fk = fkMap.get(id)!;
            fk.columns.push(row.from as string);
            fk.referencedColumns.push(row.to as string);
        }

        return Array.from(fkMap.values());
    }

    private parseExplainRows(rows: QueryRow[]): ExplainNode[] {
        const nodes: ExplainNode[] = [];
        let idCounter = 0;

        for (const row of rows) {
            nodes.push({
                id: String(++idCounter),
                operation: (row.detail as string) ?? 'unknown',
                children: [],
            });
        }

        return nodes;
    }
}

/**
 * SQLite database adapter.
 *
 * Assembles the five SQLite sub-adapters (shared context, connection, query,
 * metadata, schema) via the 5 factory methods declared on
 * {@link BaseDatabaseAdapter}. All common lifecycle / status / reap logic is
 * inherited from the base class; the idle-reap behavior is overridden because
 * SQLite has a single in-process connection rather than a network pool.
 */
export class SqliteAdapter extends BaseDatabaseAdapter<SqliteSharedContext> {
    protected override createSharedContext(): SqliteSharedContext {
        return new SqliteSharedContext(this);
    }
    protected override createConnectionAdapter(): IConnectionLifecycle {
        return new SqliteConnectionAdapter(this.shared);
    }
    protected override createQueryAdapter(): IQueryAdapter {
        return new SqliteQueryAdapter(this.shared);
    }
    protected override createMetadataAdapter(): IMetadataAdapter {
        return new SqliteMetadataAdapter(
            this.shared,
            (sql, params) => this.queryAdapter.execute(sql, params)
        );
    }
    protected override createSchemaAdapter(): ISchemaAdapter {
        return new SqliteSchemaAdapter(
            (sql, params) => this.queryAdapter.execute(sql, params),
            (db, schema) => this.metadataAdapter.listTriggers(db, schema)
        );
    }

    /**
     * SQLite has a single in-process connection (better-sqlite3), not a
     * network pool. Reap unconditionally when invoked, mirroring the prior
     * SQLite-only behaviour.
     */
    protected override async reapIdleConnections(_idleTimeout: number): Promise<void> {
        if (!this.isConnected_) return;
        try {
            await this.connectionAdapter.reapIdleConnections();
        } catch (e) {
            console.debug('[SQL All in One] SQLite reap idle connections error:', e);
        }
    }

    static getDialectMetadata(): DialectMetadata {
        return {
            dialect: 'sqlite',
            displayName: 'SQLite',
            defaultPort: 0,
            defaultUsername: '',
            iconKey: 'sqlite',
            supportsSshTunnel: false,
            supportsSsl: false,
            isFileBased: true
        };
    }
}
