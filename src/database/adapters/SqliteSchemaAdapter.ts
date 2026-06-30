import type { ISchemaAdapter, QueryResult, QueryParam, QueryRow, TriggerInfo, ColumnInfo, IndexInfo, ForeignKeyInfo, TableStructure, RoutineParameterInfo, DialectCapabilities, DataTypeCategory, ExplainResult, ExplainNode } from './IDatabaseAdapter';

export class SqliteSchemaAdapter implements ISchemaAdapter {
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
