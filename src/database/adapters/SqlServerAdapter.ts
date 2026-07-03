import type {
    DialectMetadata,
    IConnectionLifecycle,
    IMetadataAdapter,
    IQueryAdapter,
    ISchemaAdapter,
    ConnectionConfig,
    TestConnectionResult,
    QueryResult,
    QueryRow,
    QueryParam,
    DatabaseInfo,
    TableInfo,
    ViewInfo,
    FunctionInfo,
    ProcedureInfo,
    TriggerInfo,
    ColumnInfo,
    IndexInfo,
    ForeignKeyInfo,
    TableStructure,
    RoutineParameterInfo,
    DialectCapabilities,
    DataTypeCategory,
    ExplainResult,
    ExplainNode,
} from './IDatabaseAdapter';
import type { ConnectionPool, Request, Transaction, IResult, IColumnMetadata, config as MssqlConfig } from 'mssql';
import { BaseSharedContext } from './BaseSharedContext';
import { BaseConnectionAdapter } from './BaseConnectionAdapter';
import { BaseQueryAdapter } from './BaseQueryAdapter';
import { BaseMetadataAdapter } from './BaseMetadataAdapter';
import { BaseSchemaAdapter } from './BaseSchemaAdapter';
import { getSystemDatabases } from '../../utils/systemDatabases';
import { BaseDatabaseAdapter } from './BaseDatabaseAdapter';
import { t } from '../../i18n/index';
import { replaceQuestionMarkPlaceholders } from './placeholderRewriter';

/**
 * SQL Server shared context.
 *
 * Holds the mssql ConnectionPool and the transaction-scoped Request used by
 * the query/schema adapters. Mirrors the structure of MysqlSharedContext but
 * uses the mssql driver types (ConnectionPool/Request/Transaction). Common
 * adapter-delegated state (config / connectionId / activity counters /
 * reap timer) is inherited from {@link BaseSharedContext}.
 */
class SqlServerSharedContext extends BaseSharedContext {
    // SQL Server shared state
    pool: ConnectionPool | null = null;
    transaction: Transaction | null = null;
    activeRequests = new Map<string, Request>();
}

/**
 * SQL Server connection pool operations.
 *
 * Uses the mssql npm package (which wraps the tedious TDS driver). The driver
 * is loaded via dynamic import so it stays in the esbuild `external` list and
 * is only required when a SQL Server connection is actually used.
 *
 * Used internally by SqlServerAdapter; common lifecycle logic lives in
 * BaseDatabaseAdapter.
 */
class SqlServerConnectionAdapter extends BaseConnectionAdapter<SqlServerSharedContext> {
    constructor(protected shared: SqlServerSharedContext) {
        super();
    }

    async connect(config: ConnectionConfig): Promise<void> {
        const poolConfig = this.createPoolConfig(config);

        try {
            const mssql = await import('mssql');
            const pool = new mssql.ConnectionPool(poolConfig);
            await pool.connect();

            // Verify connectivity with a trivial query.
            const request = pool.request();
            await request.query('SELECT 1');

            this.shared.pool = pool;
            this.shared.totalConnectionCount = config.poolConfig?.minConnections ?? 1;
            this.shared.activeConnectionCount = 0;
            this.shared.lastActivityTime = Date.now();
        } catch (error: unknown) {
            this.shared.pool = null;
            throw this.formatConnectionError(error, config);
        }
    }

    async disconnect(): Promise<void> {
        if (this.shared.transaction) {
            try {
                await this.shared.transaction.rollback();
            } catch (e) {
                console.debug('[SQL All in One] SQL Server rollback error on disconnect:', e);
            }
            this.shared.transaction = null;
        }

        if (this.shared.pool) {
            await this.shared.pool.close();
            this.shared.pool = null;
        }
    }

    async testConnection(config: ConnectionConfig): Promise<TestConnectionResult> {
        const startTime = Date.now();
        let tempPool: ConnectionPool | null = null;

        try {
            const mssql = await import('mssql');
            tempPool = new mssql.ConnectionPool(this.createPoolConfig(config));
            await tempPool.connect();

            const request = tempPool.request();
            const result = await request.query('SELECT @@VERSION AS version');
            const endTime = Date.now();

            const versionRow = result.recordset[0] as Record<string, unknown> | undefined;
            const serverVersion = (versionRow?.version as string)?.split('\n')[0]?.trim() ?? 'SQL Server';

            return {
                success: true,
                serverVersion,
                latency: endTime - startTime,
            };
        } catch (error: unknown) {
            const formatted = this.formatConnectionError(error, config);
            return {
                success: false,
                error: formatted.message,
            };
        } finally {
            if (tempPool) {
                try {
                    await tempPool.close();
                } catch (e) {
                    console.debug('[SQL All in One] SQL Server temp pool close error:', e);
                }
            }
        }
    }

