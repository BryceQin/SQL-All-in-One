import type { QueryResult, QueryParam, QueryRow, TriggerInfo, ColumnInfo, IndexInfo, ForeignKeyInfo, RoutineParameterInfo, DialectCapabilities, DataTypeCategory, ExplainResult, ExplainNode } from './IDatabaseAdapter';
import type { DamengSharedContext } from './DamengSharedContext';
import { OracleSchemaAdapter } from './OracleSchemaAdapter';

/**
 * Dameng (DM8) schema adapter.
 *
 * Dameng is Oracle-dialect compatible (DBMS_METADATA.GET_DDL,
 * all_tab_columns, all_constraints, double-quoted identifiers, etc.), so
 * this class extends {@link OracleSchemaAdapter} and reuses the describe /
 * DDL / row-count / quote / validate / parseDirection helpers unchanged.
 *
 * The only divergences from Oracle are:
 *
 *   - Placeholder syntax: Dameng's ODBC driver uses positional `?`
 *     placeholders instead of Oracle's named `:1` / `:2` binds. Every SQL
 *     string is therefore overridden.
 *   - EXPLAIN syntax: Dameng uses `EXPLAIN <sql>` (no `FOR` keyword) and
 *     returns plan rows directly via the ODBC connection (no plan_table /
 *     DBMS_XPLAN indirection). {@link getExplainPlan} is overridden end-to-end.
 *   - Default owner: `SYSDBA` instead of Oracle's `SYS`.
 *   - `VARCHAR` is treated as a length-parameterised type alongside
 *     VARCHAR2/CHAR/etc.
 *   - `supportsCancel: false` (ODBC has no native cancel) and the supported
 *     object types include `sequence` / `synonym`.
 *   - The supported data-type list reflects Dameng's broader numeric/string
 *     type set (INT/BIGINT/TINYINT/REAL/DOUBLE/TEXT/IMAGE/...).
 */
export class DamengSchemaAdapter extends OracleSchemaAdapter<DamengSharedContext> {
    constructor(
        shared: DamengSharedContext,
        executeQuery: (sql: string, params?: QueryParam[]) => Promise<QueryResult>,
        listTriggersFn: (database?: string, schema?: string) => Promise<TriggerInfo[]>
    ) {
        super(shared, executeQuery, listTriggersFn);
    }

    override async getTableDDL(_database: string, table: string, schema?: string): Promise<string> {
        const owner = this.resolveOwner(schema);
        this.validateIdentifier(table);
        // DBMS_METADATA.GET_DDL returns a CLOB; the ODBC driver returns
        // CLOBs as strings by default, so no special fetch handling is
        // required.
        const sql = `SELECT DBMS_METADATA.GET_DDL('TABLE', ?, ?) AS ddl FROM dual`;
        const result = await this.executeQuery(sql, [{ value: table }, { value: owner }]);
        if (result.status !== 'success' || result.rows.length === 0) {
            return '';
        }
        return (result.rows[0].ddl as string) ?? '';
    }

    override async getViewDDL(_database: string, view: string, schema?: string): Promise<string> {
        const owner = this.resolveOwner(schema);
        this.validateIdentifier(view);
        const sql = `SELECT DBMS_METADATA.GET_DDL('VIEW', ?, ?) AS ddl FROM dual`;
        const result = await this.executeQuery(sql, [{ value: view }, { value: owner }]);
        if (result.status !== 'success' || result.rows.length === 0) {
            return '';
        }
        return (result.rows[0].ddl as string) ?? '';
    }

    override async getFunctionDDL(_database: string, functionName: string, schema?: string): Promise<string> {
        const owner = this.resolveOwner(schema);
        this.validateIdentifier(functionName);
        const sql = `SELECT DBMS_METADATA.GET_DDL('FUNCTION', ?, ?) AS ddl FROM dual`;
        const result = await this.executeQuery(sql, [{ value: functionName }, { value: owner }]);
        if (result.status !== 'success' || result.rows.length === 0) {
            return '';
        }
        return (result.rows[0].ddl as string) ?? '';
    }

