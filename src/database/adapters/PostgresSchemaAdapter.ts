import type { ISchemaAdapter, QueryResult, QueryParam, QueryRow, TriggerInfo, ColumnInfo, IndexInfo, ForeignKeyInfo, TableStructure, RoutineParameterInfo, DialectCapabilities, DataTypeCategory, ExplainResult, ExplainNode } from './IDatabaseAdapter';
import type { PostgresSharedContext } from './PostgresSharedContext';

export class PostgresSchemaAdapter implements ISchemaAdapter {
    constructor(
        private shared: PostgresSharedContext,
        private executeQuery: (sql: string, params?: QueryParam[]) => Promise<QueryResult>,
        private listTriggersFn: (database?: string, schema?: string) => Promise<TriggerInfo[]>
    ) {}

    async describeTable(database: string, table: string, schema?: string): Promise<TableStructure> {
        const targetSchema = schema ?? 'public';
        const [columns, indexes, foreignKeys, triggers] = await Promise.all([
            this.describeTableColumns(database, table, targetSchema),
            this.describeTableIndexes(database, table, targetSchema),
            this.describeTableForeignKeys(database, table, targetSchema),
            this.listTriggersFn(database, targetSchema),
        ]);

        return { columns, indexes, foreignKeys, triggers };
    }

    async getTableDDL(database: string, table: string, schema?: string): Promise<string> {
        const targetSchema = schema ?? 'public';
        const columns = await this.describeTableColumns(database, table, targetSchema);
        const indexes = await this.describeTableIndexes(database, table, targetSchema);
        const fks = await this.describeTableForeignKeys(database, table, targetSchema);

        const columnDefs = columns.map(c => {
            let def = `    ${this.quoteIdentifier(c.name)} ${c.type}`;
            if (!c.nullable) def += ' NOT NULL';
            if (c.isAutoIncrement) def += ' GENERATED ALWAYS AS IDENTITY';
            if (c.defaultValue !== null && c.defaultValue !== undefined) def += ` DEFAULT ${c.defaultValue}`;
            return def;
        }).join(',\n');

        const indexDefs = indexes
            .filter(i => !i.isPrimary)
            .map(i => `CREATE INDEX ${this.quoteIdentifier(i.name)} ON ${this.quoteIdentifier(targetSchema)}.${this.quoteIdentifier(table)} (${i.columns.map(c => this.quoteIdentifier(c)).join(', ')});`)
            .join('\n');

        const fkDefs = fks.map(fk => `ALTER TABLE ${this.quoteIdentifier(targetSchema)}.${this.quoteIdentifier(table)} ADD CONSTRAINT ${this.quoteIdentifier(fk.name)} FOREIGN KEY (${fk.columns.map(c => this.quoteIdentifier(c)).join(', ')}) REFERENCES ${this.quoteIdentifier(targetSchema)}.${this.quoteIdentifier(fk.referencedTable)} (${fk.referencedColumns.map(c => this.quoteIdentifier(c)).join(', ')});`).join('\n');

        let ddl = `CREATE TABLE ${this.quoteIdentifier(targetSchema)}.${this.quoteIdentifier(table)} (\n${columnDefs}\n);`;
        if (indexDefs) ddl += '\n' + indexDefs;
        if (fkDefs) ddl += '\n' + fkDefs;
        return ddl;
    }

    async getViewDDL(_database: string, view: string, schema?: string): Promise<string> {
        const targetSchema = schema ?? 'public';
        const sql = `SELECT pg_get_viewdef($1::regclass, true) AS definition`;
        const result = await this.executeQuery(sql, [{ value: `${targetSchema}.${view}` }]);
        if (result.status !== 'success' || result.rows.length === 0) {
            return '';
        }
        return (result.rows[0].definition as string) ?? '';
    }

    async getFunctionDDL(_database: string, functionName: string, schema?: string): Promise<string> {
        const targetSchema = schema ?? 'public';
        const sql = `SELECT pg_get_functiondef($1::regprocedure) AS definition`;
        const result = await this.executeQuery(sql, [{ value: `${targetSchema}.${functionName}` }]);
        if (result.status !== 'success' || result.rows.length === 0) {
            return '';
        }
        return (result.rows[0].definition as string) ?? '';
    }

    async getProcedureDDL(database: string, procedureName: string, schema?: string): Promise<string> {
        return this.getFunctionDDL(database, procedureName, schema);
    }

    async getTriggerDDL(_database: string, triggerName: string, _schema?: string): Promise<string> {
        const sql = `SELECT pg_get_triggerdef(oid) AS definition FROM pg_trigger WHERE tgname = $1 AND NOT tgisinternal`;
        const result = await this.executeQuery(sql, [{ value: triggerName }]);
        if (result.status !== 'success' || result.rows.length === 0) {
            return '';
        }
        return (result.rows[0].definition as string) ?? '';
    }