    async checkConnectionHealth(): Promise<boolean> {
        if (!this.shared.pool) {
            return false;
        }

        try {
            const request = this.shared.pool.request();
            await request.query('SELECT 1');
            return true;
        } catch (e) {
            console.debug('[SQL All in One] SqlServerConnectionAdapter.checkConnectionHealth failed:', e);
            return false;
        }
    }


    protected override formatDriverSpecificError(error: unknown, config: ConnectionConfig): Error | undefined {
        const msg = error instanceof Error ? error.message : String(error);
        const hostPort = `${config.host}:${config.port}`;

        // mssql/tedious error codes (MSSQLError.code)
        const code = (error as { code?: string })?.code;
        if (code === 'ELOGIN' || msg.includes('Login failed')) {
            return new Error(t('database.accessDenied', config.username, hostPort));
        }
        if (code === 'EINSTLOOKUP' || msg.includes('Server not found') || msg.includes('Cannot connect to server')) {
            return new Error(t('database.hostNotFound', config.host));
        }
        if (code === 'ETIMEOUT' || msg.includes('timeout') || msg.includes('Timeout')) {
            return new Error(t('database.connectionTimedOut', hostPort));
        }
        if (code === 'ESOCKET' || msg.includes('socket') || msg.includes('ECONNRESET')) {
            return new Error(t('database.connectionLost', hostPort));
        }

        // SSL/certificate and common network errors are handled by the base
        // class (BaseConnectionAdapter).
        return undefined;
    }

    private createPoolConfig(config: ConnectionConfig): MssqlConfig {
        const poolConfig: MssqlConfig = {
            server: config.host,
            port: config.port,
            user: config.username,
            password: config.password,
            database: config.database,
            connectionTimeout: config.connectTimeout ?? 10000,
            requestTimeout: config.options?.requestTimeout as number | undefined,
            pool: {
                min: config.poolConfig?.minConnections ?? 1,
                max: config.poolConfig?.maxConnections ?? 5,
                idleTimeoutMillis: config.poolConfig?.idleTimeout ?? 30000,
            },
            options: {
                encrypt: config.ssl?.enabled ?? false,
                trustServerCertificate: config.ssl?.enabled ? (config.ssl.rejectUnauthorized === false) : true,
            },
        };

        // Allow dialect-specific options (e.g. appName, domain) to pass through.
        if (config.options) {
            const opts = config.options;
            if (typeof opts.appName === 'string') {
                (poolConfig.options as Record<string, unknown>).appName = opts.appName;
            }
            if (typeof opts.domain === 'string') {
                poolConfig.domain = opts.domain;
            }
            if (typeof opts.charset === 'string') {
                (poolConfig.options as Record<string, unknown>).collation = opts.charset;
            }
        }

        return poolConfig;
    }
}

/**
 * SQL Server query adapter.
 *
 * Executes queries via `pool.request().query(...)`. Transactions are managed
 * through mssql's Transaction object; queries issued while a transaction is
 * active are routed through `transaction.request()`. Query cancellation uses
 * `request.cancel()`.
 */
class SqlServerQueryAdapter extends BaseQueryAdapter<SqlServerSharedContext> {
    protected override async executeWithConnection(sql: string, params: QueryParam[] | undefined, queryId: string, startTime: number): Promise<QueryResult> {
        // Build the request from the transaction (if active) or the pool.
        const request = this.shared.transaction
            ? this.shared.transaction.request()
            : this.shared.pool!.request();

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
            finalSql = replaceQuestionMarkPlaceholders(
                sql,
                (index) => (index <= paramNames.length ? paramNames[index - 1] : undefined),
            ).sql;
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
    }

