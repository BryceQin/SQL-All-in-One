import type { ISchemaAdapter, QueryResult, QueryParam, QueryRow, TriggerInfo, ColumnInfo, IndexInfo, ForeignKeyInfo, TableStructure, RoutineParameterInfo, DialectCapabilities, DataTypeCategory, ExplainResult, ExplainNode } from './IDatabaseAdapter';
import type { OracleSharedContext } from './OracleSharedContext';

/**
 * Oracle schema adapter.
 *
 * Table/view/function/procedure/trigger DDL is retrieved via the
 * `DBMS_METADATA.GET_DDL` PL/SQL function, which returns a CLOB that oracledb
 * materialises as a string when fetched. The execution plan is obtained via
 * `EXPLAIN PLAN FOR` followed by querying `plan_table` (or
 * `DBMS_XPLAN.DISPLAY`).
 *
 * Identifiers are quoted with double quotes, matching Oracle's quoted
 * identifier syntax.
 */
export class OracleSchemaAdapter implements ISchemaAdapter {
    constructor(
        private shared: OracleSharedContext,
        private executeQuery: (sql: string, params?: QueryParam[]) => Promise<QueryResult>,
        private listTriggersFn: (database?: string, schema?: string) => Promise<TriggerInfo[]>
    ) {}

    async describeTable(_database: string, table: string, schema?: string): Promise<TableStructure> {
        const owner = this.resolveOwner(schema);
        const [columns, indexes, foreignKeys, triggers] = await Promise.all([
            this.describeTableColumns(table, owner),
            this.describeTableIndexes(table, owner),
            this.describeTableForeignKeys(table, owner),
            this.listTriggersFn(undefined, owner),
        ]);

        return { columns, indexes, foreignKeys, triggers };
    }

    async getTableDDL(_database: string, table: string, schema?: string): Promise<string> {
        const owner = this.resolveOwner(schema);
        this.validateIdentifier(table);
        // DBMS_METADATA.GET_DDL returns a CLOB; oracledb returns CLOBs as
        // strings by default in thin mode, so no special fetch handling is
        // required.
        const sql = `SELECT DBMS_METADATA.GET_DDL('TABLE', :1, :2) AS ddl FROM dual`;
        const result = await this.executeQuery(sql, [{ value: table }, { value: owner }]);
        if (result.status !== 'success' || result.rows.length === 0) {
            return '';
        }
        return (result.rows[0].ddl as string) ?? '';
    }

    async getViewDDL(_database: string, view: string, schema?: string): Promise<string> {
        const owner = this.resolveOwner(schema);
        this.validateIdentifier(view);
        const sql = `SELECT DBMS_METADATA.GET_DDL('VIEW', :1, :2) AS ddl FROM dual`;
        const result = await this.executeQuery(sql, [{ value: view }, { value: owner }]);
        if (result.status !== 'success' || result.rows.length === 0) {
            return '';
        }
        return (result.rows[0].ddl as string) ?? '';
    }

    async getFunctionDDL(_database: string, functionName: string, schema?: string): Promise<string> {
        const owner = this.resolveOwner(schema);
        this.validateIdentifier(functionName);
        const sql = `SELECT DBMS_METADATA.GET_DDL('FUNCTION', :1, :2) AS ddl FROM dual`;
        const result = await this.executeQuery(sql, [{ value: functionName }, { value: owner }]);
        if (result.status !== 'success' || result.rows.length === 0) {
            return '';
        }
        return (result.rows[0].ddl as string) ?? '';
    }

    async getProcedureDDL(_database: string, procedureName: string, schema?: string): Promise<string> {
        const owner = this.resolveOwner(schema);
        this.validateIdentifier(procedureName);
        const sql = `SELECT DBMS_METADATA.GET_DDL('PROCEDURE', :1, :2) AS ddl FROM dual`;
        const result = await this.executeQuery(sql, [{ value: procedureName }, { value: owner }]);
        if (result.status !== 'success' || result.rows.length === 0) {
            return '';
        }
        return (result.rows[0].ddl as string) ?? '';
    }

