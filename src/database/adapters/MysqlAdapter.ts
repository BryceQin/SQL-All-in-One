import type { IDatabaseAdapter, ConnectionConfig, QueryResult, QueryRow, QueryParam, SqlStatement, ColumnMeta, DatabaseInfo, TableInfo, ViewInfo, FunctionInfo, ProcedureInfo, TriggerInfo, TableStructure, DialectCapabilities, DataTypeCategory, ExplainResult, TestConnectionResult } from './IDatabaseAdapter';

/**
 * @stub MySQL database adapter - placeholder implementation.
 * All methods return empty/hardcoded data. A real MySQL driver (e.g. mysql2)
 * is needed for actual database connectivity.
 */
export class MysqlAdapter implements IDatabaseAdapter {
    private connectionId: string;
    private config: ConnectionConfig | null = null;
    private connected = false;
    private transactionConnection: unknown = null;

    constructor(_config: ConnectionConfig) {
        this.connectionId = `mysql-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    getConnectionId(): string {
        return this.connectionId;
    }

    isConnected(): boolean {
        return this.connected;
    }

    async connect(config: ConnectionConfig): Promise<void> {
        this.config = config;
        this.connected = true;
    }

    async disconnect(): Promise<void> {
        this.connected = false;
        this.config = null;
    }

    async testConnection(_config: ConnectionConfig): Promise<TestConnectionResult> {
        const startTime = Date.now();
        try {
            const endTime = Date.now();
            return {
                success: true,
                serverVersion: 'MySQL 8.0',
                latency: endTime - startTime
            };
        } catch (error: unknown) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    async checkConnectionHealth(): Promise<boolean> {
        return this.connected;
    }

    async execute(sql: string, _params?: QueryParam[]): Promise<QueryResult> {
        const startTime = Date.now();
        const queryId = `q-${Date.now()}`;

        try {
            const columns: ColumnMeta[] = [];
            const rows: QueryRow[] = [];
            const affectedRows = 0;

            const executionTime = Date.now() - startTime;

            return {
                queryId,
                status: 'success',
                columns,
                rows,
                rowCount: rows.length,
                affectedRows,
                executionTime,
                database: this.config?.database
            };
        } catch (error: unknown) {
            const executionTime = Date.now() - startTime;
            return {
                queryId,
                status: 'error',
                columns: [],
                rows: [],
                rowCount: 0,
                executionTime,
                error: {
                    code: 'EXEC_ERROR',
                    message: error instanceof Error ? error.message : String(error),
                    sql
                },
                database: this.config?.database
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
        this.transactionConnection = {};
    }

    async commit(): Promise<void> {
        if (!this.transactionConnection) {
            throw new Error('No transaction in progress');
        }
        this.transactionConnection = null;
    }

    async rollback(): Promise<void> {
        if (!this.transactionConnection) {
            throw new Error('No transaction in progress');
        }
        this.transactionConnection = null;
    }

    async cancelQuery(_queryId: string): Promise<void> {
        // @stub: no-op for placeholder implementation
    }

    async listDatabases(): Promise<DatabaseInfo[]> {
        return [];
    }

    async listSchemas(_database?: string): Promise<string[]> {
        return [];
    }

    async listTables(_database?: string, _schema?: string, _filter?: string): Promise<TableInfo[]> {
        return [];
    }

    async listViews(_database?: string, _schema?: string): Promise<ViewInfo[]> {
        return [];
    }

    async listFunctions(_database?: string, _schema?: string): Promise<FunctionInfo[]> {
        return [];
    }

    async listProcedures(_database?: string, _schema?: string): Promise<ProcedureInfo[]> {
        return [];
    }

    async listTriggers(_database?: string, _schema?: string): Promise<TriggerInfo[]> {
        return [];
    }

    async describeTable(_database: string, _table: string, _schema?: string): Promise<TableStructure> {
        return {
            columns: [],
            indexes: [],
            foreignKeys: [],
            triggers: []
        };
    }

    async getTableDDL(_database: string, _table: string, _schema?: string): Promise<string> {
        return '';
    }

    async getViewDDL(_database: string, _view: string, _schema?: string): Promise<string> {
        return '';
    }

    async getExplainPlan(_database: string, _sql: string): Promise<ExplainResult> {
        return {
            format: 'json',
            raw: '{}',
            nodes: []
        };
    }

    async getTableRowCount(_database: string, _table: string, _schema?: string): Promise<number> {
        return 0;
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
            supportedObjectTypes: ['table', 'view', 'function', 'procedure', 'trigger', 'index']
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
                    { name: 'BIGINT', needsLength: true }
                ]
            },
            {
                category: 'Float',
                types: [
                    { name: 'FLOAT', needsPrecision: true },
                    { name: 'DOUBLE', needsPrecision: true },
                    { name: 'DECIMAL', needsPrecision: true, needsScale: true },
                    { name: 'NUMERIC', needsPrecision: true, needsScale: true }
                ]
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
                    { name: 'SET' }
                ]
            },
            {
                category: 'Date & Time',
                types: [
                    { name: 'DATE' },
                    { name: 'TIME' },
                    { name: 'DATETIME' },
                    { name: 'TIMESTAMP' },
                    { name: 'YEAR' }
                ]
            },
            {
                category: 'Binary',
                types: [
                    { name: 'BINARY', needsLength: true },
                    { name: 'VARBINARY', needsLength: true },
                    { name: 'BLOB' },
                    { name: 'TINYBLOB' },
                    { name: 'MEDIUMBLOB' },
                    { name: 'LONGBLOB' }
                ]
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
                    { name: 'POLYGON' }
                ]
            }
        ];
    }
}