    /**
     * SQL Server / mssql-specific error mapping: extracts `error.code`
     * (e.g. `ELOGIN`, `EREQUEST`).
     */
    protected override mapError(error: unknown, sql: string, queryId: string, executionTime: number): QueryResult {
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

/**
 * SQL Server metadata adapter.
 *
 * Queries the SQL Server catalog views (sys.databases, sys.tables, sys.views,
 * sys.procedures, sys.objects, sys.triggers) to enumerate database objects.
 * The current database context is provided by the shared config; cross-database
 * listing is supported via three-part naming where applicable.
 */
class SqlServerMetadataAdapter extends BaseMetadataAdapter<SqlServerSharedContext> {
    override async listDatabaseRows(): Promise<DatabaseInfo[]> {
        return this.runListQuery<DatabaseInfo>(
            `SELECT name FROM sys.databases WHERE state = 0 ORDER BY name`,
            undefined,
            (row: QueryRow) => ({ name: row.name as string }),
        );
    }

    async listSchemas(_database?: string): Promise<string[]> {
        const result = await this.executeQuery(
            `SELECT name FROM sys.schemas ORDER BY name`
        );
        if (result.status !== 'success') {
            return [];
        }

        return result.rows
            .map((row: QueryRow) => row.name as string)
            .filter((name: string) => !name.startsWith('sys') && name !== 'INFORMATION_SCHEMA');
    }

    async listTables(database?: string, _schema?: string, filter?: string): Promise<TableInfo[]> {
        const db = database ?? this.shared.config?.database;
        if (!db) {
            return [];
        }

        let sql = `SELECT t.name AS table_name, t.type AS type_desc FROM ${this.quoteIdentifier(db)}.sys.tables t WHERE t.is_ms_shipped = 0`;
        const params: QueryParam[] = [];

        if (filter) {
            sql += ` AND t.name LIKE @filter`;
            params.push({ name: 'filter', value: `%${filter}%` });
        }

        sql += ` ORDER BY t.name`;

        return this.runListQuery<TableInfo>(sql, params, (row: QueryRow) => ({
            name: row.table_name as string,
            type: row.type_desc as string,
        }));
    }

    async listViews(database?: string, _schema?: string): Promise<ViewInfo[]> {
        const db = database ?? this.shared.config?.database;
        if (!db) {
            return [];
        }

        const sql = `SELECT v.name AS view_name FROM ${this.quoteIdentifier(db)}.sys.views v WHERE v.is_ms_shipped = 0 ORDER BY v.name`;
        return this.runListQuery<ViewInfo>(sql, undefined, (row: QueryRow) => ({
            name: row.view_name as string,
        }));
    }

    override async listProcedures(database?: string, _schema?: string): Promise<ProcedureInfo[]> {
        const db = database ?? this.shared.config?.database;
        if (!db) {
            return [];
        }

        const sql = `SELECT p.name AS procedure_name FROM ${this.quoteIdentifier(db)}.sys.procedures p WHERE p.is_ms_shipped = 0 ORDER BY p.name`;
        return this.runListQuery<ProcedureInfo>(sql, undefined, (row: QueryRow) => ({
            name: row.procedure_name as string,
        }));
    }

    override async listFunctions(database?: string, _schema?: string): Promise<FunctionInfo[]> {
        const db = database ?? this.shared.config?.database;
        if (!db) {
            return [];
        }

        const sql = `SELECT o.name AS function_name, o.type AS type_desc FROM ${this.quoteIdentifier(db)}.sys.objects o WHERE o.type IN ('FN', 'IF', 'TF') AND o.is_ms_shipped = 0 ORDER BY o.name`;
        return this.runListQuery<FunctionInfo>(sql, undefined, (row: QueryRow) => ({
            name: row.function_name as string,
            returns: row.type_desc as string,
        }));
    }

    async listTriggers(database?: string, _schema?: string): Promise<TriggerInfo[]> {
        const db = database ?? this.shared.config?.database;
        if (!db) {
            return [];
        }

        const sql = `SELECT tr.name AS trigger_name, OBJECTPROPERTY(tr.object_id, 'ExecIsUpdateTrigger') AS is_update, OBJECTPROPERTY(tr.object_id, 'ExecIsInsertTrigger') AS is_insert, OBJECTPROPERTY(tr.object_id, 'ExecIsDeleteTrigger') AS is_delete, OBJECTPROPERTY(tr.object_id, 'ExecIsAfterTrigger') AS is_after FROM ${this.quoteIdentifier(db)}.sys.triggers tr WHERE tr.parent_class = 1 AND tr.is_ms_shipped = 0 ORDER BY tr.name`;
        return this.runListQuery<TriggerInfo>(sql, undefined, (row: QueryRow) => {
            const events: string[] = [];
            if (row.is_update) events.push('UPDATE');
            if (row.is_insert) events.push('INSERT');
            if (row.is_delete) events.push('DELETE');
            return {
                name: row.trigger_name as string,
                event: events.join(',') || 'UNKNOWN',
                timing: row.is_after ? 'AFTER' : 'INSTEAD OF',
                statement: '',
            };
        });
    }

    protected override isSystemDatabase(name: string): boolean {
        return getSystemDatabases('sqlserver').includes(name.toLowerCase());
    }

    private quoteIdentifier(identifier: string): string {
        return '[' + identifier.replace(/]/g, ']]') + ']';
    }
}

/**
 * SQL Server schema adapter.
 *
 * SQL Server has no native `SHOW CREATE TABLE`; getTableDDL reconstructs a
 * CREATE TABLE statement from sys.columns. The execution plan is obtained via
 * `SET SHOWPLAN_XML ON` followed by executing the query (which returns the
 * plan XML without actually running the statement).
 *
 * Common scaffolding (constructor wiring, `quoteIdentifier` parameterised by
 * the `'['` quote char, `validateIdentifier` with the default 128-char
 * limit, list-query / row-count / Map-accumulator helpers) is inherited
 * from {@link BaseSchemaAdapter}.
 */
class SqlServerSchemaAdapter extends BaseSchemaAdapter<SqlServerSharedContext> {
    protected readonly quoteChar = '[' as const;

