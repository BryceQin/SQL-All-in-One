import type { IDatabaseAdapter, IPoolStatus, ConnectionConfig, QueryResult, QueryRow, QueryParam, SqlStatement, ColumnMeta, DatabaseInfo, TableInfo, ViewInfo, FunctionInfo, ProcedureInfo, TriggerInfo, TableStructure, ColumnInfo, IndexInfo, ForeignKeyInfo, DialectCapabilities, DataTypeCategory, ExplainResult, ExplainNode, TestConnectionResult } from './IDatabaseAdapter';
import type { Pool, PoolOptions, PoolConnection, RowDataPacket, FieldPacket, ResultSetHeader } from 'mysql2/promise';

export class MysqlAdapter implements IDatabaseAdapter {
    private connectionId: string;
    private config: ConnectionConfig | null = null;
    private pool: Pool | null = null;
    private transactionConnection: PoolConnection | null = null;
    private lastActivityTime = 0;
    private reapTimer: ReturnType<typeof setInterval> | null = null;
    private activeQueryThreadIds = new Map<string, number>();

    constructor(config: ConnectionConfig) {
        this.config = config;
        this.connectionId = `mysql-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    getConnectionId(): string {
        return this.connectionId;
    }

    isConnected(): boolean {
        return this.pool !== null;
    }

    async connect(config: ConnectionConfig): Promise<void> {
        if (this.pool) {
            await this.disconnect();
        }

        this.config = config;

        const poolOptions = this.createPoolOptions(config);

        const mysql = await import('mysql2/promise');
        this.pool = mysql.createPool(poolOptions);

        const conn = await this.pool.getConnection();
        try {
            await conn.query<RowDataPacket[]>('SELECT 1');
        } finally {
            conn.release();
        }

        const minConnections = config.poolConfig?.minConnections ?? 1;
        const warmupPromises: Promise<void>[] = [];
        for (let i = 0; i < minConnections; i++) {
            warmupPromises.push(
                this.pool!.getConnection().then(conn => conn.release())
            );
        }
        await Promise.all(warmupPromises);
        this.lastActivityTime = Date.now();
        this.startReapTimer();
    }

    async disconnect(): Promise<void> {
        if (this.transactionConnection) {
            try {
                await this.transactionConnection.rollback();
            } catch {
                // ignore rollback error on disconnect
            }
            this.transactionConnection.release();
            this.transactionConnection = null;
        }

        this.stopReapTimer();

        if (this.pool) {
            await this.pool.end();
            this.pool = null;
        }

        this.config = null;
    }

    async testConnection(config: ConnectionConfig): Promise<TestConnectionResult> {
        const startTime = Date.now();
        let tempPool: Pool | null = null;

        try {
            const mysql = await import('mysql2/promise');
            const poolOptions = this.createPoolOptions(config, 1);

            tempPool = mysql.createPool(poolOptions);
            const conn = await tempPool.getConnection();
            try {
                const [rows] = await conn.query<RowDataPacket[]>('SELECT VERSION() AS version');
                const endTime = Date.now();
                return {
                    success: true,
                    serverVersion: (rows[0] as Record<string, unknown>)?.version as string ?? 'MySQL',
                    latency: endTime - startTime,
                };
            } finally {
                conn.release();
            }
        } catch (error: unknown) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        } finally {
            if (tempPool) {
                await tempPool.end();
            }
        }
    }

    async checkConnectionHealth(): Promise<boolean> {
        if (!this.pool) {
            return false;
        }

        try {
            const conn = await this.pool.getConnection();
            try {
                await conn.ping();
                return true;
            } finally {
                conn.release();
            }
        } catch {
            return false;
        }
    }

    async execute(sql: string, params?: QueryParam[]): Promise<QueryResult> {
        const startTime = Date.now();
        const queryId = `q-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        if (!this.pool) {
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
                    message: 'Not connected to database',
                    sql,
                },
                database: this.config?.database,
            };
        }

        try {
            this.lastActivityTime = Date.now();
            const values = params?.map(p => p.value);
            const acquireTimeout = this.config?.poolConfig?.acquireTimeout ?? 60000;
            let queryConn: Pool | PoolConnection = this.transactionConnection ?? this.pool;
            let acquiredConn: PoolConnection | null = null;

            if (!this.transactionConnection && this.pool) {
                acquiredConn = await this.acquireConnectionWithTimeout(acquireTimeout);
                queryConn = acquiredConn;
                this.activeQueryThreadIds.set(queryId, (acquiredConn as unknown as { threadId: number }).threadId);
            }

            try {
                const [result, fields] = await queryConn.query(sql, values);
                const executionTime = Date.now() - startTime;

                if (Array.isArray(result)) {
                    const rows = result as RowDataPacket[];
                    const fieldPackets = fields as FieldPacket[];

                    const columns: ColumnMeta[] = fieldPackets.map(field => {
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
                        database: this.config?.database,
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
                        database: this.config?.database,
                    };
                }
            } finally {
                if (acquiredConn) {
                    acquiredConn.release();
                }
                this.activeQueryThreadIds.delete(queryId);
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
                database: this.config?.database,
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
        if (this.transactionConnection) {
            throw new Error('Transaction already in progress');
        }
        if (!this.pool) {
            throw new Error('Not connected to database');
        }

        this.transactionConnection = await this.pool.getConnection();
        await this.transactionConnection.beginTransaction();
    }

    async commit(): Promise<void> {
        if (!this.transactionConnection) {
            throw new Error('No transaction in progress');
        }

        try {
            await this.transactionConnection.commit();
        } finally {
            this.transactionConnection.release();
            this.transactionConnection = null;
        }
    }

    async rollback(): Promise<void> {
        if (!this.transactionConnection) {
            throw new Error('No transaction in progress');
        }

        try {
            await this.transactionConnection.rollback();
        } finally {
            this.transactionConnection.release();
            this.transactionConnection = null;
        }
    }

    async cancelQuery(_queryId: string): Promise<void> {
        if (!this.pool) {
            return;
        }

        const threadId = this.activeQueryThreadIds.get(_queryId);
        if (!threadId) {
            return;
        }

        try {
            const conn = await this.pool.getConnection();
            try {
                await conn.query(`KILL QUERY ${threadId}`);
            } finally {
                conn.release();
            }
        } catch {
            // ignore cancel errors
        }
    }

    async listDatabases(): Promise<DatabaseInfo[]> {
        const result = await this.execute('SHOW DATABASES');
        if (result.status !== 'success') {
            return [];
        }

        return result.rows
            .filter((row: QueryRow) => {
                const name = row.Database as string;
                return name !== 'information_schema' &&
                    name !== 'mysql' &&
                    name !== 'performance_schema' &&
                    name !== 'sys';
            })
            .map((row: QueryRow) => ({
                name: row.Database as string,
            }));
    }

    async listSchemas(_database?: string): Promise<string[]> {
        return [];
    }

    async listTables(database?: string, _schema?: string, filter?: string): Promise<TableInfo[]> {
        const db = database ?? this.config?.database;
        if (!db) {
            return [];
        }

        let sql = `SELECT TABLE_NAME, TABLE_TYPE, ENGINE, TABLE_ROWS, TABLE_COMMENT FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'`;
        const params: QueryParam[] = [{ value: db }];

        if (filter) {
            sql += ` AND TABLE_NAME LIKE ?`;
            params.push({ value: `%${filter}%` });
        }

        sql += ` ORDER BY TABLE_NAME`;

        const result = await this.execute(sql, params);
        if (result.status !== 'success') {
            return [];
        }

        return result.rows.map((row: QueryRow) => ({
            name: row.TABLE_NAME as string,
            type: row.TABLE_TYPE as string,
            engine: row.ENGINE as string,
            rowCount: row.TABLE_ROWS as number,
            comment: row.TABLE_COMMENT as string,
        }));
    }

    async listViews(database?: string, _schema?: string): Promise<ViewInfo[]> {
        const db = database ?? this.config?.database;
        if (!db) {
            return [];
        }

        const sql = `SELECT TABLE_NAME, VIEW_DEFINITION, TABLE_COMMENT FROM INFORMATION_SCHEMA.VIEWS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME`;
        const result = await this.execute(sql, [{ value: db }]);
        if (result.status !== 'success') {
            return [];
        }

        return result.rows.map((row: QueryRow) => ({
            name: row.TABLE_NAME as string,
            definition: row.VIEW_DEFINITION as string,
            comment: row.TABLE_COMMENT as string,
        }));
    }

    async listFunctions(database?: string, _schema?: string): Promise<FunctionInfo[]> {
        const db = database ?? this.config?.database;
        if (!db) {
            return [];
        }

        const sql = `SELECT ROUTINE_NAME, DTD_IDENTIFIER, ROUTINE_DEFINITION FROM INFORMATION_SCHEMA.ROUTINES WHERE ROUTINE_SCHEMA = ? AND ROUTINE_TYPE = 'FUNCTION' ORDER BY ROUTINE_NAME`;
        const result = await this.execute(sql, [{ value: db }]);
        if (result.status !== 'success') {
            return [];
        }

        return result.rows.map((row: QueryRow) => ({
            name: row.ROUTINE_NAME as string,
            returns: row.DTD_IDENTIFIER as string,
            definition: row.ROUTINE_DEFINITION as string,
        }));
    }

    async listProcedures(database?: string, _schema?: string): Promise<ProcedureInfo[]> {
        const db = database ?? this.config?.database;
        if (!db) {
            return [];
        }

        const sql = `SELECT ROUTINE_NAME, ROUTINE_DEFINITION FROM INFORMATION_SCHEMA.ROUTINES WHERE ROUTINE_SCHEMA = ? AND ROUTINE_TYPE = 'PROCEDURE' ORDER BY ROUTINE_NAME`;
        const result = await this.execute(sql, [{ value: db }]);
        if (result.status !== 'success') {
            return [];
        }

        return result.rows.map((row: QueryRow) => ({
            name: row.ROUTINE_NAME as string,
            definition: row.ROUTINE_DEFINITION as string,
        }));
    }

    async listTriggers(database?: string, _schema?: string): Promise<TriggerInfo[]> {
        const db = database ?? this.config?.database;
        if (!db) {
            return [];
        }

        const sql = `SELECT TRIGGER_NAME, EVENT_MANIPULATION, ACTION_TIMING, ACTION_STATEMENT FROM INFORMATION_SCHEMA.TRIGGERS WHERE TRIGGER_SCHEMA = ? ORDER BY TRIGGER_NAME`;
        const result = await this.execute(sql, [{ value: db }]);
        if (result.status !== 'success') {
            return [];
        }

        return result.rows.map((row: QueryRow) => ({
            name: row.TRIGGER_NAME as string,
            event: row.EVENT_MANIPULATION as string,
            timing: row.ACTION_TIMING as string,
            statement: row.ACTION_STATEMENT as string,
        }));
    }

    async describeTable(database: string, table: string, _schema?: string): Promise<TableStructure> {
        const columns = await this.describeTableColumns(database, table);
        const indexes = await this.describeTableIndexes(database, table);
        const foreignKeys = await this.describeTableForeignKeys(database, table);
        const triggers = await this.listTriggers(database);

        return {
            columns,
            indexes,
            foreignKeys,
            triggers,
        };
    }

    private async describeTableColumns(database: string, table: string): Promise<ColumnInfo[]> {
        const sql = `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_KEY, EXTRA, COLUMN_COMMENT, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION, NUMERIC_SCALE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`;
        const result = await this.execute(sql, [{ value: database }, { value: table }]);
        if (result.status !== 'success') {
            return [];
        }

        return result.rows.map((row: QueryRow) => {
            const columnKey = row.COLUMN_KEY as string;
            const extra = row.EXTRA as string;
            const dataType = row.DATA_TYPE as string;

            return {
                name: row.COLUMN_NAME as string,
                type: row.COLUMN_TYPE as string,
                length: (row.CHARACTER_MAXIMUM_LENGTH ?? row.NUMERIC_PRECISION ?? undefined) as number | undefined,
                nullable: row.IS_NULLABLE === 'YES',
                defaultValue: row.COLUMN_DEFAULT as string | number | boolean | null,
                isPrimaryKey: columnKey === 'PRI',
                isAutoIncrement: extra?.includes('auto_increment') ?? false,
                isUnique: columnKey === 'UNI',
                comment: row.COLUMN_COMMENT as string,
                enumValues: dataType === 'enum'
                    ? (row.COLUMN_TYPE as string).match(/^enum\((.+)\)$/)?.[1]?.split(',').map(v => v.replace(/^'|'$/g, ''))
                    : undefined,
            };
        });
    }

    private async describeTableIndexes(database: string, table: string): Promise<IndexInfo[]> {
        const sql = `SHOW INDEX FROM ${this.quoteIdentifier(table)} FROM ${this.quoteIdentifier(database)}`;
        const result = await this.execute(sql);
        if (result.status !== 'success') {
            return [];
        }

        const indexMap = new Map<string, IndexInfo>();
        for (const row of result.rows) {
            const indexName = row.Key_name as string;
            if (!indexMap.has(indexName)) {
                indexMap.set(indexName, {
                    name: indexName,
                    type: row.Index_type as string,
                    columns: [],
                    isUnique: (row.Non_unique as number) === 0,
                    isPrimary: indexName === 'PRIMARY',
                });
            }
            indexMap.get(indexName)!.columns.push(row.Column_name as string);
        }

        return Array.from(indexMap.values());
    }

    private async describeTableForeignKeys(database: string, table: string): Promise<ForeignKeyInfo[]> {
        const sql = `SELECT kcu.CONSTRAINT_NAME, kcu.COLUMN_NAME, kcu.REFERENCED_TABLE_NAME, kcu.REFERENCED_COLUMN_NAME, rc.DELETE_RULE, rc.UPDATE_RULE FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc ON kcu.CONSTRAINT_NAME = rc.CONSTRAINT_NAME AND kcu.CONSTRAINT_SCHEMA = rc.CONSTRAINT_SCHEMA WHERE kcu.TABLE_SCHEMA = ? AND kcu.TABLE_NAME = ? AND kcu.REFERENCED_TABLE_NAME IS NOT NULL ORDER BY kcu.CONSTRAINT_NAME, kcu.ORDINAL_POSITION`;
        const result = await this.execute(sql, [{ value: database }, { value: table }]);
        if (result.status !== 'success') {
            return [];
        }

        const fkMap = new Map<string, ForeignKeyInfo>();
        for (const row of result.rows) {
            const fkName = row.CONSTRAINT_NAME as string;
            if (!fkMap.has(fkName)) {
                fkMap.set(fkName, {
                    name: fkName,
                    columns: [],
                    referencedTable: row.REFERENCED_TABLE_NAME as string,
                    referencedColumns: [],
                    onDelete: row.DELETE_RULE as string,
                    onUpdate: row.UPDATE_RULE as string,
                });
            }
            const fk = fkMap.get(fkName)!;
            fk.columns.push(row.COLUMN_NAME as string);
            fk.referencedColumns.push(row.REFERENCED_COLUMN_NAME as string);
        }

        return Array.from(fkMap.values());
    }

    async getTableDDL(database: string, table: string, _schema?: string): Promise<string> {
        const sql = `SHOW CREATE TABLE ${this.quoteIdentifier(database)}.${this.quoteIdentifier(table)}`;
        const result = await this.execute(sql);
        if (result.status !== 'success' || result.rows.length === 0) {
            return '';
        }

        return (result.rows[0]['Create Table'] ?? '') as string;
    }

    async getViewDDL(database: string, view: string, _schema?: string): Promise<string> {
        const sql = `SHOW CREATE VIEW ${this.quoteIdentifier(database)}.${this.quoteIdentifier(view)}`;
        const result = await this.execute(sql);
        if (result.status !== 'success' || result.rows.length === 0) {
            return '';
        }

        return (result.rows[0]['Create View'] ?? '') as string;
    }

    async getExplainPlan(database: string, sql: string): Promise<ExplainResult> {
        const useDb = database ?? this.config?.database;
        if (useDb) {
            await this.execute(`USE ${this.quoteIdentifier(useDb)}`);
        }

        const explainSql = `EXPLAIN FORMAT=JSON ${sql}`;
        const result = await this.execute(explainSql);
        if (result.status !== 'success' || result.rows.length === 0) {
            return { format: 'json', raw: '{}', nodes: [] };
        }

        const raw = (result.rows[0].EXPLAIN ?? result.rows[0]['EXPLAIN'] ?? '{}') as string;

        let nodes: ExplainNode[] = [];
        try {
            const parsed = JSON.parse(raw) as Record<string, unknown>;
            nodes = this.parseExplainNodes(parsed);
        } catch {
            // if JSON parse fails, return empty nodes
        }

        return { format: 'json', raw, nodes };
    }

    private parseExplainNodes(obj: Record<string, unknown>, idCounter: { value: number } = { value: 0 }): ExplainNode[] {
        if (!obj) {
            return [];
        }

        const nodes: ExplainNode[] = [];

        if (obj.query_block) {
            const block = obj.query_block as Record<string, unknown>;
            const costInfo = block.cost_info as Record<string, unknown> | undefined;
            const node: ExplainNode = {
                id: String(++idCounter.value),
                operation: block.select_id ? `query_block (id=${block.select_id as number})` : 'query_block',
                rows: costInfo?.rows_examined_per_scan as number | undefined,
                cost: costInfo?.query_cost ? parseFloat(costInfo.query_cost as string) : undefined,
                children: [],
            };

            for (const [key, value] of Object.entries(block)) {
                if (key === 'select_id' || key === 'cost_info') {
                    continue;
                }

                if (Array.isArray(value)) {
                    for (const item of value) {
                        node.children.push(...this.parseExplainNodes(item as Record<string, unknown>, idCounter));
                    }
                } else if (typeof value === 'object' && value !== null) {
                    node.children.push(...this.parseExplainNodes(value as Record<string, unknown>, idCounter));
                }
            }

            nodes.push(node);
        } else {
            for (const [key, value] of Object.entries(obj)) {
                if (key === 'cost_info') {
                    continue;
                }

                const val = value as Record<string, unknown> | null | undefined;
                const valRecord = val && typeof val === 'object' && !Array.isArray(val) ? val as Record<string, unknown> : undefined;
                const node: ExplainNode = {
                    id: String(++idCounter.value),
                    operation: key,
                    table: valRecord?.table_name as string | undefined,
                    rows: valRecord?.rows_examined ? parseInt(valRecord.rows_examined as string, 10) : undefined,
                    key: valRecord?.key as string | undefined,
                    extra: valRecord?.attached_condition as string | undefined,
                    children: [],
                };

                const valCostInfo = valRecord?.cost_info as Record<string, unknown> | undefined;
                if (valCostInfo?.query_cost) {
                    node.cost = parseFloat(valCostInfo.query_cost as string);
                }

                if (Array.isArray(value)) {
                    for (const item of value) {
                        node.children.push(...this.parseExplainNodes(item as Record<string, unknown>, idCounter));
                    }
                } else if (typeof value === 'object' && value !== null) {
                    for (const [subKey, subValue] of Object.entries(value as Record<string, unknown>)) {
                        if (subKey === 'table_name' || subKey === 'rows_examined' || subKey === 'key' || subKey === 'attached_condition' || subKey === 'cost_info') {
                            continue;
                        }
                        if (typeof subValue === 'object' && subValue !== null) {
                            node.children.push(...this.parseExplainNodes(subValue as Record<string, unknown>, idCounter));
                        }
                    }
                }

                nodes.push(node);
            }
        }

        return nodes;
    }

    async getTableRowCount(database: string, table: string, _schema?: string): Promise<number> {
        const sql = `SELECT TABLE_ROWS FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`;
        const result = await this.execute(sql, [{ value: database }, { value: table }]);
        if (result.status !== 'success' || result.rows.length === 0) {
            return 0;
        }

        return (result.rows[0].TABLE_ROWS as number) ?? 0;
    }

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

    quoteIdentifier(identifier: string): string {
        return '`' + identifier.replace(/`/g, '``') + '`';
    }

    getSupportedDataTypes(): DataTypeCategory[] {
        return [
            {
                category: 'Integer',
                types: [
                    { name: 'TINYINT', needsLength: true },
                    { name: 'SMALLINT', needsLength: true },
                    { name: 'MEDIUMINT', needsLength: true },
                    { name: 'INT', needsLength: true },
                    { name: 'INTEGER', needsLength: true },
                    { name: 'BIGINT', needsLength: true },
                ],
            },
            {
                category: 'Float',
                types: [
                    { name: 'FLOAT', needsPrecision: true },
                    { name: 'DOUBLE', needsPrecision: true },
                    { name: 'DECIMAL', needsPrecision: true, needsScale: true },
                    { name: 'NUMERIC', needsPrecision: true, needsScale: true },
                ],
            },
            {
                category: 'String',
                types: [
                    { name: 'CHAR', needsLength: true },
                    { name: 'VARCHAR', needsLength: true },
                    { name: 'TEXT' },
                    { name: 'TINYTEXT' },
                    { name: 'MEDIUMTEXT' },
                    { name: 'LONGTEXT' },
                    { name: 'ENUM', needsLength: true },
                    { name: 'SET' },
                ],
            },
            {
                category: 'Date & Time',
                types: [
                    { name: 'DATE' },
                    { name: 'TIME' },
                    { name: 'DATETIME' },
                    { name: 'TIMESTAMP' },
                    { name: 'YEAR' },
                ],
            },
            {
                category: 'Binary',
                types: [
                    { name: 'BINARY', needsLength: true },
                    { name: 'VARBINARY', needsLength: true },
                    { name: 'BLOB' },
                    { name: 'TINYBLOB' },
                    { name: 'MEDIUMBLOB' },
                    { name: 'LONGBLOB' },
                ],
            },
            {
                category: 'Other',
                types: [
                    { name: 'BIT' },
                    { name: 'BOOLEAN' },
                    { name: 'JSON' },
                    { name: 'GEOMETRY' },
                    { name: 'POINT' },
                    { name: 'LINESTRING' },
                    { name: 'POLYGON' },
                ],
            },
        ];
    }

    private createPoolOptions(config: ConnectionConfig, connectionLimitOverride?: number): PoolOptions {
        const poolOptions: PoolOptions = {
            host: config.host,
            port: config.port,
            user: config.username,
            password: config.password,
            database: config.database,
            connectionLimit: connectionLimitOverride ?? config.poolConfig?.maxConnections ?? 5,
            waitForConnections: true,
            queueLimit: 0,
            connectTimeout: config.connectTimeout ?? 10000,
            enableKeepAlive: config.poolConfig?.enableKeepAlive ?? true,
            keepAliveInitialDelay: config.poolConfig?.keepAliveInterval ?? 30000,
        };

        if (config.ssl?.enabled) {
            poolOptions.ssl = {
                rejectUnauthorized: config.ssl.rejectUnauthorized ?? true,
                ca: config.ssl.ca,
                cert: config.ssl.cert,
                key: config.ssl.key,
            };
        }

        return poolOptions;
    }

    private async acquireConnectionWithTimeout(timeout: number): Promise<PoolConnection> {
        return new Promise<PoolConnection>((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`Connection acquire timeout after ${timeout}ms`));
            }, timeout);

            this.pool!.getConnection()
                .then((conn) => {
                    clearTimeout(timer);
                    resolve(conn);
                })
                .catch((error: unknown) => {
                    clearTimeout(timer);
                    reject(error);
                });
        });
    }

    private startReapTimer(): void {
        this.stopReapTimer();
        const reapInterval = this.config?.poolConfig?.reapInterval ?? 60000;
        const idleTimeout = this.config?.poolConfig?.idleTimeout ?? 300000;

        this.reapTimer = setInterval(() => {
            this.reapIdleConnections(idleTimeout);
        }, reapInterval);
    }

    private stopReapTimer(): void {
        if (this.reapTimer) {
            clearInterval(this.reapTimer);
            this.reapTimer = null;
        }
    }

    private async reapIdleConnections(idleTimeout: number): Promise<void> {
        if (!this.pool) return;
        const now = Date.now();
        if (now - this.lastActivityTime > idleTimeout) {
            const status = this.getPoolStatus();
            if (status.activeConnections === 0 && status.idleConnections > 0) {
                try {
                    const config = this.config!;
                    await this.pool.end();
                    const mysql = await import('mysql2/promise');
                    const poolOptions = this.createPoolOptions(config);
                    this.pool = mysql.createPool(poolOptions);
                    this.lastActivityTime = Date.now();
                } catch {
                    // ignore reap errors, pool will be recreated on next use
                }
            }
        }
    }

    getPoolStatus(): IPoolStatus {
        if (!this.pool) {
            return {
                totalConnections: 0,
                activeConnections: 0,
                idleConnections: 0,
                waitingRequests: 0,
                connectionLimit: this.config?.poolConfig?.maxConnections ?? 5,
                acquireTimeout: this.config?.poolConfig?.acquireTimeout ?? 60000,
            };
        }

        const pool = this.pool as unknown as Record<string, unknown[]>;
        const totalConnections = pool._allConnections?.length ?? 0;
        const idleConnections = pool._freeConnections?.length ?? 0;
        return {
            totalConnections,
            activeConnections: totalConnections - idleConnections,
            idleConnections,
            waitingRequests: pool._connectionQueue?.length ?? 0,
            connectionLimit: this.config?.poolConfig?.maxConnections ?? 5,
            acquireTimeout: this.config?.poolConfig?.acquireTimeout ?? 60000,
        };
    }
}
