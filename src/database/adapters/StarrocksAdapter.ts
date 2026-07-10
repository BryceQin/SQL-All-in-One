import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import type {
    DialectMetadata,
    IConnectionLifecycle,
    IMetadataAdapter,
    IQueryAdapter,
    ISchemaAdapter,
    TriggerInfo,
    QueryResult,
    QueryParam,
    ForeignKeyInfo,
    RoutineParameterInfo,
    DialectCapabilities,
    DataTypeCategory,
    ExplainResult,
    ExplainNode,
} from "./IDatabaseAdapter";
import { BaseDatabaseAdapter } from "./BaseDatabaseAdapter";
import { BaseSharedContext } from "./BaseSharedContext";
import { t } from "../../i18n/index";
import { getSystemDatabases } from "../../utils/systemDatabases";
import { MysqlConnectionAdapter, MysqlQueryAdapter, MysqlMetadataAdapter, MysqlSchemaAdapter } from "./MysqlAdapter";
import type { IMysqlProtocolSharedContext } from "./MysqlAdapter";

/**
 * StarRocks shared context.
 *
 * StarRocks is MySQL-protocol compatible, so we reuse the mysql2 driver
 * Pool/PoolConnection types. The structure mirrors MysqlSharedContext and
 * implements {@link IMysqlProtocolSharedContext} so the StarRocks query
 * adapter can reuse {@link MysqlQueryAdapter} via inheritance. Common
 * adapter-delegated state (config / connectionId / activity counters /
 * reap timer) is inherited from {@link BaseSharedContext}.
 */
class StarrocksSharedContext extends BaseSharedContext implements IMysqlProtocolSharedContext {
    // StarRocks (MySQL-protocol) shared state
    pool: Pool | null = null;
    transactionConnection: PoolConnection | null = null;
    activeQueryThreadIds = new Map<string, number>();
}

/**
 * StarRocks connection pool operations.
 *
 * StarRocks is MySQL-protocol compatible, so we reuse the mysql2 driver and
 * inherit the full connect/disconnect/testConnection/health/reap/error-
 * formatting lifecycle from {@link MysqlConnectionAdapter}. Only the
 * dialect-specific version query, default product name and log prefixes are
 * overridden here. Used internally by StarrocksAdapter; common lifecycle
 * logic lives in BaseDatabaseAdapter.
 */
class StarrocksConnectionAdapter extends MysqlConnectionAdapter<StarrocksSharedContext> {
    constructor(shared: StarrocksSharedContext) {
        super(shared);
    }

    /**
     * StarRocks supports `SELECT version() AS version` (MySQL-compatible).
     * The query text happens to be identical to MySQL's lowercased form, but
     * is overridden explicitly so the StarRocks version probe is documented
     * and decoupled from MySQL's canonical `SELECT VERSION() AS version`.
     */
    protected override getServerVersionSql(): string {
        return "SELECT version() AS version";
    }

    protected override defaultServerVersion(): string {
        return "StarRocks";
    }

    protected override warmupFailureLogPrefix(): string {
        return "StarRocks";
    }

    protected override rollbackFailureLogPrefix(): string {
        return "StarRocks";
    }

    protected override healthCheckFailureLogPrefix(): string {
        return "StarrocksConnectionAdapter";
    }
}

/**
 * StarRocks query adapter.
 *
 * StarRocks is MySQL-protocol compatible, so execute / executeBatch /
 * acquireConnectionWithTimeout are inherited unchanged from
 * {@link MysqlQueryAdapter}. Only the transaction lifecycle and the cancel
 * path differ:
 *
 *   - StarRocks uses `KILL <connectionId>` (without the `QUERY` keyword that
 *     MySQL uses).
 *   - The transaction connection's threadId is tracked under the
 *     `__transaction__` key so cancelQuery can target queries running inside
 *     an open transaction (otherwise the queryId was never registered and the
 *     cancel would silently no-op).
 */
class StarrocksQueryAdapter extends MysqlQueryAdapter<StarrocksSharedContext> {
    constructor(shared: StarrocksSharedContext) {
        super(shared);
    }

    override async beginTransaction(): Promise<void> {
        if (this.shared.transactionConnection) {
            throw new Error(t("database.transactionInProgress"));
        }
        if (!this.shared.pool) {
            throw new Error(t("database.notConnected"));
        }

        this.shared.transactionConnection = await this.shared.pool.getConnection();
        await this.shared.transactionConnection.beginTransaction();
        // Track the transaction connection's threadId so cancelQuery can target
        // queries running inside the transaction. Without this, cancelQuery for
        // a transaction-scoped query would silently no-op because the queryId
        // was never registered in activeQueryThreadIds.
        const txThreadId = (this.shared.transactionConnection as unknown as { threadId?: number }).threadId;
        if (txThreadId !== undefined) {
            this.shared.activeQueryThreadIds.set("__transaction__", txThreadId);
        }
    }

