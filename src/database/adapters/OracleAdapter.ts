import type { Pool, Connection, PoolAttributes } from 'oracledb';
import type { DialectMetadata, IConnectionLifecycle, IMetadataAdapter, IQueryAdapter, ISchemaAdapter, ConnectionConfig, TestConnectionResult, QueryResult, QueryRow, QueryParam, DatabaseInfo, TableInfo, ViewInfo, FunctionInfo, ProcedureInfo, TriggerInfo, ColumnInfo, IndexInfo, ForeignKeyInfo, TableStructure, RoutineParameterInfo, DialectCapabilities, DataTypeCategory, ExplainResult, ExplainNode } from './IDatabaseAdapter';
import { t } from '../../i18n/index';
import { replaceQuestionMarkPlaceholders } from './placeholderRewriter';
import { BaseDatabaseAdapter } from './BaseDatabaseAdapter';
import { BaseSharedContext } from './BaseSharedContext';
import { BaseConnectionAdapter } from './BaseConnectionAdapter';
import { BaseQueryAdapter } from './BaseQueryAdapter';
import { BaseMetadataAdapter } from './BaseMetadataAdapter';
import { BaseSchemaAdapter } from './BaseSchemaAdapter';

/**
 * Structural shape shared by {@link OracleSharedContext} and
 * {@link DamengSharedContext}. Declared so that {@link OracleSchemaAdapter}
 * can be generic over the shared-context contract and
 * {@link DamengSchemaAdapter} can subclass it, overriding only the
 * dialect-specific DDL / EXPLAIN / capabilities behaviour.
 *
 * Both contexts delegate `config` to a {@link BaseDatabaseAdapter} instance
 * and expose a `pool` (typed as `unknown` here because oracledb and odbc
 * have incompatible Pool shapes; only {@link OracleSchemaAdapter}'s own
 * {@link OracleSchemaAdapter.getExplainPlan} touches the pool directly, and
 * Dameng overrides that method to use the odbc API instead).
 */
export interface IOracleDialectSharedContext {
    pool: unknown;
    readonly config: ConnectionConfig;
}

/**
 * Oracle shared context.
 *
 * Holds the oracledb Pool and the transaction-scoped Connection used by the
 * query/schema adapters. Mirrors the structure of MysqlSharedContext and
 * SqlServerSharedContext but uses the oracledb driver types (Pool/Connection).
 * Common adapter-delegated state (config / connectionId / activity counters /
 * reap timer) is inherited from {@link BaseSharedContext}.
 *
 * The oracledb driver is loaded via dynamic import inside the sub-adapters so
 * it stays in the esbuild `external` list and is only required when an Oracle
 * connection is actually used.
 */
export class OracleSharedContext extends BaseSharedContext implements IOracleDialectSharedContext {
    // Oracle shared state
    pool: Pool | null = null;
    transactionConnection: Connection | null = null;
    activeQueryConnections = new Map<string, Connection>();
}

/**
 * Oracle connection pool operations.
 *
 * Uses the oracledb npm package (6.x). By default the driver runs in thin mode
 * (pure JavaScript, no Instant Client required). Thick mode can be enabled via
 * `config.options.thickMode` together with an optional
 * `config.options.instantClientPath`; in that case `initOracleClient` is called
 * once per process (idempotently guarded).
 *
 * The driver is loaded via dynamic import so it stays in the esbuild `external`
 * list and is only required when an Oracle connection is actually used.
 *
 * Used internally by OracleAdapter; common lifecycle logic lives in
 * BaseDatabaseAdapter.
 */
export class OracleConnectionAdapter extends BaseConnectionAdapter<OracleSharedContext> {
    constructor(protected shared: OracleSharedContext) {
        super();
    }

