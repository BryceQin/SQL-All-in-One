import type { Pool, PoolClient, PoolConfig, QueryResult as PgQueryResult } from "pg";
import type {
    ColumnInfo,
    ColumnMeta,
    ConnectionConfig,
    DataTypeCategory,
    DatabaseInfo,
    DialectCapabilities,
    DialectMetadata,
    ExplainNode,
    ExplainResult,
    ForeignKeyInfo,
    FunctionInfo,
    IConnectionLifecycle,
    IMetadataAdapter,
    IQueryAdapter,
    ISchemaAdapter,
    IndexInfo,
    ProcedureInfo,
    QueryParam,
    QueryResult,
    QueryRow,
    QueryStreamOptions,
    RoutineParameterInfo,
    StreamBatch,
    TableInfo,
    TableStructure,
    TestConnectionResult,
    TriggerInfo,
    ViewInfo,
} from "./IDatabaseAdapter";
import { t } from "../../i18n/index";
import { generateShortId } from "../../utils/idGenerator";
import { BaseDatabaseAdapter } from "./BaseDatabaseAdapter";
import { BaseSharedContext } from "./BaseSharedContext";
import { BaseConnectionAdapter } from "./BaseConnectionAdapter";
import { BaseQueryAdapter } from "./BaseQueryAdapter";
import { BaseMetadataAdapter } from "./BaseMetadataAdapter";
import { BaseSchemaAdapter } from "./BaseSchemaAdapter";
import { getSystemDatabases } from "../../utils/systemDatabases";
import { clampBatchSize } from "./queryStreamUtils";

/**
 * PostgreSQL shared context.
 *
 * Holds the pg Pool, the transaction-scoped PoolClient and the active-query
 * pid map used by the query/schema/connection sub-adapters. Common
 * adapter-delegated state (config / connectionId / activity counters /
 * reap timer) is inherited from {@link BaseSharedContext}.
 */
class PostgresSharedContext extends BaseSharedContext {
    pool: Pool | null = null;
    transactionClient: PoolClient | null = null;
    activeQueryPids = new Map<string, number>();
}

class PostgresConnectionAdapter extends BaseConnectionAdapter<PostgresSharedContext> {
    constructor(protected shared: PostgresSharedContext) {
        super();
    }

    async connect(config: ConnectionConfig): Promise<void> {
        const poolConfig = this.createPoolConfig(config);

        try {
            const { Pool } = await import("pg");
            this.shared.pool = new Pool(poolConfig);

            const client = await this.shared.pool.connect();
            try {
                await client.query("SELECT 1");
            } finally {
                client.release();
            }

            this.shared.totalConnectionCount = config.poolConfig?.minConnections ?? 1;
            this.shared.activeConnectionCount = 0;
            this.shared.lastActivityTime = Date.now();
        } catch (error: unknown) {
            this.shared.pool = null;
            throw this.formatConnectionError(error, config);
        }
    }

    async disconnect(): Promise<void> {
        if (this.shared.transactionClient) {
            try {
                await this.shared.transactionClient.query("ROLLBACK");
            } catch (e) {
                console.debug("[SQL All in One] PG rollback error on disconnect:", e);
            }
            this.shared.transactionClient.release();
            this.shared.transactionClient = null;
        }

        if (this.shared.pool) {
            await this.shared.pool.end();
            this.shared.pool = null;
        }
    }

    async testConnection(config: ConnectionConfig): Promise<TestConnectionResult> {
        const startTime = Date.now();
        let tempPool: import("pg").Pool | null = null;

        try {
            const { Pool } = await import("pg");
            tempPool = new Pool(this.createPoolConfig(config));
            const client = await tempPool.connect();
            try {
                const result = await client.query("SELECT version() AS version");
                const endTime = Date.now();
                return {
                    success: true,
                    serverVersion: ((result.rows[0] as Record<string, unknown>)?.version as string) ?? "PostgreSQL",
                    latency: endTime - startTime,
                };
            } finally {
                client.release();
            }
        } catch (error: unknown) {
            const formatted = this.formatConnectionError(error, config);
            return {
                success: false,
                error: formatted.message,
            };
        } finally {
            if (tempPool) {
                await tempPool.end();
            }
        }
    }