    override async commit(): Promise<void> {
        if (!this.shared.transactionConnection) {
            throw new Error(t("database.noTransactionInProgress"));
        }

        try {
            await this.shared.transactionConnection.commit();
        } finally {
            this.shared.activeQueryThreadIds.delete("__transaction__");
            this.shared.transactionConnection.release();
            this.shared.transactionConnection = null;
        }
    }

    override async rollback(): Promise<void> {
        if (!this.shared.transactionConnection) {
            throw new Error(t("database.noTransactionInProgress"));
        }

        try {
            await this.shared.transactionConnection.rollback();
            this.shared.transactionConnection.release();
        } catch (rollbackError) {
            this.shared.transactionConnection.destroy();
            console.error("Rollback failed, connection destroyed:", rollbackError);
        } finally {
            this.shared.activeQueryThreadIds.delete("__transaction__");
            this.shared.transactionConnection = null;
        }
    }

    override async cancelQuery(_queryId: string): Promise<void> {
        if (!this.shared.pool) {
            return;
        }

        // Look up the threadId for the given queryId. If not found and a
        // transaction is active, fall back to the transaction connection's
        // threadId so transaction-scoped queries can also be cancelled.
        let threadId = this.shared.activeQueryThreadIds.get(_queryId);
        if (threadId === undefined && this.shared.transactionConnection) {
            threadId = this.shared.activeQueryThreadIds.get("__transaction__");
        }
        if (threadId === undefined) {
            return;
        }

        try {
            const conn = await this.shared.pool.getConnection();
            try {
                // StarRocks supports MySQL-compatible KILL statement (without
                // the QUERY keyword that MySQL uses).
                await conn.query(`KILL ${threadId}`);
            } finally {
                conn.release();
            }
        } catch (e) {
            console.debug("[SQL All in One] StarRocks cancel query error:", e);
        }
    }
}

/**
 * StarRocks metadata adapter.
 *
 * StarRocks is MySQL-protocol compatible and exposes metadata through
 * information_schema with the same shape as MySQL, so listTables / listViews
 * / listSchemas / listDatabaseRows are inherited unchanged from
 * {@link MysqlMetadataAdapter}. Only the dialect-specific behaviour is
 * overridden here:
 *
 *   - {@link isSystemDatabase} filters StarRocks' own system databases
 *     (`_statistics_`, `starrocks_audit_db__`) instead of MySQL's.
 *   - StarRocks does not support user-defined functions, stored procedures
 *     or triggers, so {@link listFunctions} / {@link listProcedures} are
 *     inherited as no-ops from {@link BaseMetadataAdapter} and
 *     {@link listTriggers} is overridden to return an empty array (the base
 *     class declares it abstract because most dialects implement it).
 */
class StarrocksMetadataAdapter extends MysqlMetadataAdapter<StarrocksSharedContext> {
    protected override isSystemDatabase(name: string): boolean {
        return getSystemDatabases("starrocks").includes(name.toLowerCase());
    }

    override async listTriggers(_database?: string, _schema?: string): Promise<TriggerInfo[]> {
        // StarRocks does not support triggers.
        return [];
    }
}

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
class StarrocksSchemaAdapter extends MysqlSchemaAdapter<StarrocksSharedContext> {
    constructor(
        shared: StarrocksSharedContext,
        executeQuery: (sql: string, params?: QueryParam[]) => Promise<QueryResult>,
        listTriggersFn: (database?: string, schema?: string) => Promise<TriggerInfo[]>,
    ) {
        super(shared, executeQuery, listTriggersFn);
    }

    override async getTableDDL(database: string, table: string, _schema?: string): Promise<string> {
        this.validateIdentifier(database);
        this.validateIdentifier(table);
        const sql = `SHOW CREATE TABLE ${this.quoteIdentifier(database)}.${this.quoteIdentifier(table)}`;
        const result = await this.executeQuery(sql);
        if (result.status !== "success" || result.rows.length === 0) {
            return "";
        }

        // StarRocks returns "Create Table" column like MySQL, but for views
        // the same query may surface a "Create View" column instead.
        return (result.rows[0]["Create Table"] ?? result.rows[0]["Create View"] ?? "") as string;
    }

    override async getFunctionDDL(_database: string, _functionName: string, _schema?: string): Promise<string> {
        // StarRocks does not support user-defined functions.
        return "";
    }