    async connect(config: ConnectionConfig): Promise<void> {
        const poolAttrs = this.createPoolAttributes(config);

        try {
            // Initialise thick mode if requested. initOracleClient is global
            // and may only be called once per process; guard with a module
            // level flag so repeated connect() calls stay idempotent.
            await this.maybeInitThickMode(config);

            const oracledb = await import('oracledb');
            this.shared.pool = await oracledb.createPool(poolAttrs);

            // Verify connectivity with a trivial query.
            const conn = await this.shared.pool.getConnection();
            try {
                await conn.execute('SELECT 1 AS ONE FROM dual');
            } finally {
                await conn.close();
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
        if (this.shared.transactionConnection) {
            try {
                await this.shared.transactionConnection.rollback();
            } catch (e) {
                console.debug('[SQL All in One] Oracle rollback error on disconnect:', e);
            }
            try {
                await this.shared.transactionConnection.close();
            } catch (e) {
                console.debug('[SQL All in One] Oracle close transaction connection error:', e);
            }
            this.shared.transactionConnection = null;
        }

        if (this.shared.pool) {
            try {
                await this.shared.pool.close();
            } catch (e) {
                console.debug('[SQL All in One] Oracle pool close error:', e);
            }
            this.shared.pool = null;
        }
    }

    async testConnection(config: ConnectionConfig): Promise<TestConnectionResult> {
        const startTime = Date.now();
        let tempPool: Pool | null = null;

        try {
            await this.maybeInitThickMode(config);

            const oracledb = await import('oracledb');
            tempPool = await oracledb.createPool(this.createPoolAttributes(config, 1));
            const conn = await tempPool.getConnection();
            try {
                const result = await conn.execute<{ BANNER: string }>(
                    'SELECT banner FROM v$version WHERE ROWNUM = 1'
                );
                const endTime = Date.now();
                const versionRow = result.rows?.[0];
                const serverVersion = (versionRow?.BANNER as string)?.split('\n')[0]?.trim() ?? 'Oracle';

                return {
                    success: true,
                    serverVersion,
                    latency: endTime - startTime,
                };
            } finally {
                await conn.close();
            }
        } catch (error: unknown) {
            const formatted = this.formatConnectionError(error, config);
            return {
                success: false,
                error: formatted.message,
            };
        } finally {
            if (tempPool) {
                try {
                    await tempPool.close();
                } catch (e) {
                    console.debug('[SQL All in One] Oracle temp pool close error:', e);
                }
            }
        }
    }

    async checkConnectionHealth(): Promise<boolean> {
        if (!this.shared.pool) {
            return false;
        }

        let conn;
        try {
            conn = await this.shared.pool.getConnection();
            try {
                await conn.ping();
                return true;
            } finally {
                await conn.close();
            }
        } catch (e) {
            console.debug('[SQL All in One] OracleConnectionAdapter.checkConnectionHealth failed:', e);
            return false;
        }
    }


    /**
     * Surfaces the Oracle error number as an `ORA-XXXXX` tag so that
     * {@link BaseConnectionAdapter.formatConnectionError} can prepend it to
     * the raw error message when no localised mapping applied. This replaces
     * the previous per-dialect `formatConnectionError` override, which only
     * prepended the same tag and otherwise delegated to the base class.
     */
    protected override extractErrorCodeTag(error: unknown): string | null {
        const errorNum = (error as { errorNum?: number })?.errorNum;
        if (!errorNum) {
            return null;
        }
        return `ORA-${String(errorNum).padStart(5, '0')}`;
    }

    protected override formatDriverSpecificError(error: unknown, config: ConnectionConfig): Error | undefined {
        const msg = error instanceof Error ? error.message : String(error);
        const hostPort = `${config.host}:${config.port}`;

        // Oracle error numbers are surfaced as ORA-XXXXX or DPI-XXXX.
        const errorNum = (error as { errorNum?: number })?.errorNum;
        const oraCode = errorNum ? `ORA-${String(errorNum).padStart(5, '0')}` : '';

        if (oraCode === 'ORA-01017' || msg.includes('ORA-01017') || msg.includes('invalid username/password')) {
            return new Error(t('database.accessDenied', config.username, hostPort));
        }
        if (oraCode === 'ORA-12505' || msg.includes('ORA-12505') || msg.includes('TNS:listener does not currently know of SID')) {
            return new Error(t('database.databaseNotExist', config.database || '(none)', hostPort));
        }
        if (oraCode === 'ORA-12514' || msg.includes('ORA-12514') || msg.includes('TNS:listener does not currently know of service')) {
            return new Error(t('database.databaseNotExist', config.database || '(none)', hostPort));
        }
        if (oraCode === 'ORA-12541' || msg.includes('ORA-12541') || msg.includes('TNS:no listener')) {
            return new Error(t('database.connectionRefused', hostPort));
        }
        if (oraCode === 'ORA-12170' || msg.includes('ORA-12170') || msg.includes('TNS:Connect timeout occurred')) {
            return new Error(t('database.connectionTimedOut', hostPort));
        }
        if (oraCode === 'ORA-12545' || msg.includes('ORA-12545') || msg.includes('TNS:unable to resolve the connect identifier')) {
            return new Error(t('database.hostNotFound', config.host));
        }
        if (msg.includes('DPI-1080') || msg.includes('connection was closed')) {
            return new Error(t('database.connectionLost', hostPort));
        }

        // SSL/certificate and common network errors are handled by the base
        // class (BaseConnectionAdapter).
        return undefined;
    }

    /**
     * Builds the oracledb connect string from the host/port/database config.
     *
     * Supports two formats:
     *   - `host:port/service_name`  (default, EZ-connect style)
     *   - `host:port:sid`           (when `config.options.useSid` is true)
     *
     * If `config.options.connectString` is provided it is used verbatim,
     * taking precedence over the host/port/database derivation.
     */
    private buildConnectString(config: ConnectionConfig): string {
        const explicit = config.options?.connectString;
        if (typeof explicit === 'string' && explicit.length > 0) {
            return explicit;
        }

        const host = config.host;
        const port = String(config.port ?? 1521);
        const useSid = config.options?.useSid === true;
        const serviceOrSid = config.database ?? 'ORCL';

        if (useSid) {
            // host:port:sid  →  //(HOST:PORT)(SID=...)
            return `(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=${host})(PORT=${port}))(CONNECT_DATA=(SID=${serviceOrSid})))`;
        }

        // host:port/service_name  →  //(HOST:PORT)(SERVICE_NAME=...)
        return `(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=${host})(PORT=${port}))(CONNECT_DATA=(SERVICE_NAME=${serviceOrSid})))`;
    }

    private createPoolAttributes(config: ConnectionConfig, maxConnectionsOverride?: number): PoolAttributes {
        const poolAttrs: PoolAttributes = {
            user: config.username,
            password: config.password,
            connectString: this.buildConnectString(config),
            poolMin: config.poolConfig?.minConnections ?? 1,
            poolMax: maxConnectionsOverride ?? config.poolConfig?.maxConnections ?? 5,
            poolIncrement: 1,
            poolTimeout: Math.floor((config.poolConfig?.idleTimeout ?? 30000) / 1000),
            poolPingInterval: Math.floor((config.poolConfig?.keepAliveInterval ?? 30000) / 1000),
            connectTimeout: config.connectTimeout ?? 10000,
            stmtCacheSize: 30,
        };

        // SSL/TLS support. oracledb thin mode supports TLS via the wallet /
        // sslServerCertDN options; thick mode uses the native wallet. We pass
        // through the relevant options when SSL is enabled.
        if (config.ssl?.enabled) {
            poolAttrs.ssl = true;
            if (typeof config.options?.sslServerCertDN === 'string') {
                poolAttrs.sslServerCertDN = config.options.sslServerCertDN as string;
            }
            // When rejectUnauthorized is false, allow weak DN matching so that
            // self-signed certificates do not need to match the host name.
            if (config.ssl.rejectUnauthorized === false) {
                poolAttrs.sslAllowWeakDNMatch = true;
                poolAttrs.sslServerCertDNMatch = false;
            }
        }

        return poolAttrs;
    }

    /**
     * Initialises the oracledb thick (native) mode if requested.
     *
     * `initOracleClient` is a global, one-shot call: invoking it twice in the
     * same process throws DPI-1074. We guard it with a module-level flag so
     * repeated connect()/testConnection() calls remain idempotent.
     */
    private static thickModeInitialised = false;

    private async maybeInitThickMode(config: ConnectionConfig): Promise<void> {
        const thickMode = config.options?.thickMode === true;
        if (!thickMode) {
            return;
        }

        if (OracleConnectionAdapter.thickModeInitialised) {
            return;
        }

        const oracledb = await import('oracledb');
        const initOptions: { libDir?: string; configDir?: string } = {};
        const instantClientPath = config.options?.instantClientPath;
        if (typeof instantClientPath === 'string' && instantClientPath.length > 0) {
            initOptions.libDir = instantClientPath;
        }
        const configDir = config.options?.configDir;
        if (typeof configDir === 'string' && configDir.length > 0) {
            initOptions.configDir = configDir;
        }

        try {
            oracledb.initOracleClient(initOptions);
            OracleConnectionAdapter.thickModeInitialised = true;
        } catch (e) {
            // If a previous call already initialised thick mode (e.g. from
            // another adapter instance), oracledb throws DPI-1074. Treat that
            // as success.
            const msg = e instanceof Error ? e.message : String(e);
            if (msg.includes('DPI-1074') || msg.includes('already initialized')) {
                OracleConnectionAdapter.thickModeInitialised = true;
                return;
            }
            throw e;
        }
    }
}

/**
 * Oracle query adapter.
 *
 * Executes queries via `connection.execute(...)` with `outFormat: OBJECT` so
 * rows are returned as objects keyed by column name. `autoCommit` is disabled
 * so that the adapter controls transaction boundaries explicitly via
 * beginTransaction/commit/rollback.
 *
 * Transactions are managed through a dedicated connection acquired from the
 * pool; queries issued while a transaction is active are routed through that
 * connection. Query cancellation uses `connection.break()` (an alias for
 * `breakExecution()`).
 */
export class OracleQueryAdapter extends BaseQueryAdapter<OracleSharedContext> {
    protected override async executeWithConnection(sql: string, params: QueryParam[] | undefined, queryId: string, startTime: number): Promise<QueryResult> {
        let acquiredConn: Connection | null = null;

        // Use the transaction connection if active, otherwise acquire one
        // from the pool for the duration of this query.
        let queryConn: Connection;
        if (this.shared.transactionConnection) {
            queryConn = this.shared.transactionConnection;
        } else {
            acquiredConn = await this.shared.pool!.getConnection();
            this.shared.activeConnectionCount++;
            queryConn = acquiredConn;
            this.shared.activeQueryConnections.set(queryId, acquiredConn);
        }

        try {
            const oracledb = await import('oracledb');
            // Map ? placeholders to oracledb named binds (:1, :2, ...).
            const { finalSql, binds } = this.prepareSqlAndBinds(sql, params);

            const result = await queryConn.execute<QueryRow>(finalSql, binds, {
                outFormat: oracledb.OUT_FORMAT_OBJECT,
                autoCommit: false,
                extendedMetaData: true,
            });
            const executionTime = Date.now() - startTime;

            const rows = (result.rows ?? []) as QueryRow[];
            const columns = (result.metaData ?? []).map(meta => ({
                name: meta.name,
                type: String(meta.dbType ?? meta.fetchType ?? 'UNKNOWN'),
                nullable: meta.nullable ?? true,
                isPrimaryKey: false,
                isAutoIncrement: false,
                isEnum: false,
            }));

            const rowCount = rows.length;
            const affectedRows = typeof result.rowsAffected === 'number' ? result.rowsAffected : undefined;

            return {
                queryId,
                status: 'success',
                columns,
                rows,
                rowCount,
                affectedRows: affectedRows !== undefined && affectedRows > 0 ? affectedRows : undefined,
                executionTime,
                database: this.shared.config?.database,
            };
        } finally {
            if (acquiredConn) {
                this.shared.activeConnectionCount--;
                this.shared.activeQueryConnections.delete(queryId);
                try {
                    await acquiredConn.close();
                } catch (e) {
                    console.debug('[SQL All in One] Oracle connection close error:', e);
                }
            }
        }
    }

    /**
     * Oracle-specific error mapping: derives `ORA-XXXXX` codes from
     * `error.errorNum`.
     */
    protected override mapError(error: unknown, sql: string, queryId: string, executionTime: number): QueryResult {
        const oracleError = error as { errorNum?: number; message?: string };
        const code = oracleError.errorNum ? `ORA-${String(oracleError.errorNum).padStart(5, '0')}` : 'EXEC_ERROR';
        return {
            queryId,
            status: 'error',
            columns: [],
            rows: [],
            rowCount: 0,
            executionTime,
            error: {
                code,
                message: error instanceof Error ? error.message : String(error),
                sql,
            },
            database: this.shared.config?.database,
        };
    }

    async beginTransaction(): Promise<void> {
        if (this.shared.transactionConnection) {
            throw new Error(t('database.transactionInProgress'));
        }
        if (!this.shared.pool) {
            throw new Error(t('database.notConnected'));
        }

        // Oracle does not have an explicit BEGIN TRANSACTION statement; an
        // implicit transaction starts on the first DML. We acquire a dedicated
        // connection from the pool and hold it until commit/rollback so that
        // subsequent statements are routed through the same transaction.
        this.shared.transactionConnection = await this.shared.pool.getConnection();
        // Disable auto-commit just to be explicit (oracledb defaults to false
        // but we make the intent clear).
    }

    async commit(): Promise<void> {
        if (!this.shared.transactionConnection) {
            throw new Error(t('database.noTransactionInProgress'));
        }

        try {
            await this.shared.transactionConnection.commit();
        } finally {
            try {
                await this.shared.transactionConnection.close();
            } catch (e) {
                console.debug('[SQL All in One] Oracle close after commit error:', e);
            }
            this.shared.transactionConnection = null;
        }
    }

    async rollback(): Promise<void> {
        if (!this.shared.transactionConnection) {
            throw new Error(t('database.noTransactionInProgress'));
        }

        try {
            await this.shared.transactionConnection.rollback();
        } catch (rollbackError) {
            console.error('Oracle rollback failed:', rollbackError);
        } finally {
            try {
                await this.shared.transactionConnection.close();
            } catch (e) {
                console.debug('[SQL All in One] Oracle close after rollback error:', e);
            }
            this.shared.transactionConnection = null;
        }
    }

    async cancelQuery(queryId: string): Promise<void> {
        // Prefer the connection tracked for this query id; fall back to the
        // transaction connection (queries issued inside a transaction share it).
        const conn = this.shared.activeQueryConnections.get(queryId) ?? this.shared.transactionConnection;
        if (!conn) {
            return;
        }

        try {
            // break() is the documented alias for breakExecution() in oracledb.
            await conn.break();
        } catch (e) {
            console.debug('[SQL All in One] Oracle cancel query error:', e);
        }
    }

    /**
     * Converts `?` placeholders in the SQL string to oracledb named binds
     * (`:1`, `:2`, ...) and builds the bind values array in order. Literal
     * question marks inside string literals are preserved by tracking
     * single-quote state.
     *
     * oracledb accepts either a positional array (matching :1, :2, ...) or an
     * object keyed by bind name. We use the positional array form because it
     * matches the existing QueryParam[] shape used by the other adapters.
     */
    private prepareSqlAndBinds(
        sql: string,
        params?: QueryParam[]
    ): { finalSql: string; binds: unknown[] } {
        const binds: unknown[] = [];
        if (!params || params.length === 0) {
            return { finalSql: sql, binds };
        }

        // Oracle uses named binds `:1, :2, …`. The shared rewriter handles
        // string-literal / `?`-skipping; we collect bind values in the same
        // order as the consumed placeholders.
        const { sql: finalSql, consumedIndexes } = replaceQuestionMarkPlaceholders(
            sql,
            (index) => (index <= params.length ? `:${index}` : undefined),
        );
        for (const idx of consumedIndexes) {
            binds.push(params[idx - 1].value);
        }
        return { finalSql, binds };
    }
}

/**
 * Oracle metadata adapter.
 *
 * Queries the Oracle data dictionary views (all_users, all_tables, all_views,
 * all_source, all_procedures, all_triggers) to enumerate database objects.
 *
 * Oracle has no concept of multiple databases within an instance in the same
 * sense as MySQL/SQL Server; `listDatabases` therefore returns information
 * about the current container (CDB/PDB) rather than a list of databases. The
 * `schema` parameter is used as the owner filter for the other listing
 * methods, falling back to the connected user when not provided.
 *
 * Implemented as a generic over the shared-context contract so that
 * {@link DamengMetadataAdapter} (which speaks the same ALL_* catalogue
 * dialect but uses the ODBC driver and `?` placeholders) can subclass it and
 * only override {@link placeholderFor}, {@link resolveOwner} and
 * {@link defaultDatabaseName}.
 */
export class OracleMetadataAdapter<TShared extends IOracleDialectSharedContext = IOracleDialectSharedContext> extends BaseMetadataAdapter<TShared> {
    /**
     * Placeholder token emitted by this dialect for the 1-based bind position.
     * Oracle uses `:N` named binds; Dameng overrides this to return `?` for
     * its ODBC positional binds.
     */
    protected placeholderFor(index: number): string {
        return `:${index}`;
    }

    /**
     * Default database name returned by {@link listDatabases} when the
     * `SYS_CONTEXT` probe yields no row. Oracle falls back to `'ORCL'`;
     * Dameng overrides to return `'DAMENG'`.
     */
    protected defaultDatabaseName(): string {
        return 'ORCL';
    }

    /**
     * Oracle has no multi-database concept in the MySQL/SQL Server sense.
     * Returns a single entry describing the current container (CDB/PDB).
     * Overridden end-to-end because the shape (single row derived from
     * `SYS_CONTEXT`) diverges from the base {@link BaseMetadataAdapter.listDatabases}
     * template (filter rows from {@link listDatabaseRows} via
     * {@link isSystemDatabase}).
     */
    override async listDatabases(): Promise<DatabaseInfo[]> {
        // Oracle has no multi-database concept in the MySQL/SQL Server sense.
        // Return a single entry describing the current container (CDB/PDB).
        const sql = `SELECT SYS_CONTEXT('USERENV', 'CON_NAME') AS name, SYS_CONTEXT('USERENV', 'DB_NAME') AS db_name FROM dual`;
        const result = await this.executeQuery(sql);
        if (result.status !== 'success' || result.rows.length === 0) {
            return [{ name: this.shared.config?.database ?? this.defaultDatabaseName() }];
        }

        const row = result.rows[0];
        const name = (row.name as string) || (row.db_name as string) || this.shared.config?.database || this.defaultDatabaseName();
        return [{ name }];
    }

    /**
     * Not used because {@link listDatabases} is overridden end-to-end.
     * Implemented as a no-op to satisfy the abstract base contract.
     */
    protected async listDatabaseRows(): Promise<DatabaseInfo[]> {
        return [];
    }

    async listSchemas(_database?: string): Promise<string[]> {
        const sql = `SELECT username AS username FROM all_users ORDER BY username`;
        return this.runListQuery<string>(sql, undefined, (row: QueryRow) => row.username as string);
    }

    async listTables(_database?: string, schema?: string, filter?: string): Promise<TableInfo[]> {
        const owner = this.resolveOwner(schema);
        let sql = `SELECT table_name, 'BASE TABLE' AS table_type, num_rows AS num_rows FROM all_tables WHERE owner = ${this.placeholderFor(1)}`;
        const params: QueryParam[] = [{ value: owner }];

        if (filter) {
            sql += ` AND table_name LIKE ${this.placeholderFor(2)}`;
            params.push({ value: `%${filter}%` });
        }

        sql += ` ORDER BY table_name`;

        return this.runListQuery<TableInfo>(sql, params, (row: QueryRow) => ({
            name: row.table_name as string,
            type: row.table_type as string,
            rowCount: row.num_rows != null ? Number(row.num_rows) : undefined,
        }));
    }

    async listViews(_database?: string, schema?: string): Promise<ViewInfo[]> {
        const owner = this.resolveOwner(schema);
        const sql = `SELECT view_name FROM all_views WHERE owner = ${this.placeholderFor(1)} ORDER BY view_name`;
        return this.runListQuery<ViewInfo>(sql, [{ value: owner }], (row: QueryRow) => ({
            name: row.view_name as string,
        }));
    }

    override async listFunctions(_database?: string, schema?: string): Promise<FunctionInfo[]> {
        const owner = this.resolveOwner(schema);
        // all_source holds the source text for PL/SQL functions; we aggregate
        // by name to get one row per function.
        const sql = `SELECT name AS function_name FROM all_source WHERE type = 'FUNCTION' AND owner = ${this.placeholderFor(1)} GROUP BY name ORDER BY name`;
        return this.runListQuery<FunctionInfo>(sql, [{ value: owner }], (row: QueryRow) => ({
            name: row.function_name as string,
        }));
    }

    override async listProcedures(_database?: string, schema?: string): Promise<ProcedureInfo[]> {
        const owner = this.resolveOwner(schema);
        // all_procedures lists procedures (and methods within types). We filter
        // to top-level procedures owned by the target schema.
        const sql = `SELECT object_name AS procedure_name FROM all_procedures WHERE owner = ${this.placeholderFor(1)} AND object_type = 'PROCEDURE' ORDER BY object_name`;
        return this.runListQuery<ProcedureInfo>(sql, [{ value: owner }], (row: QueryRow) => ({
            name: row.procedure_name as string,
        }));
    }

    async listTriggers(_database?: string, schema?: string): Promise<TriggerInfo[]> {
        const owner = this.resolveOwner(schema);
        const sql = `SELECT trigger_name, triggering_event AS event, trigger_type AS timing, trigger_body AS statement FROM all_triggers WHERE owner = ${this.placeholderFor(1)} ORDER BY trigger_name`;
        return this.runListQuery<TriggerInfo>(sql, [{ value: owner }], (row: QueryRow) => ({
            name: row.trigger_name as string,
            event: row.event as string,
            timing: row.timing as string,
            statement: (row.statement as string) ?? '',
        }));
    }

    /**
     * Resolves the owner (schema) to filter by. Falls back to the connected
     * user name when no schema is provided, matching Oracle's default
     * behaviour where users own their own schema.
     *
     * Protected so dialect subclasses (Dameng) can override the default
     * fallback string (`'SYSDBA'` instead of `'SYS'`).
     */
    protected resolveOwner(schema?: string): string {
        if (schema && schema.length > 0) {
            return schema.toUpperCase();
        }
        const fromConfig = this.shared.config?.username;
        if (fromConfig && fromConfig.length > 0) {
            return fromConfig.toUpperCase();
        }
        return 'SYS';
    }
}

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
 *
 * Implemented as a generic over the shared-context contract so that
 * {@link DamengSchemaAdapter} (which speaks the same DBMS_METADATA /
 * all_tab_columns / all_constraints dialect but uses the ODBC driver and
 * `?` placeholders) can subclass it and only override the divergent methods.
 */
export class OracleSchemaAdapter<TShared extends IOracleDialectSharedContext = OracleSharedContext> extends BaseSchemaAdapter<TShared> {
    protected readonly quoteChar = '"' as const;

    /**
     * Placeholder token emitted by this dialect for the 1-based bind position.
     * Oracle uses `:N` named binds; Dameng overrides this to return `?` for
     * its ODBC positional binds. Centralised here so the catalog-query SQL
     * strings in this class can be shared verbatim between Oracle and Dameng
     * without per-method overrides.
     */
    protected placeholderFor(index: number): string {
        return `:${index}`;
    }

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
        const sql = `SELECT DBMS_METADATA.GET_DDL('TABLE', ${this.placeholderFor(1)}, ${this.placeholderFor(2)}) AS ddl FROM dual`;
        const result = await this.executeQuery(sql, [{ value: table }, { value: owner }]);
        if (result.status !== 'success' || result.rows.length === 0) {
            return '';
        }
        return (result.rows[0].ddl as string) ?? '';
    }

    async getViewDDL(_database: string, view: string, schema?: string): Promise<string> {
        const owner = this.resolveOwner(schema);
        this.validateIdentifier(view);
        const sql = `SELECT DBMS_METADATA.GET_DDL('VIEW', ${this.placeholderFor(1)}, ${this.placeholderFor(2)}) AS ddl FROM dual`;
        const result = await this.executeQuery(sql, [{ value: view }, { value: owner }]);
        if (result.status !== 'success' || result.rows.length === 0) {
            return '';
        }
        return (result.rows[0].ddl as string) ?? '';
    }

    async getFunctionDDL(_database: string, functionName: string, schema?: string): Promise<string> {
        const owner = this.resolveOwner(schema);
        this.validateIdentifier(functionName);
        const sql = `SELECT DBMS_METADATA.GET_DDL('FUNCTION', ${this.placeholderFor(1)}, ${this.placeholderFor(2)}) AS ddl FROM dual`;
        const result = await this.executeQuery(sql, [{ value: functionName }, { value: owner }]);
        if (result.status !== 'success' || result.rows.length === 0) {
            return '';
        }
        return (result.rows[0].ddl as string) ?? '';
    }

    async getProcedureDDL(_database: string, procedureName: string, schema?: string): Promise<string> {
        const owner = this.resolveOwner(schema);
        this.validateIdentifier(procedureName);
        const sql = `SELECT DBMS_METADATA.GET_DDL('PROCEDURE', ${this.placeholderFor(1)}, ${this.placeholderFor(2)}) AS ddl FROM dual`;
        const result = await this.executeQuery(sql, [{ value: procedureName }, { value: owner }]);
        if (result.status !== 'success' || result.rows.length === 0) {
            return '';
        }
        return (result.rows[0].ddl as string) ?? '';
    }

    async getTriggerDDL(_database: string, triggerName: string, schema?: string): Promise<string> {
        const owner = this.resolveOwner(schema);
        this.validateIdentifier(triggerName);
        const sql = `SELECT DBMS_METADATA.GET_DDL('TRIGGER', ${this.placeholderFor(1)}, ${this.placeholderFor(2)}) AS ddl FROM dual`;
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
        const sql = `SELECT argument_name AS argument_name, data_type AS data_type, in_out AS in_out FROM all_arguments WHERE owner = ${this.placeholderFor(1)} AND object_name = ${this.placeholderFor(2)} AND argument_name IS NOT NULL ORDER BY position`;
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
        //
        // The shared context's pool is typed as `unknown` in the
        // {@link IOracleDialectSharedContext} contract (Dameng's odbc Pool is
        // structurally incompatible with oracledb's), so we narrow it to the
        // oracledb Pool here. Dameng overrides this method entirely and never
        // reaches this code path.
        const pool = this.shared.pool as Pool;
        const statementId = `sql_all_in_one_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
        let conn;
        try {
            conn = await pool.getConnection();

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
        const sql = `SELECT num_rows AS row_count FROM all_tables WHERE owner = ${this.placeholderFor(1)} AND table_name = ${this.placeholderFor(2)}`;
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

    protected resolveOwner(schema?: string): string {
        if (schema && schema.length > 0) {
            return schema.toUpperCase();
        }
        const fromConfig = this.shared.config?.username;
        if (fromConfig && fromConfig.length > 0) {
            return fromConfig.toUpperCase();
        }
        return 'SYS';
    }

    protected parseDirection(inOut: string): 'IN' | 'OUT' | 'INOUT' {
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

    protected async describeTableColumns(table: string, owner: string): Promise<ColumnInfo[]> {
        this.validateIdentifier(table);
        const sql = `SELECT column_name, data_type, data_length, data_precision, data_scale, nullable, data_default, column_id FROM all_tab_columns WHERE owner = ${this.placeholderFor(1)} AND table_name = ${this.placeholderFor(2)} ORDER BY column_id`;
        const result = await this.executeQuery(sql, [{ value: owner }, { value: table }]);
        if (result.status !== 'success') {
            return [];
        }

        // Fetch primary key column names so we can flag them on the column
        // info. all_constraints + all_cons_columns gives the PK columns.
        const pkColumns = await this.getPrimaryKeyColumns(table, owner);
        const pkSet = new Set(pkColumns);

        const lengthParameterisedTypes = this.lengthParameterisedDataTypes();

        return result.rows.map((row: QueryRow) => {
            const dataType = row.data_type as string;
            const dataLength = row.data_length != null ? Number(row.data_length) : 0;
            const dataPrecision = row.data_precision != null ? Number(row.data_precision) : null;
            const dataScale = row.data_scale != null ? Number(row.data_scale) : null;
            let type = dataType;
            if (lengthParameterisedTypes.has(dataType)) {
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

    /**
     * The set of data-type names that should be rendered with a length
     * suffix (`TYPE(length)`) when describing table columns. Oracle's
     * canonical list is `VARCHAR2 / CHAR / NVARCHAR2 / NCHAR / RAW`;
     * Dameng overrides this to additionally include `VARCHAR` (which Dameng
     * treats as a length-parameterised type distinct from `VARCHAR2`).
     */
    protected lengthParameterisedDataTypes(): Set<string> {
        return new Set(['VARCHAR2', 'CHAR', 'NVARCHAR2', 'NCHAR', 'RAW']);
    }

    protected async getPrimaryKeyColumns(table: string, owner: string): Promise<string[]> {
        this.validateIdentifier(table);
        const sql = `SELECT acc.column_name AS column_name FROM all_constraints c JOIN all_cons_columns acc ON c.constraint_name = acc.constraint_name AND c.owner = acc.owner WHERE c.constraint_type = 'P' AND c.owner = ${this.placeholderFor(1)} AND c.table_name = ${this.placeholderFor(2)} ORDER BY acc.position`;
        const result = await this.executeQuery(sql, [{ value: owner }, { value: table }]);
        if (result.status !== 'success') {
            return [];
        }
        return result.rows.map((row: QueryRow) => row.column_name as string);
    }

    protected async describeTableIndexes(table: string, owner: string): Promise<IndexInfo[]> {
        this.validateIdentifier(table);
        // Join all_indexes to all_constraints with constraint_type = 'P' so we
        // can flag the actual PK index by its constraint name rather than by
        // (imprecise) column-set equality, which would misclassify a non-PK
        // unique index that happens to span the same columns as the PK.
        const sql = `SELECT i.index_name, i.index_type, i.uniqueness, ic.column_name, CASE WHEN c.constraint_type = 'P' THEN 1 ELSE 0 END AS is_pk FROM all_indexes i JOIN all_ind_columns ic ON i.index_name = ic.index_name AND i.owner = ic.index_owner LEFT JOIN all_constraints c ON c.index_owner = i.owner AND c.index_name = i.index_name AND c.constraint_type = 'P' AND c.owner = i.owner AND c.table_name = i.table_name WHERE i.owner = ${this.placeholderFor(1)} AND i.table_name = ${this.placeholderFor(2)} ORDER BY i.index_name, ic.column_position`;
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

    protected async describeTableForeignKeys(table: string, owner: string): Promise<ForeignKeyInfo[]> {
        this.validateIdentifier(table);
        const sql = `SELECT a.constraint_name, acc.column_name, r.owner AS r_owner, r.table_name AS r_table_name, rcc.column_name AS r_column_name, a.delete_rule FROM all_constraints a JOIN all_cons_columns acc ON a.constraint_name = acc.constraint_name AND a.owner = acc.owner JOIN all_constraints r ON a.r_constraint_name = r.constraint_name AND a.r_owner = r.owner JOIN all_cons_columns rcc ON r.constraint_name = rcc.constraint_name AND r.owner = rcc.owner WHERE a.constraint_type = 'R' AND a.owner = ${this.placeholderFor(1)} AND a.table_name = ${this.placeholderFor(2)} ORDER BY a.constraint_name, acc.position`;
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
            const numericId = Number(row.id);
            const operation = (row.operation as string) ?? 'unknown';
            const options = row.options as string | undefined;
            const node: ExplainNode = {
                id,
                operation: options ? `${operation} ${options}` : operation,
                table: row.object_name as string | undefined,
                rows: row.rows != null ? Number(row.rows) : undefined,
                cost: row.cost != null ? Number(row.cost) : undefined,
                children: [],
            };
            nodeMap.set(numericId, node);
        }

        // Second pass: link children to parents using the depth column.
        const stack: ExplainNode[] = [];
        for (const row of rows) {
            const numericId = Number(row.id);
            const node = nodeMap.get(numericId)!;
            const depth = row.depth != null ? Number(row.depth) : 0;
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

/**
 * Oracle database adapter.
 *
 * Assembles the five Oracle sub-adapters (connection, query, metadata,
 * schema, shared context) and delegates the IDatabaseAdapter surface to them.
 * The oracledb driver (6.x, thin mode by default) is loaded lazily via dynamic
 * import inside the sub-adapters so it is only required when an Oracle
 * connection is actually used and stays in the esbuild `external` list.
 *
 * Thick mode is supported via `config.options.thickMode` together with an
 * optional `config.options.instantClientPath`; see
 * OracleConnectionAdapter.maybeInitThickMode for details.
 */
export class OracleAdapter extends BaseDatabaseAdapter<OracleSharedContext> {
    protected override createSharedContext(): OracleSharedContext {
        return new OracleSharedContext(this);
    }
    protected override createConnectionAdapter(): IConnectionLifecycle {
        return new OracleConnectionAdapter(this.shared);
    }
    protected override createQueryAdapter(): IQueryAdapter {
        return new OracleQueryAdapter(this.shared);
    }
    protected override createMetadataAdapter(): IMetadataAdapter {
        return new OracleMetadataAdapter(
            this.shared,
            (sql, params) => this.queryAdapter.execute(sql, params)
        );
    }
    protected override createSchemaAdapter(): ISchemaAdapter {
        return new OracleSchemaAdapter(
            this.shared,
            (sql, params) => this.queryAdapter.execute(sql, params),
            (db, schema) => this.metadataAdapter.listTriggers(db, schema)
        );
    }

    protected override getReapLogPrefix(): string {
        return 'Oracle';
    }

    static getDialectMetadata(): DialectMetadata {
        return {
            dialect: 'oracle',
            displayName: 'Oracle',
            defaultPort: 1521,
            defaultUsername: 'system',
            iconKey: 'oracle',
            supportsSshTunnel: true,
            supportsSsl: true,
            isFileBased: false
        };
    }
}