    async checkConnectionHealth(): Promise<boolean> {
        if (!this.shared.pool) {
            return false;
        }

        try {
            const client = await this.shared.pool.connect();
            try {
                await client.query("SELECT 1");
                return true;
            } finally {
                client.release();
            }
        } catch (e) {
            console.debug("[SQL All in One] PostgresConnectionAdapter.checkConnectionHealth failed:", e);
            return false;
        }
    }

    protected override formatDriverSpecificError(error: unknown, config: ConnectionConfig): Error | undefined {
        const msg = error instanceof Error ? error.message : String(error);
        const hostPort = `${config.host}:${config.port}`;

        if (msg.includes("password authentication failed") || msg.includes("28P01")) {
            return new Error(t("database.accessDenied", config.username, hostPort));
        }
        if (msg.includes("database") && msg.includes("does not exist")) {
            return new Error(t("database.databaseNotExist", config.database || "(none)", hostPort));
        }

        // SSL/certificate and common network errors are handled by the base
        // class (BaseConnectionAdapter).
        return undefined;
    }

    private createPoolConfig(config: ConnectionConfig): PoolConfig {
        const poolConfig: PoolConfig = {
            host: config.host,
            port: config.port,
            user: config.username,
            password: config.password,
            database: config.database,
            max: config.poolConfig?.maxConnections ?? 5,
            min: config.poolConfig?.minConnections ?? 1,
            connectionTimeoutMillis: config.connectTimeout ?? 10000,
            idleTimeoutMillis: config.poolConfig?.idleTimeout ?? 30000,
        };

        if (config.ssl?.enabled) {
            poolConfig.ssl = {
                rejectUnauthorized: config.ssl.rejectUnauthorized ?? true,
                ca: config.ssl.ca,
                cert: config.ssl.cert,
                key: config.ssl.key,
            };
        }

        return poolConfig;
    }
}

class PostgresQueryAdapter extends BaseQueryAdapter<PostgresSharedContext> {
    protected override async executeWithConnection(
        sql: string,
        params: QueryParam[] | undefined,
        queryId: string,
        startTime: number,
    ): Promise<QueryResult> {
        const values = params?.map((p) => p.value);
        let queryConn: PoolClient | typeof this.shared.pool = this.shared.transactionClient ?? this.shared.pool!;
        let acquiredClient: PoolClient | null = null;

        if (!this.shared.transactionClient && this.shared.pool) {
            acquiredClient = await this.shared.pool.connect();
            this.shared.activeConnectionCount++;
            queryConn = acquiredClient;
            // pg's PoolClient carries the backend PID in `processID`
            // (received via the BackendKeyData startup message), so we can
            // avoid an extra round-trip `SELECT pg_backend_pid()` query on
            // every execute. Fall back to the query only when the driver
            // did not expose a processID (e.g. older pg builds / pooled
            // connections where the field is missing).
            const clientPid = (acquiredClient as { processID?: number }).processID;
            const pid =
                typeof clientPid === "number" && clientPid > 0
                    ? clientPid
                    : (((await acquiredClient.query("SELECT pg_backend_pid() AS pid")).rows[0] as Record<string, unknown>)?.pid as number);
            this.shared.activeQueryPids.set(queryId, pid);
        }

        try {
            const pgResult: PgQueryResult = await queryConn.query(sql, values);
            const executionTime = Date.now() - startTime;

            const columns = pgResult.fields.map((field) => ({
                name: field.name,
                type: String(field.dataTypeID ?? "UNKNOWN"),
                nullable: true,
                isPrimaryKey: false,
                isAutoIncrement: false,
                isEnum: false,
            }));

            return {
                queryId,
                status: "success",
                columns,
                rows: pgResult.rows as QueryRow[],
                rowCount: pgResult.rowCount ?? pgResult.rows.length,
                affectedRows: pgResult.rowCount ?? undefined,
                executionTime,
                database: this.shared.config?.database,
            };
        } finally {
            if (acquiredClient) {
                this.shared.activeConnectionCount--;
                acquiredClient.release();
            }
            this.shared.activeQueryPids.delete(queryId);
        }
    }