    async describeTable(database: string, table: string, schema?: string): Promise<TableStructure> {
        const [columns, indexes, foreignKeys, triggers] = await Promise.all([
            this.describeTableColumns(database, table),
            this.describeTableIndexes(database, table),
            this.describeTableForeignKeys(database, table),
            this.listTriggersFn(database, schema),
        ]);

        return { columns, indexes, foreignKeys, triggers };
    }

    async getTableDDL(database: string, table: string, _schema?: string): Promise<string> {
        this.validateIdentifier(database);
        this.validateIdentifier(table);

        const [columns, indexes, foreignKeys] = await Promise.all([
            this.describeTableColumns(database, table),
            this.describeTableIndexes(database, table),
            this.describeTableForeignKeys(database, table),
        ]);

        if (columns.length === 0) {
            return '';
        }

        const columnDefs = columns.map(c => {
            let def = `    ${this.quoteIdentifier(c.name)} ${c.type}`;
            if (!c.nullable) def += ' NOT NULL';
            if (c.isAutoIncrement) def += ' IDENTITY(1,1)';
            if (c.defaultValue !== null && c.defaultValue !== undefined && !c.isAutoIncrement) {
                def += ` DEFAULT ${c.defaultValue}`;
            }
            return def;
        });

        // Inline PRIMARY KEY constraint if present.
        const pkColumns = columns.filter(c => c.isPrimaryKey).map(c => this.quoteIdentifier(c.name));
        if (pkColumns.length > 0) {
            columnDefs.push(`    CONSTRAINT [PK_${table}] PRIMARY KEY (${pkColumns.join(', ')})`);
        }

        let ddl = `CREATE TABLE ${this.quoteIdentifier(database)}.${this.quoteIdentifier(table)} (\n${columnDefs.join(',\n')}\n);`;

        // Non-clustered indexes (skip the PK which is already declared above).
        const indexDefs = indexes
            .filter(i => !i.isPrimary)
            .map(i => {
                const unique = i.isUnique ? 'UNIQUE ' : '';
                return `CREATE ${unique}INDEX ${this.quoteIdentifier(i.name)} ON ${this.quoteIdentifier(database)}.${this.quoteIdentifier(table)} (${i.columns.map(c => this.quoteIdentifier(c)).join(', ')});`;
            });
        if (indexDefs.length > 0) {
            ddl += '\n' + indexDefs.join('\n');
        }

        const fkDefs = foreignKeys.map(fk => {
            const cols = fk.columns.map(c => this.quoteIdentifier(c)).join(', ');
            const refCols = fk.referencedColumns.map(c => this.quoteIdentifier(c)).join(', ');
            const onDelete = fk.onDelete && fk.onDelete !== 'NO ACTION' ? ` ON DELETE ${fk.onDelete}` : '';
            const onUpdate = fk.onUpdate && fk.onUpdate !== 'NO ACTION' ? ` ON UPDATE ${fk.onUpdate}` : '';
            return `ALTER TABLE ${this.quoteIdentifier(database)}.${this.quoteIdentifier(table)} ADD CONSTRAINT ${this.quoteIdentifier(fk.name)} FOREIGN KEY (${cols}) REFERENCES ${this.quoteIdentifier(database)}.${this.quoteIdentifier(fk.referencedTable)} (${refCols})${onDelete}${onUpdate};`;
        });
        if (fkDefs.length > 0) {
            ddl += '\n' + fkDefs.join('\n');
        }

        return ddl;
    }

