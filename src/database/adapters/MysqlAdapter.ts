import type { IDatabaseAdapter, IPoolStatus, ConnectionConfig, QueryResult, QueryRow, QueryParam, SqlStatement, ColumnMeta, DatabaseInfo, TableInfo, ViewInfo, FunctionInfo, ProcedureInfo, TriggerInfo, RoutineParameterInfo, TableStructure, ColumnInfo, IndexInfo, ForeignKeyInfo, DialectCapabilities, DataTypeCategory, ExplainResult, ExplainNode, TestConnectionResult } from './IDatabaseAdapter';
import type { Pool, PoolOptions, PoolConnection, RowDataPacket, FieldPacket, ResultSetHeader } from 'mysql2/promise';
import { t } from '../../i18n/index';
import { generateShortId } from '../../utils/idGenerator';

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
        this.connectionId = generateShortId('conn');
    }

    getConnectionId(): string {
        return this.connectionId;
    }

    isConnected(): boolean {
        return this.pool !== null;
    }

    private formatConnectionError(error: unknown, config: ConnectionConfig): Error {
        const msg = error instanceof Error ? error.message : String(error);
        const hostPort = `${config.host}:${config.port}`;

        if (msg.includes('ECONNREFUSED')) {
            return new Error(t('database.connectionRefused', hostPort));
        }
        if (msg.includes('ETIMEDOUT') || msg.includes('connectTimeout')) {
            return new Error(t('database.connectionTimedOut', hostPort));
        }
        if (msg.includes('EHOSTUNREACH')) {
            return new Error(t('database.hostUnreachable', hostPort));
        }
        if (msg.includes('ENOTFOUND')) {
            return new Error(t('database.hostNotFound', config.host));
        }
        if (msg.includes('ER_ACCESS_DENIED_ERROR') || msg.includes('Access denied')) {
            return new Error(t('database.accessDenied', config.username, hostPort));
        }
        if (msg.includes('ER_DBACCESS_DENIED_ERROR') || msg.includes('denied to user')) {
            return new Error(t('database.databaseAccessDenied', config.username, config.database || '(none)'));
        }
        if (msg.includes('PROTOCOL_CONNECTION_LOST')) {
            return new Error(t('database.connectionLost', hostPort));
        }
        if (msg.includes('ER_CON_COUNT_ERROR') || msg.includes('Too many connections')) {
            return new Error(t('database.tooManyConnections', hostPort));
        }
        if (msg.includes('self signed certificate') || msg.includes('certificate') || msg.includes('SSL')) {
            return new Error(t('database.sslError', hostPort));
        }
        if (msg.includes('ER_BAD_DB_ERROR')) {
            return new Error(t('database.databaseNotExist', config.database || '(none)', hostPort));
        }

        return error instanceof Error ? error : new Error(msg);
    }

    async connect(config: ConnectionConfig): Promise<void> {
        if (this.pool) {
            await this.disconnect();
        }

        this.config = config;

        const poolOptions = this.createPoolOptions(config);

        try {
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
                    this.pool!.getConnection().then(conn => conn.release()).catch((e) => { console.debug('[SQL All in One] Connection warmup failed:', e); })
                );
            }
            await Promise.all(warmupPromises);
            this.lastActivityTime = Date.now();
            this.startReapTimer();
        } catch (error: unknown) {
            this.pool = null;
            throw this.formatConnectionError(error, config);
        }
    }

    async disconnect(): Promise<void> {
        if (this.transactionConnection) {
            try {
                await this.transactionConnection.rollback();
            } catch (e) {
                console.debug('[SQL All in One] Rollback error on disconnect:', e);
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
        let tempConn: import('mysql2/promise').Connection | null = null;

        try {
            const mysql = await import('mysql2/promise');
            const connectOptions = this.createConnectionOptions(config);

            tempConn = await mysql.createConnection(connectOptions);
            const [rows] = await tempConn.query<RowDataPacket[]>('SELECT VERSION() AS version');
            const endTime = Date.now();
            return {
                success: true,
                serverVersion: (rows[0] as Record<string, unknown>)?.version as string ?? 'MySQL',
                latency: endTime - startTime,
            };
        } catch (error: unknown) {
            const formatted = this.formatConnectionError(error, config);
            return {
                success: false,
                error: formatted.message,
            };
        } finally {
            if (tempConn) {
                await tempConn.end();
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
        const queryId = generateShortId('query');

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
                    message: t('database.notConnected'),
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
            throw new Error(t('database.transactionInProgress'));
        }
        if (!this.pool) {
            throw new Error(t('database.notConnected'));
        }

        this.transactionConnection = await this.pool.getConnection();
        await this.transactionConnection.beginTransaction();
    }

    async commit(): Promise<void> {
        if (!this.transactionConnection) {
            throw new Error(t('database.noTransactionInProgress'));
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
            throw new Error(t('database.noTransactionInProgress'));
        }

        try {
            await this.transactionConnection.rollback();
            this.transactionConnection.release();
        } catch (rollbackError) {
            this.transactionConnection.destroy();
            console.error('Rollback failed, connection destroyed:', rollbackError);
        } finally {
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
        } catch (e) {
            console.debug('[SQL All in One] Cancel query error:', e);
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

        const sql = `SELECT TABLE_NAME, TABLE_COMMENT FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'VIEW' ORDER BY TABLE_NAME`;
        const result = await this.execute(sql, [{ value: db }]);
        if (result.status !== 'success') {
            return [];
        }

        return result.rows.map((row: QueryRow) => ({
            name: row.TABLE_NAME as string,
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

    async getFunctionDDL(database: string, functionName: string, _schema?: string): Promise<string> {
        const sql = `SHOW CREATE FUNCTION ${this.quoteIdentifier(database)}.${this.quoteIdentifier(functionName)}`;
        const result = await this.execute(sql);
        if (result.status !== 'success' || result.rows.length === 0) {
            return '';
        }

        return (result.rows[0]['Create Function'] ?? '') as string;
    }

    async getProcedureDDL(database: string, procedureName: string, _schema?: string): Promise<string> {
        const sql = `SHOW CREATE PROCEDURE ${this.quoteIdentifier(database)}.${this.quoteIdentifier(procedureName)}`;
        const result = await this.execute(sql);
        if (result.status !== 'success' || result.rows.length === 0) {
            return '';
        }

        return (result.rows[0]['Create Procedure'] ?? '') as string;
    }

    async getTriggerDDL(database: string, triggerName: string, _schema?: string): Promise<string> {
        const sql = `SHOW CREATE TRIGGER ${this.quoteIdentifier(database)}.${this.quoteIdentifier(triggerName)}`;
        const result = await this.execute(sql);
        if (result.status !== 'success' || result.rows.length === 0) {
            return '';
        }

        return (result.rows[0]['SQL Original Statement'] ?? result.rows[0]['Create Trigger'] ?? '') as string;
    }

    async getRoutineParameters(database: string, routineName: string, routineType: 'FUNCTION' | 'PROCEDURE', _schema?: string): Promise<RoutineParameterInfo[]> {
        const sql = `SELECT PARAMETER_NAME, DATA_TYPE, DTD_IDENTIFIER, PARAMETER_MODE FROM INFORMATION_SCHEMA.PARAMETERS WHERE SPECIFIC_SCHEMA = ? AND SPECIFIC_NAME = ? AND ROUTINE_TYPE = ? AND PARAMETER_NAME IS NOT NULL ORDER BY ORDINAL_POSITION`;
        const result = await this.execute(sql, [
            { value: database },
            { value: routineName },
            { value: routineType }
        ]);
        if (result.status !== 'success') {
            return [];
        }

        return result.rows.map((row: QueryRow) => ({
            name: row.PARAMETER_NAME as string,
            type: (row.DTD_IDENTIFIER as string) || (row.DATA_TYPE as string),
            direction: (row.PARAMETER_MODE as 'IN' | 'OUT' | 'INOUT') || 'IN',
        }));
    }

    async getExplainPlan(database: string, sql: string): Promise<ExplainResult> {
        const useDb = database ?? this.config?.database;
        if (!this.pool) {
            return { format: 'json', raw: '{}', nodes: [] };
        }

        let conn: PoolConnection | null = null;
        try {
            conn = await this.pool.getConnection();
            if (useDb) {
                await conn.query(`USE ${this.quoteIdentifier(useDb)}`);
            }

            const explainSql = `EXPLAIN FORMAT=JSON ${sql}`;
            const [result] = await conn.query<RowDataPacket[]>(explainSql);
            if (!result || result.length === 0) {
                return { format: 'json', raw: '{}', nodes: [] };
            }

            const raw = (result[0].EXPLAIN ?? result[0]['EXPLAIN'] ?? '{}') as string;

            let nodes: ExplainNode[] = [];
            try {
                const parsed = JSON.parse(raw) as Record<string, unknown>;
                nodes = this.parseExplainNodes(parsed);
            } catch (_e) {
                nodes = [];
            }

            return { format: 'json', raw, nodes };
        } catch (e) {
            console.debug('[SQL All in One] EXPLAIN plan error:', e);
            return { format: 'json', raw: '{}', nodes: [] };
        } finally {
            conn?.release();
        }
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

        if (config.options?.charset) {
            poolOptions.charset = config.options.charset as string;
        }
        if (config.options?.timezone) {
            poolOptions.timezone = config.options.timezone as string;
        }

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

    private createConnectionOptions(config: ConnectionConfig): Record<string, unknown> {
        const options: Record<string, unknown> = {
            host: config.host,
            port: config.port,
            user: config.username,
            password: config.password,
            database: config.database,
            connectTimeout: config.connectTimeout ?? 10000,
        };

        if (config.options?.charset) {
            options.charset = config.options.charset;
        }
        if (config.options?.timezone) {
            options.timezone = config.options.timezone;
        }

        if (config.ssl?.enabled) {
            options.ssl = {
                rejectUnauthorized: config.ssl.rejectUnauthorized ?? true,
                ca: config.ssl.ca,
                cert: config.ssl.cert,
                key: config.ssl.key,
            };
        }

        return options;
    }

    private async acquireConnectionWithTimeout(timeout: number): Promise<PoolConnection> {
        return new Promise<PoolConnection>((resolve, reject) => {
            let timedOut = false;
            const timer = setTimeout(() => {
                timedOut = true;
                reject(new Error(t('database.connectionAcquireTimeout', String(timeout))));
            }, timeout);

            this.pool!.getConnection()
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
            if (status.activeConnections === 0 && typeof status.idleConnections === 'number' && status.idleConnections > 0) {
                try {
                    const config = this.config!;
                    await this.pool.end();
                    const mysql = await import('mysql2/promise');
                    const poolOptions = this.createPoolOptions(config);
                    this.pool = mysql.createPool(poolOptions);
                    this.lastActivityTime = Date.now();
                } catch (e) {
                    console.debug('[SQL All in One] Reap idle connections error:', e);
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

        const pool = this.pool as unknown as { _allConnections?: unknown[]; _freeConnections?: unknown[]; _connectionQueue?: unknown[]; connectionLimit?: number };
        let totalConnections: number | 'unknown' = 'unknown';
        let idleConnections: number | 'unknown' = 'unknown';
        let waitingRequests: number | 'unknown' = 'unknown';

        try {
            totalConnections = pool._allConnections?.length ?? 0;
        } catch (e) {
            console.warn('[SQL All in One] Failed to access pool._allConnections, mysql2 internal API may have changed:', e);
            totalConnections = 'unknown';
        }
        try {
            idleConnections = pool._freeConnections?.length ?? 0;
        } catch (e) {
            console.warn('[SQL All in One] Failed to access pool._freeConnections, mysql2 internal API may have changed:', e);
            idleConnections = 'unknown';
        }
        try {
            waitingRequests = pool._connectionQueue?.length ?? 0;
        } catch (e) {
            console.warn('[SQL All in One] Failed to access pool._connectionQueue, mysql2 internal API may have changed:', e);
            waitingRequests = 'unknown';
        }

        const activeConnections: number | 'unknown' =
            totalConnections === 'unknown' || idleConnections === 'unknown'
                ? 'unknown'
                : totalConnections - idleConnections;

        return {
            totalConnections,
            activeConnections,
            idleConnections,
            waitingRequests,
            connectionLimit: this.config?.poolConfig?.maxConnections ?? 5,
            acquireTimeout: this.config?.poolConfig?.acquireTimeout ?? 60000,
        };
    }
}