    /**
     * Postgres-specific error mapping: extracts `error.code` from the pg
     * error shape (e.g. `23505` for unique violation).
     */
    protected override mapError(error: unknown, sql: string, queryId: string, executionTime: number): QueryResult {
        const pgError = error as { code?: string; message?: string };
        return {
            queryId,
            status: "error",
            columns: [],
            rows: [],
            rowCount: 0,
            executionTime,
            error: {
                code: pgError.code ?? "EXEC_ERROR",
                message: error instanceof Error ? error.message : String(error),
                sql,
            },
            database: this.shared.config?.database,
        };
    }

    /**
     * Streaming SELECT execution for PostgreSQL.
     *
     * The bundled `pg` driver does not ship a cursor helper (no `pg-cursor`
     * dependency), so we drive a server-side cursor with plain SQL: `BEGIN`
     * (only when no user transaction is active) → `DECLARE` a uniquely-named
     * portal → repeated `FETCH N` → `CLOSE` → `COMMIT`/`ROLLBACK`. Each
     * `FETCH N` returns at most `batchSize` rows, which we yield directly.
     *
     * Memory win: only one batch is ever held in the adapter at a time; the
     * caller decides how much to retain.
     *
     * Cancellation: if the caller aborts the {@link AbortSignal} we stop
     * fetching, close the cursor and rollback the temporary transaction (or
     * just close the cursor when borrowing the user's transaction client).
     */
    async *executeStream(sql: string, options?: QueryStreamOptions): AsyncIterable<StreamBatch> {
        if (!this.shared.pool) {
            throw new Error(t("database.notConnected"));
        }

        const batchSize = clampBatchSize(options?.batchSize);
        const maxRows = options?.maxRows;
        const values = options?.params?.map((p) => p.value);
        const signal = options?.signal;

        // Reuse the user's transaction client if present; otherwise acquire a
        // fresh client and wrap the cursor in an internal transaction.
        const useTransactionClient = !!this.shared.transactionClient;
        const client: PoolClient = useTransactionClient ? this.shared.transactionClient! : await this.shared.pool.connect();
        if (!useTransactionClient) {
            this.shared.activeConnectionCount++;
        }

        const cursorName = `sai_stream_${generateShortId("cur").replace(/-/g, "_")}`;
        let beganInternalTransaction = false;
        let columns: ColumnMeta[] = [];
        let batchIndex = 0;
        let totalRowsReceived = 0;
        let truncated = false;
        let abortedError: Error | null = null;

        const onAbort = (): void => {
            abortedError = new Error("Query stream aborted");
        };
        if (signal) {
            if (signal.aborted) {
                onAbort();
            } else {
                signal.addEventListener("abort", onAbort, { once: true });
            }
        }

        try {
            if (!useTransactionClient) {
                await client.query("BEGIN");
                beganInternalTransaction = true;
            }

            // Declare the cursor. We pass `values` here so parameter binding
            // happens server-side, exactly like a normal parameterized query.
            await client.query(`DECLARE ${cursorName} CURSOR FOR ${sql}`, values);

            // Fetch the first batch to discover column metadata.
            const firstFetch = await client.query(`FETCH FORWARD ${batchSize} FROM ${cursorName}`);
            columns = mapPgFields(firstFetch.fields);

            let firstRows = firstFetch.rows as QueryRow[];
            if (firstRows.length > 0) {
                totalRowsReceived += firstRows.length;
                const truncatedThisBatch = maxRows !== undefined && totalRowsReceived >= maxRows;
                if (maxRows !== undefined && firstRows.length > maxRows) {
                    firstRows = firstRows.slice(0, maxRows);
                    totalRowsReceived = maxRows;
                }
                yield {
                    columns,
                    rows: firstRows,
                    batchIndex,
                    totalRowsReceived,
                    truncated: truncatedThisBatch,
                };
                batchIndex++;
                if (truncatedThisBatch) {
                    truncated = true;
                }
            } else {
                // No rows yet — still emit a single empty batch so the
                // collector can record column metadata.
                yield {
                    columns,
                    rows: [],
                    batchIndex: 0,
                    totalRowsReceived: 0,
                    truncated: false,
                };
                batchIndex++;
            }

            while (!truncated && !abortedError) {
                if (signal?.aborted) {
                    abortedError = new Error("Query stream aborted");
                    break;
                }
                const fetch = await client.query(`FETCH FORWARD ${batchSize} FROM ${cursorName}`);
                const rows = fetch.rows as QueryRow[];
                if (rows.length === 0) {
                    break;
                }
                totalRowsReceived += rows.length;
                let emittedRows = rows;
                let truncatedThisBatch = false;
                if (maxRows !== undefined && totalRowsReceived >= maxRows) {
                    if (totalRowsReceived > maxRows) {
                        emittedRows = rows.slice(0, rows.length - (totalRowsReceived - maxRows));
                        totalRowsReceived = maxRows;
                    }
                    truncatedThisBatch = true;
                }
                yield {
                    columns: [],
                    rows: emittedRows,
                    batchIndex,
                    totalRowsReceived,
                    truncated: truncatedThisBatch,
                };
                batchIndex++;
                if (truncatedThisBatch) {
                    truncated = true;
                    break;
                }
            }

            // If the caller aborted the stream, surface that as a stream
            // error so the collector converts it into a STREAM_ERROR result.
            // This is intentionally outside the finally block so we do not
            // swallow any error thrown while fetching.
            if (abortedError) {
                throw abortedError;
            }
        } finally {
            // Always close the cursor. Best-effort: a failure here should not
            // mask the original stream error.
            try {
                await client.query(`CLOSE ${cursorName}`);
            } catch {
                /* ignore: cursor cleanup is best-effort */
            }

            if (beganInternalTransaction) {
                try {
                    if (abortedError) {
                        await client.query("ROLLBACK");
                    } else {
                        await client.query("COMMIT");
                    }
                } catch {
                    /* ignore: tx cleanup is best-effort */
                }
            }

            if (signal) {
                signal.removeEventListener("abort", onAbort);
            }

            if (!useTransactionClient) {
                this.shared.activeConnectionCount--;
                client.release();
            }
        }
    }