    async getTriggerDDL(_database: string, triggerName: string, schema?: string): Promise<string> {
        const owner = this.resolveOwner(schema);
        this.validateIdentifier(triggerName);
        const sql = `SELECT DBMS_METADATA.GET_DDL('TRIGGER', :1, :2) AS ddl FROM dual`;
        const result = await this.executeQuery(sql, [{ value: triggerName }, { value: owner }]);
        if (result.status !== 'success' || result.rows.length === 0) {
            return '';
        }
        return (result.rows[0].ddl as string) ?? '';
    }

    async getRoutineParameters(_database: string, routineName: string, _routineType: 'FUNCTION' | 'PROCEDURE', schema?: string): Promise<RoutineParameterInfo[]> {
        const owner = this.resolveOwner(schema);
        this.validateIdentifier(routineName);
        // all_arguments lists parameters for procedures and functions.
        const sql = `SELECT argument_name AS argument_name, data_type AS data_type, in_out AS in_out FROM all_arguments WHERE owner = :1 AND object_name = :2 AND argument_name IS NOT NULL ORDER BY position`;
        const result = await this.executeQuery(sql, [{ value: owner }, { value: routineName }]);
        if (result.status !== 'success') {
            return [];
        }

        return result.rows.map((row: QueryRow) => ({
            name: row.argument_name as string,
            type: row.data_type as string,
            direction: this.parseDirection(row.in_out as string),
        }));
    }