    async getRoutineParameters(_database: string, routineName: string, _routineType: 'FUNCTION' | 'PROCEDURE', schema?: string): Promise<RoutineParameterInfo[]> {
        const targetSchema = schema ?? 'public';
        const sql = `SELECT p.parameter_name, p.data_type, p.parameter_mode FROM information_schema.parameters p JOIN information_schema.routines r ON p.specific_schema = r.routine_schema AND p.specific_name = r.routine_name WHERE r.routine_schema = $1 AND r.routine_name = $2 AND p.parameter_name IS NOT NULL ORDER BY p.ordinal_position`;
        const result = await this.executeQuery(sql, [{ value: targetSchema }, { value: routineName }]);
        if (result.status !== 'success') {
            return [];
        }

        return result.rows.map((row: QueryRow) => ({
            name: row.parameter_name as string,
            type: row.data_type as string,
            direction: (row.parameter_mode as 'IN' | 'OUT' | 'INOUT') || 'IN',
        }));
    }

    async getExplainPlan(_database: string, sql: string): Promise<ExplainResult> {
        if (!this.shared.pool) {
            return { format: 'json', raw: '{}', nodes: [] };
        }

        let client: import('pg').PoolClient | null = null;
        try {
            client = await this.shared.pool.connect();
            const explainSql = `EXPLAIN (FORMAT JSON, ANALYZE) ${sql}`;
            const result = await client.query(explainSql);
            if (!result.rows || result.rows.length === 0) {
                return { format: 'json', raw: '{}', nodes: [] };
            }

            const raw = JSON.stringify(result.rows[0]);
            const parsed = result.rows[0] as Record<string, unknown>;
            const planData = (parsed['QUERY PLAN'] ?? parsed) as Record<string, unknown>;
            const nodes = this.parseExplainNodes(planData);

            return { format: 'json', raw, nodes };
        } catch (e) {
            console.debug('[SQL All in One] PG EXPLAIN error:', e);
            return { format: 'json', raw: '{}', nodes: [] };
        } finally {
            client?.release();
        }
    }

    async getTableRowCount(_database: string, table: string, schema?: string): Promise<number> {
        const targetSchema = schema ?? 'public';
        const sql = `SELECT reltuples::bigint AS row_count FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = $1 AND c.relname = $2`;
        const result = await this.executeQuery(sql, [{ value: targetSchema }, { value: table }]);
        if (result.status !== 'success' || result.rows.length === 0) {
            return 0;
        }
        const rowCount = result.rows[0].row_count;
        return rowCount != null ? Number(rowCount) : 0;
    }

