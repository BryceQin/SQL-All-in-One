import type { ISchemaAdapter, QueryResult, QueryParam, QueryRow, TriggerInfo, ColumnInfo, IndexInfo, ForeignKeyInfo, TableStructure, RoutineParameterInfo, DialectCapabilities, DataTypeCategory, ExplainResult, ExplainNode } from './IDatabaseAdapter';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { StarrocksSharedContext } from './StarrocksSharedContext';

/**
 * StarRocks schema adapter.
 *
 * StarRocks is MySQL-protocol compatible, so SHOW CREATE TABLE, DESC and
 * EXPLAIN syntax mirror MySQL. StarRocks does not support foreign keys or
 * triggers, so describeTable returns empty arrays for those.
 */
export class StarrocksSchemaAdapter implements ISchemaAdapter {
    constructor(
        private shared: StarrocksSharedContext,
        private executeQuery: (sql: string, params?: QueryParam[]) => Promise<QueryResult>,
        private listTriggersFn: (database?: string, schema?: string) => Promise<TriggerInfo[]>
    ) {}

    async describeTable(database: string, table: string, _schema?: string): Promise<TableStructure> {
        const [columns, indexes, foreignKeys, triggers] = await Promise.all([
            this.describeTableColumns(database, table),
            this.describeTableIndexes(database, table),
            this.describeTableForeignKeys(database, table),
            this.listTriggersFn(database),
        ]);

        return {
            columns,
            indexes,
            foreignKeys,
            triggers,
        };
    }

    async getTableDDL(database: string, table: string, _schema?: string): Promise<string> {
        this.validateIdentifier(database);
        this.validateIdentifier(table);
        const sql = `SHOW CREATE TABLE ${this.quoteIdentifier(database)}.${this.quoteIdentifier(table)}`;
        const result = await this.executeQuery(sql);
        if (result.status !== 'success' || result.rows.length === 0) {
            return '';
        }

        // StarRocks returns "Create Table" column like MySQL
        return (result.rows[0]['Create Table'] ?? result.rows[0]['Create View'] ?? '') as string;
    }

    async getViewDDL(database: string, view: string, _schema?: string): Promise<string> {
        this.validateIdentifier(database);
        this.validateIdentifier(view);
        const sql = `SHOW CREATE VIEW ${this.quoteIdentifier(database)}.${this.quoteIdentifier(view)}`;
        const result = await this.executeQuery(sql);
        if (result.status !== 'success' || result.rows.length === 0) {
            return '';
        }

        return (result.rows[0]['Create View'] ?? '') as string;
    }

    async getFunctionDDL(_database: string, _functionName: string, _schema?: string): Promise<string> {
        // StarRocks does not support user-defined functions.
        return '';
    }

    async getProcedureDDL(_database: string, _procedureName: string, _schema?: string): Promise<string> {
        // StarRocks does not support stored procedures.
        return '';
    }

    async getTriggerDDL(_database: string, _triggerName: string, _schema?: string): Promise<string> {
        // StarRocks does not support triggers.
        return '';
    }

    async getRoutineParameters(_database: string, _routineName: string, _routineType: 'FUNCTION' | 'PROCEDURE', _schema?: string): Promise<RoutineParameterInfo[]> {
        // StarRocks does not support stored procedures or UDFs.
        return [];
    }

    async getExplainPlan(database: string, sql: string): Promise<ExplainResult> {
        const useDb = database ?? this.shared.config?.database;
        if (!this.shared.pool) {
            return { format: 'text', raw: '', nodes: [] };
        }

        let conn: PoolConnection | null = null;
        try {
            conn = await this.shared.pool.getConnection();
            if (useDb) {
                this.validateIdentifier(useDb);
                await conn.query(`USE ${this.quoteIdentifier(useDb)}`);
            }

            // StarRocks EXPLAIN returns plain text output (not JSON like MySQL)
            const explainSql = `EXPLAIN ${sql}`;
            const [result] = await conn.query<RowDataPacket[]>(explainSql);
            if (!result || result.length === 0) {
                return { format: 'text', raw: '', nodes: [] };
            }

            // StarRocks EXPLAIN returns rows with a single column containing
            // multi-line text. Concatenate all rows into a single raw string.
            const raw = result.map((row: RowDataPacket) => {
                const value = row[0] as unknown;
                return typeof value === 'string' ? value : String(value ?? '');
            }).join('\n');

            const nodes = this.parseExplainText(raw);

            return { format: 'text', raw, nodes };
        } catch (e) {
            console.debug('[SQL All in One] StarRocks EXPLAIN plan error:', e);
            return { format: 'text', raw: '', nodes: [] };
        } finally {
            conn?.release();
        }
    }

