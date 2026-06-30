import type { QueryResult, QueryParam, TriggerInfo, ForeignKeyInfo, RoutineParameterInfo, DialectCapabilities, DataTypeCategory, ExplainResult, ExplainNode } from './IDatabaseAdapter';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { StarrocksSharedContext } from './StarrocksSharedContext';
import { MysqlSchemaAdapter } from './MysqlSchemaAdapter';

/**
 * StarRocks schema adapter.
 *
 * StarRocks is MySQL-protocol compatible, so SHOW CREATE TABLE, DESC and
 * INFORMATION_SCHEMA queries are inherited unchanged from
 * {@link MysqlSchemaAdapter}. Only the dialect-specific behaviour is
 * overridden here:
 *
 *   - Foreign keys are not supported; {@link describeTableForeignKeys}
 *     returns `[]`.
 *   - Functions, procedures, triggers and routine parameters are not
 *     supported; their DDL getters return empty.
 *   - EXPLAIN returns plain text (not JSON); {@link getExplainPlan}
 *     parses the text output via {@link parseExplainText}.
 *   - `getTableDDL` also falls back to the `Create View` column so views
 *     show their DDL when invoked through the table path.
 *   - {@link getDialectCapabilities} and {@link getSupportedDataTypes}
 *     reflect StarRocks' reduced object-type support and its extra types
 *     (LARGEINT, DECIMALV2/V3, STRING, BITMAP, HLL, PERCENTILE, ARRAY,
 *     MAP, STRUCT).
 */
export class StarrocksSchemaAdapter extends MysqlSchemaAdapter<StarrocksSharedContext> {
    constructor(
        shared: StarrocksSharedContext,
        executeQuery: (sql: string, params?: QueryParam[]) => Promise<QueryResult>,
        listTriggersFn: (database?: string, schema?: string) => Promise<TriggerInfo[]>
    ) {
        super(shared, executeQuery, listTriggersFn);
    }

    override async getTableDDL(database: string, table: string, _schema?: string): Promise<string> {
        this.validateIdentifier(database);
        this.validateIdentifier(table);
        const sql = `SHOW CREATE TABLE ${this.quoteIdentifier(database)}.${this.quoteIdentifier(table)}`;
        const result = await this.executeQuery(sql);
        if (result.status !== 'success' || result.rows.length === 0) {
            return '';
        }

        // StarRocks returns "Create Table" column like MySQL, but for views
        // the same query may surface a "Create View" column instead.
        return (result.rows[0]['Create Table'] ?? result.rows[0]['Create View'] ?? '') as string;
    }

    override async getFunctionDDL(_database: string, _functionName: string, _schema?: string): Promise<string> {
        // StarRocks does not support user-defined functions.
        return '';
    }

    override async getProcedureDDL(_database: string, _procedureName: string, _schema?: string): Promise<string> {
        // StarRocks does not support stored procedures.
        return '';
    }

    override async getTriggerDDL(_database: string, _triggerName: string, _schema?: string): Promise<string> {
        // StarRocks does not support triggers.
        return '';
    }

    override async getRoutineParameters(_database: string, _routineName: string, _routineType: 'FUNCTION' | 'PROCEDURE', _schema?: string): Promise<RoutineParameterInfo[]> {
        // StarRocks does not support stored procedures or UDFs.
        return [];
    }

    override async getExplainPlan(database: string, sql: string): Promise<ExplainResult> {
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

    override getDialectCapabilities(): DialectCapabilities {
        return {
            supportsSchema: false,
            supportsMultipleDatabases: true,
            maxConcurrentQueries: 5,
            supportsPreparedStatement: true,
            supportsExplain: true,
            supportsExplainAnalyze: false,
            supportsCancel: true,
            supportsSshTunnel: true,
            // StarRocks does not support procedures/triggers/foreign keys
            supportedObjectTypes: ['table', 'view', 'index'],
        };
    }

    override getSupportedDataTypes(): DataTypeCategory[] {
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

    /**
     * StarRocks does not support foreign keys, so override the MySQL base
     * implementation to return an empty list. This is consulted by the
     * inherited {@link describeTable} flow.
     */
    protected override async describeTableForeignKeys(_database: string, _table: string): Promise<ForeignKeyInfo[]> {
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

            // NOTE: indentation level (line.length - line.trimStart().length)
            // could be used as a hint for parent-child hierarchy, but the tree
            // is not fully reconstructed here; consumers can use the raw text
            // for full fidelity.
            nodes.push(node);
        }

        return nodes;
    }
}