    override async getProcedureDDL(_database: string, procedureName: string, schema?: string): Promise<string> {
        const owner = this.resolveOwner(schema);
        this.validateIdentifier(procedureName);
        const sql = `SELECT DBMS_METADATA.GET_DDL('PROCEDURE', ?, ?) AS ddl FROM dual`;
        const result = await this.executeQuery(sql, [{ value: procedureName }, { value: owner }]);
        if (result.status !== 'success' || result.rows.length === 0) {
            return '';
        }
        return (result.rows[0].ddl as string) ?? '';
    }

    override async getTriggerDDL(_database: string, triggerName: string, schema?: string): Promise<string> {
        const owner = this.resolveOwner(schema);
        this.validateIdentifier(triggerName);
        const sql = `SELECT DBMS_METADATA.GET_DDL('TRIGGER', ?, ?) AS ddl FROM dual`;
        const result = await this.executeQuery(sql, [{ value: triggerName }, { value: owner }]);
        if (result.status !== 'success' || result.rows.length === 0) {
            return '';
        }
        return (result.rows[0].ddl as string) ?? '';
    }

    override async getRoutineParameters(_database: string, routineName: string, _routineType: 'FUNCTION' | 'PROCEDURE', schema?: string): Promise<RoutineParameterInfo[]> {
        const owner = this.resolveOwner(schema);
        this.validateIdentifier(routineName);
        // all_arguments lists parameters for procedures and functions.
        const sql = `SELECT argument_name AS argument_name, data_type AS data_type, in_out AS in_out FROM all_arguments WHERE owner = ? AND object_name = ? AND argument_name IS NOT NULL ORDER BY position`;
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

    override async getExplainPlan(_database: string, sql: string): Promise<ExplainResult> {
        if (!this.shared.pool) {
            return { format: 'table', raw: '', nodes: [] };
        }

        // Dameng supports `EXPLAIN <sql>` (without the `FOR` keyword that
        // Oracle uses). We need a dedicated connection because the EXPLAIN
        // output is tied to the session.
        let conn: import('odbc').Connection | null = null;
        try {
            conn = await this.shared.pool.connect();
            const explainSql = `EXPLAIN ${sql}`;
            const result = await conn.query<QueryRow>(explainSql);

            const planRows = (Array.isArray(result) ? (result as QueryRow[]) : []);
            const raw = planRows
                .map(r => Object.entries(r)
                    .map(([k, v]) => `${k}=${v === null || v === undefined ? 'NULL' : String(v)}`)
                    .join('  '))
                .join('\n');

            const nodes = this.buildDamengExplainNodes(planRows);

            return { format: 'table', raw, nodes };
        } catch (e) {
            console.debug('[SQL All in One] Dameng EXPLAIN error:', e);
            return { format: 'table', raw: '', nodes: [] };
        } finally {
            if (conn) {
                try {
                    await conn.close();
                } catch (e) {
                    console.debug('[SQL All in One] Dameng explain connection close error:', e);
                }
            }
        }
    }

    override async getTableRowCount(_database: string, table: string, schema?: string): Promise<number> {
        const owner = this.resolveOwner(schema);
        // all_tables.num_rows is populated by statistics collection; it is an
        // estimate and avoids a full table scan.
        const sql = `SELECT num_rows AS row_count FROM all_tables WHERE owner = ? AND table_name = ?`;
        const result = await this.executeQuery(sql, [{ value: owner }, { value: table }]);
        if (result.status !== 'success' || result.rows.length === 0) {
            return 0;
        }
        const rowCount = result.rows[0].row_count;
        return rowCount != null ? Number(rowCount) : 0;
    }

    override getDialectCapabilities(): DialectCapabilities {
        return {
            supportsSchema: true,
            supportsMultipleDatabases: false,
            maxConcurrentQueries: 5,
            supportsPreparedStatement: true,
            supportsExplain: true,
            supportsExplainAnalyze: false,
            // ODBC has no native cancel(); we rely on query timeout + KILL
            // SESSION as a best-effort path.
            supportsCancel: false,
            supportsSshTunnel: true,
            supportedObjectTypes: ['table', 'view', 'function', 'procedure', 'trigger', 'index', 'sequence', 'synonym'],
        };
    }

    override getSupportedDataTypes(): DataTypeCategory[] {
        // Dameng supports a superset of Oracle's data types plus a few
        // DM-specific ones. The categories mirror OracleSchemaAdapter's
        // structure for consistency.
        return [
            {
                category: 'Integer',
                types: [
                    { name: 'INT' },
                    { name: 'INTEGER' },
                    { name: 'BIGINT' },
                    { name: 'SMALLINT' },
                    { name: 'TINYINT' },
                    { name: 'NUMBER' },
                ],
            },
            {
                category: 'Float',
                types: [
                    { name: 'NUMBER', needsPrecision: true, needsScale: true },
                    { name: 'FLOAT', needsPrecision: true },
                    { name: 'REAL' },
                    { name: 'DOUBLE' },
                    { name: 'BINARY_FLOAT' },
                    { name: 'BINARY_DOUBLE' },
                ],
            },
            {
                category: 'String',
                types: [
                    { name: 'CHAR', needsLength: true },
                    { name: 'VARCHAR', needsLength: true },
                    { name: 'VARCHAR2', needsLength: true },
                    { name: 'TEXT' },
                    { name: 'LONG' },
                    { name: 'CLOB' },
                ],
            },
            {
                category: 'Date & Time',
                types: [
                    { name: 'DATE' },
                    { name: 'TIME' },
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
                    { name: 'BINARY', needsLength: true },
                    { name: 'VARBINARY', needsLength: true },
                    { name: 'BLOB' },
                    { name: 'IMAGE' },
                ],
            },
            {
                category: 'Other',
                types: [
                    { name: 'BOOLEAN' },
                    { name: 'BIT' },
                    { name: 'JSON' },
                    { name: 'XMLTYPE' },
                    { name: 'ROWID' },
                ],
            },
        ];
    }

    /**
     * Dameng's default owner is `SYSDBA` (Oracle's is `SYS`).
     */
    protected override resolveOwner(schema?: string): string {
        if (schema && schema.length > 0) {
            return schema.toUpperCase();
        }
        const fromConfig = this.shared.config?.username;
        if (fromConfig && fromConfig.length > 0) {
            return fromConfig.toUpperCase();
        }
        return 'SYSDBA';
    }

    protected override async describeTableColumns(table: string, owner: string): Promise<ColumnInfo[]> {
        this.validateIdentifier(table);
        const sql = `SELECT column_name, data_type, data_length, data_precision, data_scale, nullable, data_default, column_id FROM all_tab_columns WHERE owner = ? AND table_name = ? ORDER BY column_id`;
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
            const dataLength = row.data_length != null ? Number(row.data_length) : 0;
            const dataPrecision = row.data_precision != null ? Number(row.data_precision) : null;
            const dataScale = row.data_scale != null ? Number(row.data_scale) : null;
            let type = dataType;
            if (dataType === 'VARCHAR2' || dataType === 'CHAR' || dataType === 'NVARCHAR2' || dataType === 'NCHAR' || dataType === 'RAW' || dataType === 'VARCHAR') {
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

    protected override async getPrimaryKeyColumns(table: string, owner: string): Promise<string[]> {
        this.validateIdentifier(table);
        const sql = `SELECT acc.column_name AS column_name FROM all_constraints c JOIN all_cons_columns acc ON c.constraint_name = acc.constraint_name AND c.owner = acc.owner WHERE c.constraint_type = 'P' AND c.owner = ? AND c.table_name = ? ORDER BY acc.position`;
        const result = await this.executeQuery(sql, [{ value: owner }, { value: table }]);
        if (result.status !== 'success') {
            return [];
        }
        return result.rows.map((row: QueryRow) => row.column_name as string);
    }

    protected override async describeTableIndexes(table: string, owner: string): Promise<IndexInfo[]> {
        this.validateIdentifier(table);
        // Join all_indexes to all_constraints with constraint_type = 'P' so we
        // can flag the actual PK index by its constraint name rather than by
        // (imprecise) column-set equality, which would misclassify a non-PK
        // unique index that happens to span the same columns as the PK.
        const sql = `SELECT i.index_name, i.index_type, i.uniqueness, ic.column_name, CASE WHEN c.constraint_type = 'P' THEN 1 ELSE 0 END AS is_pk FROM all_indexes i JOIN all_ind_columns ic ON i.index_name = ic.index_name AND i.owner = ic.index_owner LEFT JOIN all_constraints c ON c.index_owner = i.owner AND c.index_name = i.index_name AND c.constraint_type = 'P' AND c.owner = i.owner AND c.table_name = i.table_name WHERE i.owner = ? AND i.table_name = ? ORDER BY i.index_name, ic.column_position`;
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

    protected override async describeTableForeignKeys(table: string, owner: string): Promise<ForeignKeyInfo[]> {
        this.validateIdentifier(table);
        const sql = `SELECT a.constraint_name, acc.column_name, r.owner AS r_owner, r.table_name AS r_table_name, rcc.column_name AS r_column_name, a.delete_rule FROM all_constraints a JOIN all_cons_columns acc ON a.constraint_name = acc.constraint_name AND a.owner = acc.owner JOIN all_constraints r ON a.r_constraint_name = r.constraint_name AND a.r_owner = r.owner JOIN all_cons_columns rcc ON r.constraint_name = rcc.constraint_name AND r.owner = rcc.owner WHERE a.constraint_type = 'R' AND a.owner = ? AND a.table_name = ? ORDER BY a.constraint_name, acc.position`;
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
     * Builds a tree of ExplainNode from EXPLAIN output rows.
     *
     * EXPLAIN returns one row per plan step. We reconstruct the tree using
     * any `id`/`parent_id`/`depth` columns that happen to be present, or
     * fall back to a flat list when the columns are absent. Dameng's
     * EXPLAIN output schema varies by version, so this implementation is
     * deliberately defensive.
     *
     * This differs from {@link OracleSchemaAdapter.buildExplainNodes} (which
     * assumes the structured `plan_table` shape) because Dameng's EXPLAIN
     * returns its own row shape directly.
     */
    private buildDamengExplainNodes(rows: QueryRow[]): ExplainNode[] {
        if (rows.length === 0) {
            return [];
        }

        const first = rows[0];
        const hasId = 'id' in first || 'ID' in first;
        const hasParentId = 'parent_id' in first || 'PARENT_ID' in first;
        const hasDepth = 'depth' in first || 'DEPTH' in first;

        // Build node objects keyed by id (when available).
        const nodeMap = new Map<string, ExplainNode>();
        const nodes: ExplainNode[] = [];
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const id = String(row.id ?? row.ID ?? i);
            const operation = (row.operation ?? row.OPERATION ?? row.NODE ?? 'step') as string;
            const options = (row.options ?? row.OPTIONS) as string | undefined;
            const rowsRaw = row.rows ?? row.CARDINALITY ?? row.ROWS;
            const costRaw = row.cost ?? row.COST;
            const node: ExplainNode = {
                id,
                operation: options ? `${operation} ${options}` : operation,
                table: (row.object_name ?? row.OBJECT_NAME) as string | undefined,
                rows: rowsRaw != null ? Number(rowsRaw) : undefined,
                cost: costRaw != null ? Number(costRaw) : undefined,
                children: [],
            };
            nodeMap.set(id, node);
            nodes.push(node);
        }

        // If we have both id and parent_id, link children to parents.
        if (hasId && hasParentId) {
            const roots: ExplainNode[] = [];
            for (const row of rows) {
                const id = String(row.id ?? row.ID);
                const parentId = row.parent_id ?? row.PARENT_ID;
                const node = nodeMap.get(id);
                if (!node) {
                    continue;
                }
                if (parentId === null || parentId === undefined) {
                    roots.push(node);
                } else {
                    const parent = nodeMap.get(String(parentId));
                    if (parent) {
                        parent.children.push(node);
                    } else {
                        roots.push(node);
                    }
                }
            }
            return roots;
        }

        // If we have depth but no parent_id, reconstruct via depth.
        if (hasDepth) {
            const roots: ExplainNode[] = [];
            const stack: ExplainNode[] = [];
            for (const row of rows) {
                const id = String(row.id ?? row.ID);
                const node = nodeMap.get(id);
                if (!node) {
                    continue;
                }
                const depth = row.depth ?? row.DEPTH;
                const d = depth != null ? Number(depth) : 0;
                while (stack.length > d) {
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

        // Fall back to a flat list (all nodes are roots).
        return nodes;
    }
}