    async beginTransaction(): Promise<void> {
        if (this.shared.transactionClient) {
            throw new Error(t("database.transactionInProgress"));
        }
        if (!this.shared.pool) {
            throw new Error(t("database.notConnected"));
        }

        this.shared.transactionClient = await this.shared.pool.connect();
        await this.shared.transactionClient.query("BEGIN");
    }

    async commit(): Promise<void> {
        if (!this.shared.transactionClient) {
            throw new Error(t("database.noTransactionInProgress"));
        }

        try {
            await this.shared.transactionClient.query("COMMIT");
        } finally {
            this.shared.transactionClient.release();
            this.shared.transactionClient = null;
        }
    }

    async rollback(): Promise<void> {
        if (!this.shared.transactionClient) {
            throw new Error(t("database.noTransactionInProgress"));
        }

        try {
            await this.shared.transactionClient.query("ROLLBACK");
            this.shared.transactionClient.release();
        } catch (rollbackError) {
            console.error("PG rollback failed:", rollbackError);
        } finally {
            this.shared.transactionClient = null;
        }
    }

    async cancelQuery(queryId: string): Promise<void> {
        if (!this.shared.pool) {
            return;
        }

        const pid = this.shared.activeQueryPids.get(queryId);
        if (!pid) {
            return;
        }

        try {
            const client = await this.shared.pool.connect();
            try {
                await client.query(`SELECT pg_cancel_backend(${pid})`);
            } finally {
                client.release();
            }
        } catch (e) {
            console.debug("[SQL All in One] PG cancel query error:", e);
        }
    }
}

/**
 * Convert pg column field metadata to the shared {@link ColumnMeta} shape.
 * pg does not expose primary-key / auto-increment flags on result fields, so
 * those default to false (matching the existing {@link PostgresQueryAdapter.execute} behavior).
 */
function mapPgFields(fields: PgQueryResult["fields"]): ColumnMeta[] {
    return fields.map((field) => ({
        name: field.name,
        type: String(field.dataTypeID ?? "UNKNOWN"),
        nullable: true,
        isPrimaryKey: false,
        isAutoIncrement: false,
        isEnum: false,
    }));
}

class PostgresMetadataAdapter extends BaseMetadataAdapter<PostgresSharedContext> {
    override async listDatabaseRows(): Promise<DatabaseInfo[]> {
        const sql = `SELECT datname, pg_encoding_to_char(encoding) AS encoding FROM pg_database WHERE datistemplate = false ORDER BY datname`;
        return this.runListQuery<DatabaseInfo>(sql, undefined, (row: QueryRow) => ({
            name: row.datname as string,
            charset: row.encoding as string,
        }));
    }