    async getViewDDL(database: string, view: string, _schema?: string): Promise<string> {
        this.validateIdentifier(database);
        this.validateIdentifier(view);
        const sql = `SELECT m.definition AS definition FROM ${this.quoteIdentifier(database)}.sys.sql_modules m JOIN ${this.quoteIdentifier(database)}.sys.objects o ON m.object_id = o.object_id WHERE o.type = 'V' AND o.name = @name`;
        const result = await this.executeQuery(sql, [{ name: 'name', value: view }]);
        if (result.status !== 'success' || result.rows.length === 0) {
            return '';
        }
        return (result.rows[0].definition as string) ?? '';
    }

    async getFunctionDDL(database: string, functionName: string, _schema?: string): Promise<string> {
        this.validateIdentifier(database);
        this.validateIdentifier(functionName);
        const sql = `SELECT m.definition AS definition FROM ${this.quoteIdentifier(database)}.sys.sql_modules m JOIN ${this.quoteIdentifier(database)}.sys.objects o ON m.object_id = o.object_id WHERE o.type IN ('FN', 'IF', 'TF') AND o.name = @name`;
        const result = await this.executeQuery(sql, [{ name: 'name', value: functionName }]);
        if (result.status !== 'success' || result.rows.length === 0) {
            return '';
        }
        return (result.rows[0].definition as string) ?? '';
    }

    async getProcedureDDL(database: string, procedureName: string, _schema?: string): Promise<string> {
        this.validateIdentifier(database);
        this.validateIdentifier(procedureName);
        const sql = `SELECT m.definition AS definition FROM ${this.quoteIdentifier(database)}.sys.sql_modules m JOIN ${this.quoteIdentifier(database)}.sys.procedures p ON m.object_id = p.object_id WHERE p.name = @name`;
        const result = await this.executeQuery(sql, [{ name: 'name', value: procedureName }]);
        if (result.status !== 'success' || result.rows.length === 0) {
            return '';
        }
        return (result.rows[0].definition as string) ?? '';
    }

    async getTriggerDDL(database: string, triggerName: string, _schema?: string): Promise<string> {
        this.validateIdentifier(database);
        this.validateIdentifier(triggerName);
        const sql = `SELECT m.definition AS definition FROM ${this.quoteIdentifier(database)}.sys.sql_modules m JOIN ${this.quoteIdentifier(database)}.sys.triggers tr ON m.object_id = tr.object_id WHERE tr.name = @name`;
        const result = await this.executeQuery(sql, [{ name: 'name', value: triggerName }]);
        if (result.status !== 'success' || result.rows.length === 0) {
            return '';
        }
        return (result.rows[0].definition as string) ?? '';
    }

    async getRoutineParameters(database: string, routineName: string, _routineType: 'FUNCTION' | 'PROCEDURE', _schema?: string): Promise<RoutineParameterInfo[]> {
        this.validateIdentifier(database);
        this.validateIdentifier(routineName);
        const sql = `SELECT p.name AS parameter_name, TYPE_NAME(p.user_type_id) AS data_type, p.is_output AS is_output FROM ${this.quoteIdentifier(database)}.sys.parameters p WHERE p.object_id = OBJECT_ID(@qualified) AND p.name IS NOT NULL ORDER BY p.parameter_id`;
        const qualified = `${database}..${routineName}`;
        const result = await this.executeQuery(sql, [{ name: 'qualified', value: qualified }]);
        if (result.status !== 'success') {
            return [];
        }

        return result.rows.map((row: QueryRow) => ({
            name: (row.parameter_name as string).replace(/^@/, ''),
            type: row.data_type as string,
            direction: row.is_output ? 'OUT' : 'IN',
        }));
    }