    async getTableRowCount(database: string, table: string, _schema?: string): Promise<number> {
        const sql = `SELECT TABLE_ROWS FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`;
        const result = await this.executeQuery(sql, [{ value: database }, { value: table }]);
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
            // StarRocks does not support procedures/triggers
            supportedObjectTypes: ['table', 'view', 'index'],
        };
    }

    getSupportedDataTypes(): DataTypeCategory[] {
        return [
            {
                category: 'Integer',
                types: [
                    { name: 'TINYINT', needsLength: true },
                    { name: 'SMALLINT', needsLength: true },
                    { name: 'INT', needsLength: true },
                    { name: 'INTEGER', needsLength: true },
                    { name: 'BIGINT', needsLength: true },
                    { name: 'LARGEINT' },
                ],
            },
            {
                category: 'Float',
                types: [
                    { name: 'FLOAT', needsPrecision: true },
                    { name: 'DOUBLE', needsPrecision: true },
                    { name: 'DECIMAL', needsPrecision: true, needsScale: true },
                    { name: 'DECIMALV2', needsPrecision: true, needsScale: true },
                    { name: 'DECIMALV3', needsPrecision: true, needsScale: true },
                ],
            },
            {
                category: 'String',
                types: [
                    { name: 'CHAR', needsLength: true },
                    { name: 'VARCHAR', needsLength: true },
                    { name: 'STRING' },
                ],
            },
            {
                category: 'Date & Time',
                types: [
                    { name: 'DATE' },
                    { name: 'DATETIME' },
                    { name: 'TIMESTAMP' },
                ],
            },
            {
                category: 'Other',
                types: [
                    { name: 'BOOLEAN' },
                    { name: 'JSON' },
                    { name: 'BITMAP' },
                    { name: 'HLL' },
                    { name: 'PERCENTILE' },
                    { name: 'ARRAY' },
                    { name: 'MAP' },
                    { name: 'STRUCT' },
                ],
            },
        ];
    }

    quoteIdentifier(identifier: string): string {
        return '`' + identifier.replace(/`/g, '``') + '`';
    }

    private validateIdentifier(identifier: string): void {
        if (!identifier || typeof identifier !== 'string') {
            throw new Error('Invalid identifier: identifier must be a non-empty string');
        }
        if (identifier.length > 64) {
            throw new Error('Invalid identifier: identifier exceeds maximum length');
        }
        // eslint-disable-next-line no-control-regex
        if (/\u0000/.test(identifier)) {
            throw new Error('Invalid identifier: identifier contains null bytes');
        }
    }

    private async describeTableColumns(database: string, table: string): Promise<ColumnInfo[]> {
        const sql = `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_KEY, EXTRA, COLUMN_COMMENT, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION, NUMERIC_SCALE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`;
        const result = await this.executeQuery(sql, [{ value: database }, { value: table }]);
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
        this.validateIdentifier(database);
        this.validateIdentifier(table);
        // StarRocks supports SHOW INDEX FROM like MySQL
        const sql = `SHOW INDEX FROM ${this.quoteIdentifier(table)} FROM ${this.quoteIdentifier(database)}`;
        const result = await this.executeQuery(sql);
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

    private async describeTableForeignKeys(_database: string, _table: string): Promise<ForeignKeyInfo[]> {
        // StarRocks does not support foreign keys.
        return [];
    }

    /**
     * Parses StarRocks EXPLAIN plain-text output into a flat list of nodes.
     * StarRocks EXPLAIN output is a tree represented by indented lines.
     */
    private parseExplainText(text: string): ExplainNode[] {
        const nodes: ExplainNode[] = [];
        const lines = text.split('\n');
        let idCounter = 0;

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            // Detect indentation level (StarRocks uses | and spaces for tree)
            const indent = line.length - line.trimStart().length;
            const node: ExplainNode = {
                id: String(++idCounter),
                operation: trimmed,
                children: [],
            };

            // Try to extract rows/cost from common patterns like "cardinality: 100"
            const rowsMatch = trimmed.match(/cardinality[:=]\s*(\d+)/i);
            if (rowsMatch) {
                node.rows = parseInt(rowsMatch[1], 10);
            }
            const costMatch = trimmed.match(/cost[:=]\s*([\d.]+)/i);
            if (costMatch) {
                node.cost = parseFloat(costMatch[1]);
            }

            // Use indent as a hint for hierarchy (not fully reconstructing
            // parent-child relationships here; consumers can use the raw text
            // for full fidelity).
            void indent;
            nodes.push(node);
        }

        return nodes;
    }
}