    async listSchemas(_database?: string): Promise<string[]> {
        const sql = `SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT LIKE 'pg_%' AND schema_name NOT IN ('information_schema', 'public') ORDER BY schema_name`;
        const result = await this.executeQuery(sql);
        if (result.status !== "success") {
            return ["public"];
        }

        const schemas = result.rows.map((row: QueryRow) => row.schema_name as string);
        if (!schemas.includes("public")) {
            schemas.unshift("public");
        }
        return schemas;
    }

    async listTables(_database?: string, schema?: string, filter?: string): Promise<TableInfo[]> {
        const targetSchema = schema ?? "public";
        let sql = `SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE'`;
        const params: QueryParam[] = [{ value: targetSchema }];

        if (filter) {
            sql += ` AND table_name LIKE $2`;
            params.push({ value: `%${filter}%` });
        }

        sql += ` ORDER BY table_name`;

        return this.runListQuery<TableInfo>(sql, params, (row: QueryRow) => ({
            name: row.table_name as string,
            type: row.table_type as string,
        }));
    }

    async listViews(_database?: string, schema?: string): Promise<ViewInfo[]> {
        const targetSchema = schema ?? "public";
        const sql = `SELECT table_name FROM information_schema.views WHERE table_schema = $1 ORDER BY table_name`;
        return this.runListQuery<ViewInfo>(sql, [{ value: targetSchema }], (row: QueryRow) => ({
            name: row.table_name as string,
        }));
    }

    override async listFunctions(_database?: string, schema?: string): Promise<FunctionInfo[]> {
        const targetSchema = schema ?? "public";
        const sql = `SELECT routine_name, data_type, routine_definition FROM information_schema.routines WHERE routine_schema = $1 AND routine_type = 'FUNCTION' ORDER BY routine_name`;
        return this.runListQuery<FunctionInfo>(sql, [{ value: targetSchema }], (row: QueryRow) => ({
            name: row.routine_name as string,
            returns: row.data_type as string,
            definition: row.routine_definition as string,
        }));
    }

    override async listProcedures(_database?: string, schema?: string): Promise<ProcedureInfo[]> {
        const targetSchema = schema ?? "public";
        const sql = `SELECT routine_name, routine_definition FROM information_schema.routines WHERE routine_schema = $1 AND routine_type = 'PROCEDURE' ORDER BY routine_name`;
        return this.runListQuery<ProcedureInfo>(sql, [{ value: targetSchema }], (row: QueryRow) => ({
            name: row.routine_name as string,
            definition: row.routine_definition as string,
        }));
    }

    async listTriggers(_database?: string, schema?: string): Promise<TriggerInfo[]> {
        const targetSchema = schema ?? "public";
        const sql = `SELECT trigger_name, event_manipulation, action_timing, action_statement FROM information_schema.triggers WHERE trigger_schema = $1 ORDER BY trigger_name`;
        return this.runListQuery<TriggerInfo>(sql, [{ value: targetSchema }], (row: QueryRow) => ({
            name: row.trigger_name as string,
            event: row.event_manipulation as string,
            timing: row.action_timing as string,
            statement: row.action_statement as string,
        }));
    }

    protected override isSystemDatabase(name: string): boolean {
        return getSystemDatabases("postgresql").includes(name.toLowerCase());
    }
}

class PostgresSchemaAdapter extends BaseSchemaAdapter<PostgresSharedContext> {
    protected readonly quoteChar = '"' as const;

    /**
     * Postgres historically did not validate identifiers before quoting;
     * preserve that behaviour by no-op'ing the base class's default
     * validation rather than introducing a regression.
     */
    protected override validateIdentifier(_identifier: string): void {
        // Intentional no-op — see method docstring.
    }

    async describeTable(database: string, table: string, schema?: string): Promise<TableStructure> {
        const targetSchema = schema ?? "public";
        const [columns, indexes, foreignKeys, triggers] = await Promise.all([
            this.describeTableColumns(database, table, targetSchema),
            this.describeTableIndexes(database, table, targetSchema),
            this.describeTableForeignKeys(database, table, targetSchema),
            this.listTriggersFn(database, targetSchema),
        ]);

        return { columns, indexes, foreignKeys, triggers };
    }