    async getExplainPlan(_database: string, sql: string): Promise<ExplainResult> {
        if (!this.shared.pool) {
            return { format: 'table', raw: '', nodes: [] };
        }

        // Use DBMS_XPLAN.DISPLAY for a readable text plan. We need a dedicated
        // connection because EXPLAIN PLAN writes to plan_table in the current
        // session, and we must read it back before the connection is returned
        // to the pool.
        //
        // IMPORTANT: plan_table may be a shared table (PUBLIC synonym) on some
        // Oracle configurations. We tag every EXPLAIN PLAN with a unique
        // statement_id and scope ALL DELETE/SELECT operations by that id, so
        // we never touch other sessions' plan rows.
        const statementId = `sql_all_in_one_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
        let conn;
        try {
            conn = await this.shared.pool.getConnection();

            // Clear any previous plan rows for THIS statement_id only.
            await conn.execute(`DELETE FROM plan_table WHERE statement_id = :id`, { id: statementId });
            await conn.commit();

            // Generate the plan, tagged with our statement_id.
            const explainSql = `EXPLAIN PLAN SET STATEMENT_ID = '${statementId}' FOR ${sql}`;
            await conn.execute(explainSql);

            // Read the plan via DBMS_XPLAN.DISPLAY for our statement_id only.
            // DBMS_XPLAN.DISPLAY accepts (table_name, statement_id, format).
            const xplanSql = `SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY('PLAN_TABLE', :id, 'ALL'))`;
            const oracledb = await import('oracledb');
            const result = await conn.execute<QueryRow>(xplanSql, { id: statementId }, {
                outFormat: oracledb.OUT_FORMAT_OBJECT,
            });

            const planRows = (result.rows ?? []) as QueryRow[];
            const raw = planRows.map(r => (r.plan_table_output as string) ?? '').join('\n');

            // Also fetch the structured plan_table rows for THIS statement_id
            // so we can build a node tree for the UI.
            const structuredSql = `SELECT id, depth, parent_id, operation, options, object_name, cardinality AS rows, cost FROM plan_table WHERE statement_id = :id ORDER BY id`;
            const structuredResult = await conn.execute<QueryRow>(structuredSql, { id: statementId }, {
                outFormat: oracledb.OUT_FORMAT_OBJECT,
            });
            const nodes = this.buildExplainNodes(structuredResult.rows ?? []);

            // Clean up only the plan rows we generated.
            await conn.execute(`DELETE FROM plan_table WHERE statement_id = :id`, { id: statementId });
            await conn.commit();

            return { format: 'table', raw, nodes };
        } catch (e) {
            console.debug('[SQL All in One] Oracle EXPLAIN error:', e);
            return { format: 'table', raw: '', nodes: [] };
        } finally {
            if (conn) {
                try {
                    await conn.close();
                } catch (e) {
                    console.debug('[SQL All in One] Oracle explain connection close error:', e);
                }
            }
        }
    }

    async getTableRowCount(_database: string, table: string, schema?: string): Promise<number> {
        const owner = this.resolveOwner(schema);
        // all_tables.num_rows is populated by statistics collection; it is an
        // estimate and avoids a full table scan.
        const sql = `SELECT num_rows AS row_count FROM all_tables WHERE owner = :1 AND table_name = :2`;
        const result = await this.executeQuery(sql, [{ value: owner }, { value: table }]);
        if (result.status !== 'success' || result.rows.length === 0) {
            return 0;
        }
        return (result.rows[0].row_count as number) ?? 0;
    }

    getDialectCapabilities(): DialectCapabilities {
        return {
            supportsSchema: true,
            supportsMultipleDatabases: false,
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
                    { name: 'NUMBER' },
                    { name: 'INTEGER' },
                    { name: 'INT' },
                    { name: 'SMALLINT' },
                ],
            },
            {
                category: 'Float',
                types: [
                    { name: 'NUMBER', needsPrecision: true, needsScale: true },
                    { name: 'FLOAT', needsPrecision: true },
                    { name: 'BINARY_FLOAT' },
                    { name: 'BINARY_DOUBLE' },
                ],
            },
            {
                category: 'String',
                types: [
                    { name: 'CHAR', needsLength: true },
                    { name: 'VARCHAR2', needsLength: true },
                    { name: 'NCHAR', needsLength: true },
                    { name: 'NVARCHAR2', needsLength: true },
                    { name: 'CLOB' },
                    { name: 'NCLOB' },
                    { name: 'LONG' },
                ],
            },
            {
                category: 'Date & Time',
                types: [
                    { name: 'DATE' },
                    { name: 'TIMESTAMP', needsPrecision: true },
                    { name: 'TIMESTAMP WITH TIME ZONE', needsPrecision: true },
                    { name: 'TIMESTAMP WITH LOCAL TIME ZONE', needsPrecision: true },
                    { name: 'INTERVAL YEAR TO MONTH' },
                    { name: 'INTERVAL DAY TO SECOND' },
                ],
            },
            {
                category: 'Binary',
                types: [
                    { name: 'RAW', needsLength: true },
                    { name: 'BLOB' },
                    { name: 'BFILE' },
                    { name: 'LONG RAW' },
                ],
            },
            {
                category: 'Other',
                types: [
                    { name: 'ROWID' },
                    { name: 'UROWID' },
                    { name: 'JSON' },
                    { name: 'XMLTYPE' },
                ],
            },
        ];
    }

    quoteIdentifier(identifier: string): string {
        return '"' + identifier.replace(/"/g, '""') + '"';
    }

    private validateIdentifier(identifier: string): void {
        if (!identifier || typeof identifier !== 'string') {
            throw new Error('Invalid identifier: identifier must be a non-empty string');
        }
        if (identifier.length > 128) {
            throw new Error('Invalid identifier: identifier exceeds maximum length');
        }
        // eslint-disable-next-line no-control-regex
        if (/\u0000/.test(identifier)) {
            throw new Error('Invalid identifier: identifier contains null bytes');
        }
    }

    private resolveOwner(schema?: string): string {
        if (schema && schema.length > 0) {
            return schema.toUpperCase();
        }
        const fromConfig = this.shared.config?.username;
        if (fromConfig && fromConfig.length > 0) {
            return fromConfig.toUpperCase();
        }
        return 'SYS';
    }

    private parseDirection(inOut: string): 'IN' | 'OUT' | 'INOUT' {
        if (!inOut) {
            return 'IN';
        }
        const upper = inOut.toUpperCase();
        if (upper === 'OUT') {
            return 'OUT';
        }
        if (upper === 'IN/OUT' || upper === 'INOUT') {
            return 'INOUT';
        }
        return 'IN';
    }

    private async describeTableColumns(table: string, owner: string): Promise<ColumnInfo[]> {
        this.validateIdentifier(table);
        const sql = `SELECT column_name, data_type, data_length, data_precision, data_scale, nullable, data_default, column_id FROM all_tab_columns WHERE owner = :1 AND table_name = :2 ORDER BY column_id`;
        const result = await this.executeQuery(sql, [{ value: owner }, { value: table }]);
        if (result.status !== 'success') {
            return [];
        }

        // Fetch primary key column names so we can flag them on the column
        // info. all_constraints + all_cons_columns gives the PK columns.
        const pkColumns = await this.getPrimaryKeyColumns(table, owner);
        const pkSet = new Set(pkColumns);

        return result.rows.map((row: QueryRow) => {
            const dataType = row.data_type as string;
            const dataLength = row.data_length as number;
            const dataPrecision = row.data_precision as number;
            const dataScale = row.data_scale as number;
            let type = dataType;
            if (dataType === 'VARCHAR2' || dataType === 'CHAR' || dataType === 'NVARCHAR2' || dataType === 'NCHAR' || dataType === 'RAW') {
                type = `${dataType}(${dataLength})`;
            } else if (dataType === 'NUMBER') {
                if (dataPrecision !== null && dataScale !== null) {
                    type = `NUMBER(${dataPrecision}, ${dataScale})`;
                } else if (dataPrecision !== null) {
                    type = `NUMBER(${dataPrecision})`;
                }
            }

            const columnName = row.column_name as string;
            return {
                name: columnName,
                type,
                length: dataLength > 0 ? dataLength : undefined,
                nullable: row.nullable === 'Y',
                defaultValue: (row.data_default as string | null)?.trim() || null,
                isPrimaryKey: pkSet.has(columnName),
                isAutoIncrement: false,
                isUnique: false,
            };
        });
    }

    private async getPrimaryKeyColumns(table: string, owner: string): Promise<string[]> {
        this.validateIdentifier(table);
        const sql = `SELECT acc.column_name AS column_name FROM all_constraints c JOIN all_cons_columns acc ON c.constraint_name = acc.constraint_name AND c.owner = acc.owner WHERE c.constraint_type = 'P' AND c.owner = :1 AND c.table_name = :2 ORDER BY acc.position`;
        const result = await this.executeQuery(sql, [{ value: owner }, { value: table }]);
        if (result.status !== 'success') {
            return [];
        }
        return result.rows.map((row: QueryRow) => row.column_name as string);
    }

    private async describeTableIndexes(table: string, owner: string): Promise<IndexInfo[]> {
        this.validateIdentifier(table);
        // Join all_indexes to all_constraints with constraint_type = 'P' so we
        // can flag the actual PK index by its constraint name rather than by
        // (imprecise) column-set equality, which would misclassify a non-PK
        // unique index that happens to span the same columns as the PK.
        const sql = `SELECT i.index_name, i.index_type, i.uniqueness, ic.column_name, CASE WHEN c.constraint_type = 'P' THEN 1 ELSE 0 END AS is_pk FROM all_indexes i JOIN all_ind_columns ic ON i.index_name = ic.index_name AND i.owner = ic.index_owner LEFT JOIN all_constraints c ON c.index_owner = i.owner AND c.index_name = i.index_name AND c.constraint_type = 'P' AND c.owner = i.owner AND c.table_name = i.table_name WHERE i.owner = :1 AND i.table_name = :2 ORDER BY i.index_name, ic.column_position`;
        const result = await this.executeQuery(sql, [{ value: owner }, { value: table }]);
        if (result.status !== 'success') {
            return [];
        }

        const indexMap = new Map<string, IndexInfo>();
        for (const row of result.rows) {
            const indexName = row.index_name as string;
            if (!indexMap.has(indexName)) {
                const uniqueness = row.uniqueness as string;
                const isPk = row.is_pk === 1 || row.is_pk === true;
                indexMap.set(indexName, {
                    name: indexName,
                    type: (row.index_type as string) ?? 'NORMAL',
                    columns: [],
                    isUnique: uniqueness === 'UNIQUE' || isPk,
                    isPrimary: isPk,
                });
            }
            indexMap.get(indexName)!.columns.push(row.column_name as string);
        }

        return Array.from(indexMap.values());
    }

    private async describeTableForeignKeys(table: string, owner: string): Promise<ForeignKeyInfo[]> {
        this.validateIdentifier(table);
        const sql = `SELECT a.constraint_name, acc.column_name, r.owner AS r_owner, r.table_name AS r_table_name, rcc.column_name AS r_column_name, a.delete_rule FROM all_constraints a JOIN all_cons_columns acc ON a.constraint_name = acc.constraint_name AND a.owner = acc.owner JOIN all_constraints r ON a.r_constraint_name = r.constraint_name AND a.r_owner = r.owner JOIN all_cons_columns rcc ON r.constraint_name = rcc.constraint_name AND r.owner = rcc.owner WHERE a.constraint_type = 'R' AND a.owner = :1 AND a.table_name = :2 ORDER BY a.constraint_name, acc.position`;
        const result = await this.executeQuery(sql, [{ value: owner }, { value: table }]);
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
                    referencedTable: row.r_table_name as string,
                    referencedColumns: [],
                    onDelete: (row.delete_rule as string) ?? 'NO ACTION',
                    onUpdate: 'NO ACTION',
                });
            }
            const fk = fkMap.get(fkName)!;
            fk.columns.push(row.column_name as string);
            fk.referencedColumns.push(row.r_column_name as string);
        }

        return Array.from(fkMap.values());
    }

    /**
     * Builds a tree of ExplainNode from plan_table rows.
     *
     * plan_table rows are returned in preorder (id ascending) with a `depth`
     * column indicating the nesting level. We reconstruct the tree using a
     * stack: pop until the stack top is at depth - 1, then attach the current
     * node as a child of the stack top (or as a root if the stack is empty).
     */
    private buildExplainNodes(rows: QueryRow[]): ExplainNode[] {
        if (rows.length === 0) {
            return [];
        }

        const nodeMap = new Map<number, ExplainNode>();
        const roots: ExplainNode[] = [];

        // First pass: create all nodes keyed by id.
        for (const row of rows) {
            const id = String(row.id);
            const operation = (row.operation as string) ?? 'unknown';
            const options = row.options as string | undefined;
            const node: ExplainNode = {
                id,
                operation: options ? `${operation} ${options}` : operation,
                table: row.object_name as string | undefined,
                rows: row.rows as number | undefined,
                cost: row.cost as number | undefined,
                children: [],
            };
            nodeMap.set(row.id as number, node);
        }

        // Second pass: link children to parents using the depth column.
        const stack: ExplainNode[] = [];
        for (const row of rows) {
            const node = nodeMap.get(row.id as number)!;
            const depth = (row.depth as number) ?? 0;
            // Pop stack until we find the parent at depth - 1.
            while (stack.length > depth) {
                stack.pop();
            }
            if (stack.length === 0) {
                roots.push(node);
            } else {
                stack[stack.length - 1].children.push(node);
            }
            stack.push(node);
        }

        return roots;
    }
}