    async getExplainPlan(database: string, sql: string): Promise<ExplainResult> {
        if (!this.shared.pool) {
            return { format: 'xml', raw: '', nodes: [] };
        }

        // SHOWPLAN_XML is a session-level setting. If `SET SHOWPLAN_XML OFF`
        // fails (e.g. the connection drops) and the connection were returned
        // to the pool, every subsequent query on that connection would return
        // XML plans instead of executing. We pin the SET ON / query / SET OFF
        // cycle to a single dedicated connection by wrapping it in a mssql
        // Transaction. A Transaction binds to one pooled connection for its
        // lifetime; rolling it back on any failure ensures the underlying
        // connection is not reused in a tainted state.
        const transaction = this.shared.pool.transaction();
        let committed = false;

        try {
            await transaction.begin();

            const setReq = transaction.request();
            await setReq.query('SET SHOWPLAN_XML ON');

            const planReq = transaction.request();
            if (database) {
                this.validateIdentifier(database);
                await planReq.query(`USE ${this.quoteIdentifier(database)}`);
            }
            const result = await planReq.query(sql) as { recordset: Record<string, unknown>[] };
            const raw = result.recordset[0]?.MicrosoftSQLServerXMLShowplan as string
                ?? result.recordset[0]?.ShowPlanXML as string
                ?? '';

            // Reset SHOWPLAN_XML on the SAME connection before committing.
            const resetReq = transaction.request();
            await resetReq.query('SET SHOWPLAN_XML OFF');

            await transaction.commit();
            committed = true;

            const nodes = this.parseShowplanXml(raw);
            return { format: 'xml', raw, nodes };
        } catch (e) {
            console.debug('[SQL All in One] SQL Server EXPLAIN error:', e);
            return { format: 'xml', raw: '', nodes: [] };
        } finally {
            if (!committed) {
                // The transaction was not committed (begin/query/off failed).
                // Roll it back: mssql returns the underlying connection to the
                // pool only after a clean commit/rollback, and a rollback
                // forces the connection to be reset, so a tainted SHOWPLAN_XML
                // state will not leak to other callers.
                try {
                    await transaction.rollback();
                } catch (rollbackErr) {
                    console.warn('[SQL All in One] SQL Server EXPLAIN rollback failed; tainted connection may be reclaimed by pool idle timeout.', rollbackErr);
                }
            }
        }
    }

    async getTableRowCount(database: string, table: string, _schema?: string): Promise<number> {
        this.validateIdentifier(database);
        this.validateIdentifier(table);
        // sys.partitions gives an approximate row count without a full table scan.
        const sql = `SELECT SUM(p.rows) AS row_count FROM ${this.quoteIdentifier(database)}.sys.partitions p JOIN ${this.quoteIdentifier(database)}.sys.tables t ON p.object_id = t.object_id WHERE t.name = @name AND p.index_id IN (0, 1)`;
        const result = await this.executeQuery(sql, [{ name: 'name', value: table }]);
        if (result.status !== 'success' || result.rows.length === 0) {
            return 0;
        }
        const rowCount = result.rows[0].row_count;
        return rowCount != null ? Number(rowCount) : 0;
    }