    getDialectCapabilities(): DialectCapabilities {
        return {
            supportsSchema: true,
            supportsMultipleDatabases: true,
            maxConcurrentQueries: 5,
            supportsPreparedStatement: true,
            supportsExplain: true,
            supportsExplainAnalyze: true,
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
                    { name: 'smallint' },
                    { name: 'integer' },
                    { name: 'int' },
                    { name: 'bigint' },
                    { name: 'serial' },
                    { name: 'bigserial' },
                ],
            },
            {
                category: 'Float',
                types: [
                    { name: 'decimal', needsPrecision: true, needsScale: true },
                    { name: 'numeric', needsPrecision: true, needsScale: true },
                    { name: 'real' },
                    { name: 'double precision' },
                ],
            },
            {
                category: 'String',
                types: [
                    { name: 'character varying', needsLength: true },
                    { name: 'varchar', needsLength: true },
                    { name: 'character', needsLength: true },
                    { name: 'char', needsLength: true },
                    { name: 'text' },
                ],
            },
            {
                category: 'Date & Time',
                types: [
                    { name: 'timestamp' },
                    { name: 'timestamp without time zone' },
                    { name: 'timestamp with time zone' },
                    { name: 'date' },
                    { name: 'time' },
                    { name: 'interval' },
                ],
            },
            {
                category: 'Boolean',
                types: [{ name: 'boolean' }],
            },
            {
                category: 'Binary',
                types: [{ name: 'bytea' }],
            },
            {
                category: 'Other',
                types: [
                    { name: 'uuid' },
                    { name: 'json' },
                    { name: 'jsonb' },
                    { name: 'xml' },
                    { name: 'money' },
                    { name: 'bit', needsLength: true },
                ],
            },
        ];
    }

    quoteIdentifier(identifier: string): string {
        return '"' + identifier.replace(/"/g, '""') + '"';
    }

    private async describeTableColumns(_database: string, table: string, schema: string): Promise<ColumnInfo[]> {
        const sql = `SELECT column_name, data_type, character_maximum_length, numeric_precision, numeric_scale, is_nullable, column_default, ordinal_position FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`;
        const result = await this.executeQuery(sql, [{ value: schema }, { value: table }]);
        if (result.status !== 'success') {
            return [];
        }

        return result.rows.map((row: QueryRow) => {
            const columnDefault = row.column_default as string | null;
            const isAutoIncrement = columnDefault !== null && columnDefault.includes('nextval') || columnDefault !== null && columnDefault.includes('identity');
            const lengthRaw = row.character_maximum_length ?? row.numeric_precision ?? undefined;
            return {
                name: row.column_name as string,
                type: row.data_type as string,
                length: lengthRaw != null ? Number(lengthRaw) : undefined,
                nullable: row.is_nullable === 'YES',
                defaultValue: columnDefault as string | number | boolean | null,
                isPrimaryKey: false,
                isAutoIncrement,
                isUnique: false,
            };
        });
    }

    private async describeTableIndexes(_database: string, table: string, schema: string): Promise<IndexInfo[]> {
        const sql = `SELECT i.relname AS index_name, a.attname AS column_name, idx.indisunique AS is_unique, idx.indisprimary AS is_primary FROM pg_index idx JOIN pg_class t ON idx.indrelid = t.oid JOIN pg_class i ON idx.indexrelid = i.oid JOIN pg_namespace n ON n.oid = t.relnamespace JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(idx.indkey) WHERE n.nspname = $1 AND t.relname = $2 ORDER BY i.relname, a.attnum`;
        const result = await this.executeQuery(sql, [{ value: schema }, { value: table }]);
        if (result.status !== 'success') {
            return [];
        }

        const indexMap = new Map<string, IndexInfo>();
        for (const row of result.rows) {
            const indexName = row.index_name as string;
            if (!indexMap.has(indexName)) {
                indexMap.set(indexName, {
                    name: indexName,
                    type: 'btree',
                    columns: [],
                    isUnique: row.is_unique as boolean,
                    isPrimary: row.is_primary as boolean,
                });
            }
            indexMap.get(indexName)!.columns.push(row.column_name as string);
        }

        return Array.from(indexMap.values());
    }

    private async describeTableForeignKeys(_database: string, table: string, schema: string): Promise<ForeignKeyInfo[]> {
        const sql = `SELECT con.conname AS constraint_name, a.attname AS column_name, cf.relname AS referenced_table, af.attname AS referenced_column, con.confdeltype AS on_delete, con.confupdtype AS on_update FROM pg_constraint con JOIN pg_class c ON con.conrelid = c.oid JOIN pg_namespace n ON n.oid = c.relnamespace JOIN pg_class cf ON con.confrelid = cf.oid JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(con.conkey) JOIN pg_attribute af ON af.attrelid = cf.oid AND af.attnum = ANY(con.confkey) WHERE n.nspname = $1 AND c.relname = $2 AND con.contype = 'f' ORDER BY con.conname, a.attnum`;
        const result = await this.executeQuery(sql, [{ value: schema }, { value: table }]);
        if (result.status !== 'success') {
            return [];
        }

        const fkMap = new Map<string, ForeignKeyInfo>();
        const deleteRuleMap: Record<string, string> = { 'a': 'NO ACTION', 'r': 'RESTRICT', 'c': 'CASCADE', 'n': 'SET NULL', 'd': 'SET DEFAULT' };
        const updateRuleMap: Record<string, string> = { 'a': 'NO ACTION', 'r': 'RESTRICT', 'c': 'CASCADE', 'n': 'SET NULL', 'd': 'SET DEFAULT' };

        for (const row of result.rows) {
            const fkName = row.constraint_name as string;
            if (!fkMap.has(fkName)) {
                fkMap.set(fkName, {
                    name: fkName,
                    columns: [],
                    referencedTable: row.referenced_table as string,
                    referencedColumns: [],
                    onDelete: deleteRuleMap[row.on_delete as string] ?? 'NO ACTION',
                    onUpdate: updateRuleMap[row.on_update as string] ?? 'NO ACTION',
                });
            }
            const fk = fkMap.get(fkName)!;
            fk.columns.push(row.column_name as string);
            fk.referencedColumns.push(row.referenced_column as string);
        }

        return Array.from(fkMap.values());
    }

    private parseExplainNodes(obj: Record<string, unknown>, idCounter: { value: number } = { value: 0 }): ExplainNode[] {
        const nodes: ExplainNode[] = [];
        const plan = (obj.Plan ?? obj.plan) as Record<string, unknown> | undefined;

        if (plan) {
            nodes.push(this.parseSinglePlanNode(plan, idCounter));
        }

        return nodes;
    }

    private parseSinglePlanNode(plan: Record<string, unknown>, idCounter: { value: number }): ExplainNode {
        const node: ExplainNode = {
            id: String(++idCounter.value),
            operation: (plan['Node Type'] as string) ?? 'unknown',
            table: plan['Relation Name'] as string | undefined,
            rows: plan['Actual Rows'] != null ? Number(plan['Actual Rows']) : undefined,
            cost: plan['Total Cost'] != null ? Number(plan['Total Cost']) : undefined,
            key: plan['Index Name'] as string | undefined,
            extra: plan['Filter'] as string | undefined,
            children: [],
        };

        const subPlans = plan.Plans as unknown[] | undefined;
        if (Array.isArray(subPlans)) {
            for (const subPlan of subPlans) {
                if (subPlan && typeof subPlan === 'object') {
                    node.children.push(this.parseSinglePlanNode(subPlan as Record<string, unknown>, idCounter));
                }
            }
        }

        return node;
    }
}