    async getTableDDL(database: string, table: string, schema?: string): Promise<string> {
        const targetSchema = schema ?? "public";
        const columns = await this.describeTableColumns(database, table, targetSchema);
        const indexes = await this.describeTableIndexes(database, table, targetSchema);
        const fks = await this.describeTableForeignKeys(database, table, targetSchema);

        const columnDefs = columns
            .map((c) => {
                let def = `    ${this.quoteIdentifier(c.name)} ${c.type}`;
                if (!c.nullable) def += " NOT NULL";
                if (c.isAutoIncrement) def += " GENERATED ALWAYS AS IDENTITY";
                if (c.defaultValue !== null && c.defaultValue !== undefined) def += ` DEFAULT ${c.defaultValue}`;
                return def;
            })
            .join(",\n");

        const indexDefs = indexes
            .filter((i) => !i.isPrimary)
            .map(
                (i) =>
                    `CREATE INDEX ${this.quoteIdentifier(i.name)} ON ${this.quoteIdentifier(targetSchema)}.${this.quoteIdentifier(table)} (${i.columns.map((c) => this.quoteIdentifier(c)).join(", ")});`,
            )
            .join("\n");

        const fkDefs = fks
            .map(
                (fk) =>
                    `ALTER TABLE ${this.quoteIdentifier(targetSchema)}.${this.quoteIdentifier(table)} ADD CONSTRAINT ${this.quoteIdentifier(fk.name)} FOREIGN KEY (${fk.columns.map((c) => this.quoteIdentifier(c)).join(", ")}) REFERENCES ${this.quoteIdentifier(targetSchema)}.${this.quoteIdentifier(fk.referencedTable)} (${fk.referencedColumns.map((c) => this.quoteIdentifier(c)).join(", ")});`,
            )
            .join("\n");

        let ddl = `CREATE TABLE ${this.quoteIdentifier(targetSchema)}.${this.quoteIdentifier(table)} (\n${columnDefs}\n);`;
        if (indexDefs) ddl += "\n" + indexDefs;
        if (fkDefs) ddl += "\n" + fkDefs;
        return ddl;
    }

    async getViewDDL(_database: string, view: string, schema?: string): Promise<string> {
        const targetSchema = schema ?? "public";
        const sql = `SELECT pg_get_viewdef($1::regclass, true) AS definition`;
        const result = await this.executeQuery(sql, [{ value: `${targetSchema}.${view}` }]);
        if (result.status !== "success" || result.rows.length === 0) {
            return "";
        }
        return (result.rows[0].definition as string) ?? "";
    }

    async getFunctionDDL(_database: string, functionName: string, schema?: string): Promise<string> {
        const targetSchema = schema ?? "public";
        const sql = `SELECT pg_get_functiondef($1::regprocedure) AS definition`;
        const result = await this.executeQuery(sql, [{ value: `${targetSchema}.${functionName}` }]);
        if (result.status !== "success" || result.rows.length === 0) {
            return "";
        }
        return (result.rows[0].definition as string) ?? "";
    }

    async getProcedureDDL(database: string, procedureName: string, schema?: string): Promise<string> {
        return this.getFunctionDDL(database, procedureName, schema);
    }

    async getTriggerDDL(_database: string, triggerName: string, _schema?: string): Promise<string> {
        const sql = `SELECT pg_get_triggerdef(oid) AS definition FROM pg_trigger WHERE tgname = $1 AND NOT tgisinternal`;
        const result = await this.executeQuery(sql, [{ value: triggerName }]);
        if (result.status !== "success" || result.rows.length === 0) {
            return "";
        }
        return (result.rows[0].definition as string) ?? "";
    }

    async getRoutineParameters(
        _database: string,
        routineName: string,
        _routineType: "FUNCTION" | "PROCEDURE",
        schema?: string,
    ): Promise<RoutineParameterInfo[]> {
        const targetSchema = schema ?? "public";
        const sql = `SELECT p.parameter_name, p.data_type, p.parameter_mode FROM information_schema.parameters p JOIN information_schema.routines r ON p.specific_schema = r.routine_schema AND p.specific_name = r.routine_name WHERE r.routine_schema = $1 AND r.routine_name = $2 AND p.parameter_name IS NOT NULL ORDER BY p.ordinal_position`;
        const result = await this.executeQuery(sql, [{ value: targetSchema }, { value: routineName }]);
        if (result.status !== "success") {
            return [];
        }

        return result.rows.map((row: QueryRow) => ({
            name: row.parameter_name as string,
            type: row.data_type as string,
            direction: (row.parameter_mode as "IN" | "OUT" | "INOUT") || "IN",
        }));
    }