    override getDialectCapabilities(): DialectCapabilities {
        return {
            supportsSchema: true,
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

    getSupportedDataTypes(): DataTypeCategory[] {
        return [
            {
                category: 'Integer',
                types: [
                    { name: 'tinyint' },
                    { name: 'smallint' },
                    { name: 'int' },
                    { name: 'bigint' },
                ],
            },
            {
                category: 'Float',
                types: [
                    { name: 'decimal', needsPrecision: true, needsScale: true },
                    { name: 'numeric', needsPrecision: true, needsScale: true },
                    { name: 'real' },
                    { name: 'float' },
                ],
            },
            {
                category: 'Money',
                types: [
                    { name: 'money' },
                    { name: 'smallmoney' },
                ],
            },
            {
                category: 'String',
                types: [
                    { name: 'char', needsLength: true },
                    { name: 'varchar', needsLength: true },
                    { name: 'text' },
                    { name: 'nchar', needsLength: true },
                    { name: 'nvarchar', needsLength: true },
                    { name: 'ntext' },
                ],
            },
            {
                category: 'Date & Time',
                types: [
                    { name: 'date' },
                    { name: 'time', needsPrecision: true },
                    { name: 'datetime' },
                    { name: 'datetime2', needsPrecision: true },
                    { name: 'datetimeoffset', needsPrecision: true },
                    { name: 'smalldatetime' },
                ],
            },
            {
                category: 'Binary',
                types: [
                    { name: 'binary', needsLength: true },
                    { name: 'varbinary', needsLength: true },
                    { name: 'image' },
                ],
            },
            {
                category: 'Other',
                types: [
                    { name: 'bit' },
                    { name: 'uniqueidentifier' },
                    { name: 'xml' },
                    { name: 'sql_variant' },
                    { name: 'hierarchyid' },
                    { name: 'geometry' },
                    { name: 'geography' },
                ],
            },
        ];
    }

    private async describeTableColumns(database: string, table: string): Promise<ColumnInfo[]> {
        this.validateIdentifier(database);
        this.validateIdentifier(table);
        const sql = `SELECT c.name AS column_name, TYPE_NAME(c.user_type_id) AS data_type, c.max_length, c.precision, c.scale, c.is_nullable, c.is_identity, OBJECT_DEFINITION(c.default_object_id) AS column_default, CASE WHEN pk.column_id IS NOT NULL THEN 1 ELSE 0 END AS is_primary_key FROM ${this.quoteIdentifier(database)}.sys.columns c LEFT JOIN (SELECT ic.object_id, ic.column_id FROM ${this.quoteIdentifier(database)}.sys.indexes i JOIN ${this.quoteIdentifier(database)}.sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id WHERE i.is_primary_key = 1) pk ON c.object_id = pk.object_id AND c.column_id = pk.column_id WHERE c.object_id = OBJECT_ID(@qualified) ORDER BY c.column_id`;
        const qualified = `${database}..${table}`;
        const result = await this.executeQuery(sql, [{ name: 'qualified', value: qualified }]);
        if (result.status !== 'success') {
            return [];
        }

        return result.rows.map((row: QueryRow) => {
            const dataType = row.data_type as string;
            const maxLength = row.max_length != null ? Number(row.max_length) : 0;
            const precision = row.precision != null ? Number(row.precision) : 0;
            const scale = row.scale != null ? Number(row.scale) : 0;
            let type = dataType;
            if (dataType === 'varchar' || dataType === 'nvarchar' || dataType === 'char' || dataType === 'nchar' || dataType === 'varbinary' || dataType === 'binary') {
                if (maxLength === -1) {
                    type = `${dataType}(MAX)`;
                } else if (maxLength > 0) {
                    // nchar/nvarchar store 2 bytes per char
                    const displayLength = dataType.startsWith('n') ? maxLength / 2 : maxLength;
                    type = `${dataType}(${displayLength})`;
                }
            } else if (dataType === 'decimal' || dataType === 'numeric') {
                type = `${dataType}(${precision}, ${scale})`;
            }

            return {
                name: row.column_name as string,
                type,
                length: maxLength > 0 ? maxLength : undefined,
                nullable: row.is_nullable as boolean,
                defaultValue: row.column_default as string | null,
                isPrimaryKey: row.is_primary_key as boolean,
                isAutoIncrement: row.is_identity as boolean,
                isUnique: false,
            };
        });
    }

    private async describeTableIndexes(database: string, table: string): Promise<IndexInfo[]> {
        this.validateIdentifier(database);
        this.validateIdentifier(table);
        const sql = `SELECT i.name AS index_name, i.type_desc, i.is_unique, i.is_primary_key, c.name AS column_name FROM ${this.quoteIdentifier(database)}.sys.indexes i JOIN ${this.quoteIdentifier(database)}.sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id JOIN ${this.quoteIdentifier(database)}.sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id WHERE i.object_id = OBJECT_ID(@qualified) ORDER BY i.name, ic.key_ordinal`;
        const qualified = `${database}..${table}`;
        const result = await this.executeQuery(sql, [{ name: 'qualified', value: qualified }]);
        if (result.status !== 'success') {
            return [];
        }

        const indexMap = new Map<string, IndexInfo>();
        for (const row of result.rows) {
            const indexName = row.index_name as string;
            if (!indexMap.has(indexName)) {
                indexMap.set(indexName, {
                    name: indexName,
                    type: row.type_desc as string,
                    columns: [],
                    isUnique: row.is_unique as boolean,
                    isPrimary: row.is_primary_key as boolean,
                });
            }
            indexMap.get(indexName)!.columns.push(row.column_name as string);
        }

        return Array.from(indexMap.values());
    }

    private async describeTableForeignKeys(database: string, table: string): Promise<ForeignKeyInfo[]> {
        this.validateIdentifier(database);
        this.validateIdentifier(table);
        const sql = `SELECT fk.name AS constraint_name, COL_NAME(fc.parent_object_id, fc.parent_column_id) AS column_name, OBJECT_NAME(fc.referenced_object_id) AS referenced_table, COL_NAME(fc.referenced_object_id, fc.referenced_column_id) AS referenced_column, fk.delete_referential_action_desc AS on_delete, fk.update_referential_action_desc AS on_update FROM ${this.quoteIdentifier(database)}.sys.foreign_keys fk JOIN ${this.quoteIdentifier(database)}.sys.foreign_key_columns fc ON fk.object_id = fc.constraint_object_id WHERE fk.parent_object_id = OBJECT_ID(@qualified) ORDER BY fk.name, fc.constraint_column_id`;
        const qualified = `${database}..${table}`;
        const result = await this.executeQuery(sql, [{ name: 'qualified', value: qualified }]);
        if (result.status !== 'success') {
            return [];
        }

        const fkMap = new Map<string, ForeignKeyInfo>();
        for (const row of result.rows) {
            const fkName = row.constraint_name as string;
            if (!fkMap.has(fkName)) {
                fkMap.set(fkName, {
                    name: fkName,
                    columns: [],
                    referencedTable: row.referenced_table as string,
                    referencedColumns: [],
                    onDelete: (row.on_delete as string)?.replace(/_/g, ' '),
                    onUpdate: (row.on_update as string)?.replace(/_/g, ' '),
                });
            }
            const fk = fkMap.get(fkName)!;
            fk.columns.push(row.column_name as string);
            fk.referencedColumns.push(row.referenced_column as string);
        }

        return Array.from(fkMap.values());
    }

    /**
     * Parses a SQL Server SHOWPLAN_XML document into ExplainNode[].
     *
     * The XML structure is deeply nested; we extract <RelOp> elements which
     * each carry a PhysicalOp, estimated row count, and cost. Child <RelOp>
     * elements become children of the containing node.
     */
    private parseShowplanXml(xml: string): ExplainNode[] {
        if (!xml) {
            return [];
        }

        const nodes: ExplainNode[] = [];
        const idCounter = { value: 0 };
        const relOpRegex = /<RelOp[^>]*PhysicalOp="([^"]*)"[^>]*>([\s\S]*?)<\/RelOp>/g;
        let match: RegExpExecArray | null;

        while ((match = relOpRegex.exec(xml)) !== null) {
            const physicalOp = match[1];
            const inner = match[2];
            const node = this.parseRelOpNode(physicalOp, inner, idCounter, xml);
            nodes.push(node);
        }

        return nodes;
    }