    override async getProcedureDDL(_database: string, _procedureName: string, _schema?: string): Promise<string> {
        // StarRocks does not support stored procedures.
        return "";
    }

    override async getTriggerDDL(_database: string, _triggerName: string, _schema?: string): Promise<string> {
        // StarRocks does not support triggers.
        return "";
    }

    override async getRoutineParameters(
        _database: string,
        _routineName: string,
        _routineType: "FUNCTION" | "PROCEDURE",
        _schema?: string,
    ): Promise<RoutineParameterInfo[]> {
        // StarRocks does not support stored procedures or UDFs.
        return [];
    }

    override async getExplainPlan(database: string, sql: string): Promise<ExplainResult> {
        const useDb = database ?? this.shared.config?.database;
        if (!this.shared.pool) {
            return { format: "text", raw: "", nodes: [] };
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
                return { format: "text", raw: "", nodes: [] };
            }

            // StarRocks EXPLAIN returns rows with a single column containing
            // multi-line text. Concatenate all rows into a single raw string.
            const raw = result
                .map((row: RowDataPacket) => {
                    const value = row[0] as unknown;
                    return typeof value === "string" ? value : String(value ?? "");
                })
                .join("\n");

            const nodes = this.parseExplainText(raw);

            return { format: "text", raw, nodes };
        } catch (e) {
            console.debug("[SQL All in One] StarRocks EXPLAIN plan error:", e);
            return { format: "text", raw: "", nodes: [] };
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
            supportedObjectTypes: ["table", "view", "index"],
        };
    }

    override getSupportedDataTypes(): DataTypeCategory[] {
        return [
            {
                category: "Integer",
                types: [
                    { name: "TINYINT", needsLength: true },
                    { name: "SMALLINT", needsLength: true },
                    { name: "INT", needsLength: true },
                    { name: "INTEGER", needsLength: true },
                    { name: "BIGINT", needsLength: true },
                    { name: "LARGEINT" },
                ],
            },
            {
                category: "Float",
                types: [
                    { name: "FLOAT", needsPrecision: true },
                    { name: "DOUBLE", needsPrecision: true },
                    { name: "DECIMAL", needsPrecision: true, needsScale: true },
                    { name: "DECIMALV2", needsPrecision: true, needsScale: true },
                    { name: "DECIMALV3", needsPrecision: true, needsScale: true },
                ],
            },
            {
                category: "String",
                types: [{ name: "CHAR", needsLength: true }, { name: "VARCHAR", needsLength: true }, { name: "STRING" }],
            },
            {
                category: "Date & Time",
                types: [{ name: "DATE" }, { name: "DATETIME" }, { name: "TIMESTAMP" }],
            },
            {
                category: "Other",
                types: [
                    { name: "BOOLEAN" },
                    { name: "JSON" },
                    { name: "BITMAP" },
                    { name: "HLL" },
                    { name: "PERCENTILE" },
                    { name: "ARRAY" },
                    { name: "MAP" },
                    { name: "STRUCT" },
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
        const lines = text.split("\n");
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

/**
 * StarRocks database adapter.
 *
 * StarRocks is MySQL-protocol compatible, so this adapter reuses the mysql2
 * driver. Metadata and schema queries are adapted to StarRocks-specific
 * behavior (no procedures/triggers/foreign keys, EXPLAIN returns text).
 */
export class StarrocksAdapter extends BaseDatabaseAdapter<StarrocksSharedContext> {
    protected override createSharedContext(): StarrocksSharedContext {
        return new StarrocksSharedContext(this);
    }
    protected override createConnectionAdapter(): IConnectionLifecycle {
        return new StarrocksConnectionAdapter(this.shared);
    }
    protected override createQueryAdapter(): IQueryAdapter {
        return new StarrocksQueryAdapter(this.shared);
    }
    protected override createMetadataAdapter(): IMetadataAdapter {
        return new StarrocksMetadataAdapter(this.shared, (sql, params) => this.queryAdapter.execute(sql, params));
    }
    protected override createSchemaAdapter(): ISchemaAdapter {
        return new StarrocksSchemaAdapter(
            this.shared,
            (sql, params) => this.queryAdapter.execute(sql, params),
            (db, schema) => this.metadataAdapter.listTriggers(db, schema),
        );
    }

    protected override getReapLogPrefix(): string {
        return "StarRocks";
    }

    static getDialectMetadata(): DialectMetadata {
        return {
            dialect: "starrocks",
            displayName: "StarRocks",
            defaultPort: 9030,
            defaultUsername: "root",
            iconKey: "starrocks",
            supportsSshTunnel: true,
            supportsSsl: true,
            isFileBased: false,
        };
    }
}