    async getExplainPlan(_database: string, sql: string): Promise<ExplainResult> {
        if (!this.shared.pool) {
            return { format: "json", raw: "{}", nodes: [] };
        }

        let client: import("pg").PoolClient | null = null;
        try {
            client = await this.shared.pool.connect();
            const explainSql = `EXPLAIN (FORMAT JSON, ANALYZE) ${sql}`;
            const result = await client.query(explainSql);
            if (!result.rows || result.rows.length === 0) {
                return { format: "json", raw: "{}", nodes: [] };
            }

            const raw = JSON.stringify(result.rows[0]);
            const parsed = result.rows[0] as Record<string, unknown>;
            const planData = (parsed["QUERY PLAN"] ?? parsed) as Record<string, unknown>;
            const nodes = this.parseExplainNodes(planData);

            return { format: "json", raw, nodes };
        } catch (e) {
            console.debug("[SQL All in One] PG EXPLAIN error:", e);
            return { format: "json", raw: "{}", nodes: [] };
        } finally {
            client?.release();
        }
    }

    async getTableRowCount(_database: string, table: string, schema?: string): Promise<number> {
        const targetSchema = schema ?? "public";
        const sql = `SELECT reltuples::bigint AS row_count FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = $1 AND c.relname = $2`;
        const result = await this.executeQuery(sql, [{ value: targetSchema }, { value: table }]);
        if (result.status !== "success" || result.rows.length === 0) {
            return 0;
        }
        const rowCount = result.rows[0].row_count;
        return rowCount != null ? Number(rowCount) : 0;
    }

    override getDialectCapabilities(): DialectCapabilities {
        return {
            supportsSchema: true,
            supportsMultipleDatabases: true,
            maxConcurrentQueries: 5,
            supportsPreparedStatement: true,
            supportsExplain: true,
            supportsExplainAnalyze: true,
            supportsCancel: true,
            supportsSshTunnel: true,
            supportedObjectTypes: ["table", "view", "function", "procedure", "trigger", "index"],
        };
    }

    getSupportedDataTypes(): DataTypeCategory[] {
        return [
            {
                category: "Integer",
                types: [
                    { name: "smallint" },
                    { name: "integer" },
                    { name: "int" },
                    { name: "bigint" },
                    { name: "serial" },
                    { name: "bigserial" },
                ],
            },
            {
                category: "Float",
                types: [
                    { name: "decimal", needsPrecision: true, needsScale: true },
                    { name: "numeric", needsPrecision: true, needsScale: true },
                    { name: "real" },
                    { name: "double precision" },
                ],
            },
            {
                category: "String",
                types: [
                    { name: "character varying", needsLength: true },
                    { name: "varchar", needsLength: true },
                    { name: "character", needsLength: true },
                    { name: "char", needsLength: true },
                    { name: "text" },
                ],
            },
            {
                category: "Date & Time",
                types: [
                    { name: "timestamp" },
                    { name: "timestamp without time zone" },
                    { name: "timestamp with time zone" },
                    { name: "date" },
                    { name: "time" },
                    { name: "interval" },
                ],
            },
            {
                category: "Boolean",
                types: [{ name: "boolean" }],
            },
            {
                category: "Binary",
                types: [{ name: "bytea" }],
            },
            {
                category: "Other",
                types: [
                    { name: "uuid" },
                    { name: "json" },
                    { name: "jsonb" },
                    { name: "xml" },
                    { name: "money" },
                    { name: "bit", needsLength: true },
                ],
            },
        ];
    }