    private parseRelOpNode(physicalOp: string, inner: string, idCounter: { value: number }, fullXml: string): ExplainNode {
        const node: ExplainNode = {
            id: String(++idCounter.value),
            operation: physicalOp,
            table: this.extractAttribute(inner, 'Table="([^"]*)"') ?? this.extractAttribute(inner, 'Object="([^"]*)"'),
            rows: this.extractNumber(inner, 'EstimateRows="([^"]*)"'),
            cost: this.extractNumber(inner, 'EstimatedTotalSubtreeCost="([^"]*)"'),
            children: [],
        };

        // Recurse into nested <RelOp> elements.
        const relOpRegex = /<RelOp[^>]*PhysicalOp="([^"]*)"[^>]*>([\s\S]*?)<\/RelOp>/g;
        let match: RegExpExecArray | null;
        while ((match = relOpRegex.exec(inner)) !== null) {
            node.children.push(this.parseRelOpNode(match[1], match[2], idCounter, fullXml));
        }

        return node;
    }

    private extractAttribute(source: string, pattern: string): string | undefined {
        const match = source.match(new RegExp(pattern));
        return match?.[1];
    }

    private extractNumber(source: string, pattern: string): number | undefined {
        const match = source.match(new RegExp(pattern));
        if (!match?.[1]) {
            return undefined;
        }
        const value = parseFloat(match[1]);
        return isNaN(value) ? undefined : value;
    }
}

/**
 * SQL Server database adapter.
 *
 * Assembles the five SQL Server sub-adapters (connection, query, metadata,
 * schema, shared context) and delegates the IDatabaseAdapter surface to them.
 * The mssql driver (wrapping tedious TDS) is loaded lazily via dynamic import
 * inside the sub-adapters so it is only required when a SQL Server connection
 * is actually used.
 */
export class SqlServerAdapter extends BaseDatabaseAdapter<SqlServerSharedContext> {
    protected override createSharedContext(): SqlServerSharedContext {
        return new SqlServerSharedContext(this);
    }
    protected override createConnectionAdapter(): IConnectionLifecycle {
        return new SqlServerConnectionAdapter(this.shared);
    }
    protected override createQueryAdapter(): IQueryAdapter {
        return new SqlServerQueryAdapter(this.shared);
    }
    protected override createMetadataAdapter(): IMetadataAdapter {
        return new SqlServerMetadataAdapter(
            this.shared,
            (sql, params) => this.queryAdapter.execute(sql, params)
        );
    }
    protected override createSchemaAdapter(): ISchemaAdapter {
        return new SqlServerSchemaAdapter(
            this.shared,
            (sql, params) => this.queryAdapter.execute(sql, params),
            (db, schema) => this.metadataAdapter.listTriggers(db, schema)
        );
    }

    protected override getReapLogPrefix(): string {
        return 'SQL Server';
    }

    static getDialectMetadata(): DialectMetadata {
        return {
            dialect: 'sqlserver',
            displayName: 'SQL Server',
            defaultPort: 1433,
            defaultUsername: 'sa',
            iconKey: 'sqlserver',
            supportsSshTunnel: true,
            supportsSsl: true,
            isFileBased: false
        };
    }
}
