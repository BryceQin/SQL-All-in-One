import type { ISchemaAdapter, QueryResult, QueryParam, QueryRow, TriggerInfo, ColumnInfo, IndexInfo, ForeignKeyInfo, TableStructure, RoutineParameterInfo, DialectCapabilities, DataTypeCategory, ExplainResult, ExplainNode } from './IDatabaseAdapter';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { MysqlSharedContext } from './MysqlSharedContext';

export class MysqlSchemaAdapter implements ISchemaAdapter {
    constructor(
        private shared: MysqlSharedContext,
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

        return (result.rows[0]['Create Table'] ?? '') as string;
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

    async getFunctionDDL(database: string, functionName: string, _schema?: string): Promise<string> {
        this.validateIdentifier(database);
        this.validateIdentifier(functionName);
        const sql = `SHOW CREATE FUNCTION ${this.quoteIdentifier(database)}.${this.quoteIdentifier(functionName)}`;
        const result = await this.executeQuery(sql);
        if (result.status !== 'success' || result.rows.length === 0) {
            return '';
        }

        return (result.rows[0]['Create Function'] ?? '') as string;
    }

    async getProcedureDDL(database: string, procedureName: string, _schema?: string): Promise<string> {
        this.validateIdentifier(database);
        this.validateIdentifier(procedureName);
        const sql = `SHOW CREATE PROCEDURE ${this.quoteIdentifier(database)}.${this.quoteIdentifier(procedureName)}`;
        const result = await this.executeQuery(sql);
        if (result.status !== 'success' || result.rows.length === 0) {
            return '';
        }

        return (result.rows[0]['Create Procedure'] ?? '') as string;
    }

    async getTriggerDDL(database: string, triggerName: string, _schema?: string): Promise<string> {
        this.validateIdentifier(database);
        this.validateIdentifier(triggerName);
        const sql = `SHOW CREATE TRIGGER ${this.quoteIdentifier(database)}.${this.quoteIdentifier(triggerName)}`;
        const result = await this.executeQuery(sql);
        if (result.status !== 'success' || result.rows.length === 0) {
            return '';
        }

        return (result.rows[0]['SQL Original Statement'] ?? result.rows[0]['Create Trigger'] ?? '') as string;
    }

    async getRoutineParameters(database: string, routineName: string, routineType: 'FUNCTION' | 'PROCEDURE', _schema?: string): Promise<RoutineParameterInfo[]> {
        const sql = `SELECT PARAMETER_NAME, DATA_TYPE, DTD_IDENTIFIER, PARAMETER_MODE FROM INFORMATION_SCHEMA.PARAMETERS WHERE SPECIFIC_SCHEMA = ? AND SPECIFIC_NAME = ? AND ROUTINE_TYPE = ? AND PARAMETER_NAME IS NOT NULL ORDER BY ORDINAL_POSITION`;
        const result = await this.executeQuery(sql, [
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
        const useDb = database ?? this.shared.config?.database;
        if (!this.shared.pool) {
            return { format: 'json', raw: '{}', nodes: [] };
        }

        let conn: PoolConnection | null = null;
        try {
            conn = await this.shared.pool.getConnection();
            if (useDb) {
                this.validateIdentifier(useDb);
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
            supportedObjectTypes: ['table', 'view', 'function', 'procedure', 'trigger', 'index'],
        };
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

    private async describeTableForeignKeys(database: string, table: string): Promise<ForeignKeyInfo[]> {
        const sql = `SELECT kcu.CONSTRAINT_NAME, kcu.COLUMN_NAME, kcu.REFERENCED_TABLE_NAME, kcu.REFERENCED_COLUMN_NAME, rc.DELETE_RULE, rc.UPDATE_RULE FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc ON kcu.CONSTRAINT_NAME = rc.CONSTRAINT_NAME AND kcu.CONSTRAINT_SCHEMA = rc.CONSTRAINT_SCHEMA WHERE kcu.TABLE_SCHEMA = ? AND kcu.TABLE_NAME = ? AND kcu.REFERENCED_TABLE_NAME IS NOT NULL ORDER BY kcu.CONSTRAINT_NAME, kcu.ORDINAL_POSITION`;
        const result = await this.executeQuery(sql, [{ value: database }, { value: table }]);
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
}