    private async describeTableColumns(_database: string, table: string, schema: string): Promise<ColumnInfo[]> {
        const sql = `SELECT column_name, data_type, character_maximum_length, numeric_precision, numeric_scale, is_nullable, column_default, ordinal_position FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`;
        const result = await this.executeQuery(sql, [{ value: schema }, { value: table }]);
        if (result.status !== "success") {
            return [];
        }

        return result.rows.map((row: QueryRow) => {
            const columnDefault = row.column_default as string | null;
            const isAutoIncrement =
                (columnDefault !== null && columnDefault.includes("nextval")) ||
                (columnDefault !== null && columnDefault.includes("identity"));
            const lengthRaw = row.character_maximum_length ?? row.numeric_precision ?? undefined;
            return {
                name: row.column_name as string,
                type: row.data_type as string,
                length: lengthRaw != null ? Number(lengthRaw) : undefined,
                nullable: row.is_nullable === "YES",
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
        if (result.status !== "success") {
            return [];
        }

        const indexMap = new Map<string, IndexInfo>();
        for (const row of result.rows) {
            const indexName = row.index_name as string;
            if (!indexMap.has(indexName)) {
                indexMap.set(indexName, {
                    name: indexName,
                    type: "btree",
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
        if (result.status !== "success") {
            return [];
        }

        const fkMap = new Map<string, ForeignKeyInfo>();
        const deleteRuleMap: Record<string, string> = { a: "NO ACTION", r: "RESTRICT", c: "CASCADE", n: "SET NULL", d: "SET DEFAULT" };
        const updateRuleMap: Record<string, string> = { a: "NO ACTION", r: "RESTRICT", c: "CASCADE", n: "SET NULL", d: "SET DEFAULT" };

        for (const row of result.rows) {
            const fkName = row.constraint_name as string;
            if (!fkMap.has(fkName)) {
                fkMap.set(fkName, {
                    name: fkName,
                    columns: [],
                    referencedTable: row.referenced_table as string,
                    referencedColumns: [],
                    onDelete: deleteRuleMap[row.on_delete as string] ?? "NO ACTION",
                    onUpdate: updateRuleMap[row.on_update as string] ?? "NO ACTION",
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
            operation: (plan["Node Type"] as string) ?? "unknown",
            table: plan["Relation Name"] as string | undefined,
            rows: plan["Actual Rows"] != null ? Number(plan["Actual Rows"]) : undefined,
            cost: plan["Total Cost"] != null ? Number(plan["Total Cost"]) : undefined,
            key: plan["Index Name"] as string | undefined,
            extra: plan["Filter"] as string | undefined,
            children: [],
        };

        const subPlans = plan.Plans as unknown[] | undefined;
        if (Array.isArray(subPlans)) {
            for (const subPlan of subPlans) {
                if (subPlan && typeof subPlan === "object") {
                    node.children.push(this.parseSinglePlanNode(subPlan as Record<string, unknown>, idCounter));
                }
            }
        }

        return node;
    }
}

/**
 * PostgreSQL database adapter.
 *
 * Assembles the five PostgreSQL sub-adapters (shared context, connection,
 * query, metadata, schema) via the 5 factory methods declared on
 * {@link BaseDatabaseAdapter}. All common lifecycle / status / reap logic is
 * inherited from the base class.
 */
export class PostgresAdapter extends BaseDatabaseAdapter<PostgresSharedContext> {
    protected override createSharedContext(): PostgresSharedContext {
        return new PostgresSharedContext(this);
    }
    protected override createConnectionAdapter(): IConnectionLifecycle {
        return new PostgresConnectionAdapter(this.shared);
    }
    protected override createQueryAdapter(): IQueryAdapter {
        return new PostgresQueryAdapter(this.shared);
    }
    protected override createMetadataAdapter(): IMetadataAdapter {
        return new PostgresMetadataAdapter(this.shared, (sql, params) => this.queryAdapter.execute(sql, params));
    }
    protected override createSchemaAdapter(): ISchemaAdapter {
        return new PostgresSchemaAdapter(
            this.shared,
            (sql, params) => this.queryAdapter.execute(sql, params),
            (db, schema) => this.metadataAdapter.listTriggers(db, schema),
        );
    }

    protected override getReapLogPrefix(): string {
        return "PG";
    }

    static getDialectMetadata(): DialectMetadata {
        return {
            dialect: "postgresql",
            displayName: "PostgreSQL",
            defaultPort: 5432,
            defaultUsername: "postgres",
            iconKey: "postgresql",
            supportsSshTunnel: true,
            supportsSsl: true,
            isFileBased: false,
        };
    }
}
