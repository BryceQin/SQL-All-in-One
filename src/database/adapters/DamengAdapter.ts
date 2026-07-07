import type { Pool, Connection, PoolParameters } from 'odbc';
import type {
    ConnectionConfig,
    TestConnectionResult,
    QueryResult,
    QueryRow,
    QueryParam,
    TriggerInfo,
    DialectCapabilities,
    DataTypeCategory,
    ExplainResult,
    ExplainNode,
    DialectMetadata,
    IConnectionLifecycle,
    IMetadataAdapter,
    IQueryAdapter,
    ISchemaAdapter,
} from './IDatabaseAdapter';
import { t } from '../../i18n/index';
import { BaseDatabaseAdapter } from './BaseDatabaseAdapter';
import { BaseSharedContext } from './BaseSharedContext';
import { BaseConnectionAdapter } from './BaseConnectionAdapter';
import { BaseQueryAdapter } from './BaseQueryAdapter';
import { OracleMetadataAdapter, OracleSchemaAdapter } from './OracleAdapter';
import type { IOracleDialectSharedContext } from './OracleAdapter';

/**
 * Dameng (DM8) shared context.
 *
 * Holds the odbc Pool and the transaction-scoped Connection used by the
 * query/schema adapters. Mirrors the structure of OracleSharedContext and
 * SqlServerSharedContext but uses the `odbc` npm package types (Pool /
 * Connection) since Dameng has no official Node.js driver and is reached
 * through its ODBC driver.
 *
 * Implements {@link IOracleDialectSharedContext} so that
 * {@link DamengSchemaAdapter} can subclass {@link OracleSchemaAdapter} and
 * reuse the DBMS_METADATA / all_tab_columns / all_constraints query logic,
 * overriding only the dialect-specific EXPLAIN and `?` placeholder behaviour.
 *
 * Common adapter-delegated state (config / connectionId / activity counters /
 * reap timer) is inherited from {@link BaseSharedContext}.
 *
 * The odbc driver is loaded via dynamic import inside the sub-adapters so
 * it stays in the esbuild `external` list and is only required when a
 * Dameng connection is actually used.
 */
class DamengSharedContext extends BaseSharedContext implements IOracleDialectSharedContext {
    // Dameng shared state (odbc Pool / Connection)
    pool: Pool | null = null;
    transactionConnection: Connection | null = null;
    activeQueryConnections = new Map<string, Connection>();
}

/**
 * Dameng (DM8) connection pool operations.
 *
 * Uses the `odbc` npm package (2.4.x) together with the Dameng DM8 ODBC
 * driver. The driver is loaded via dynamic import so it stays in the
 * esbuild `external` list and is only required when a Dameng connection is
 * actually used.
 *
 * The ODBC connection string format is:
 *   DRIVER=\{DM8 ODBC DRIVER\};SERVER=host:port;UID=user;PWD=pwd;[SCHEMA=schema;][CHARSET=UTF-8;]
 *
 * Used internally by DamengAdapter; common lifecycle logic lives in
 * BaseDatabaseAdapter.
 */
class DamengConnectionAdapter extends BaseConnectionAdapter<DamengSharedContext> {
    constructor(protected shared: DamengSharedContext) {
        super();
    }

    async connect(config: ConnectionConfig): Promise<void> {
        const poolParams = this.createPoolParameters(config);

        try {
            const odbc = await import('odbc');
            this.shared.pool = await odbc.pool(poolParams);

            // Verify connectivity with a trivial query.
            const conn = await this.shared.pool.connect();
            try {
                await conn.query('SELECT 1 AS ONE FROM dual');
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
                console.debug('[SQL All in One] Dameng rollback error on disconnect:', e);
            }
            try {
                await this.shared.transactionConnection.close();
            } catch (e) {
                console.debug('[SQL All in One] Dameng close transaction connection error:', e);
            }
            this.shared.transactionConnection = null;
        }

        // Close any leaked query connections before closing the pool.
        for (const conn of this.shared.activeQueryConnections.values()) {
            try {
                await conn.close();
            } catch (e) {
                console.debug('[SQL All in One] Dameng close leaked query connection error:', e);
            }
        }
        this.shared.activeQueryConnections.clear();

        if (this.shared.pool) {
            try {
                await this.shared.pool.close();
            } catch (e) {
                console.debug('[SQL All in One] Dameng pool close error:', e);
            }
            this.shared.pool = null;
        }
    }

    async testConnection(config: ConnectionConfig): Promise<TestConnectionResult> {
        const startTime = Date.now();
        let tempPool: Pool | null = null;
        let conn: import('odbc').Connection | null = null;

        try {
            const odbc = await import('odbc');
            tempPool = await odbc.pool(this.createPoolParameters(config, 1));
            conn = await tempPool.connect();
            // Dameng exposes version information through v$version, mirroring
            // Oracle's dynamic performance view.
            const result = await conn.query<{ BANNER: string }>(
                'SELECT banner FROM v$version WHERE ROWNUM = 1'
            );
            const endTime = Date.now();
            const versionRow = result[0];
            const serverVersion = (versionRow?.BANNER as string | undefined)
                ?.split('\n')[0]
                ?.trim() ?? 'Dameng DM';

            return {
                success: true,
                serverVersion,
                latency: endTime - startTime,
            };
        } catch (error: unknown) {
            const formatted = this.formatConnectionError(error, config);
            return {
                success: false,
                error: formatted.message,
            };
        } finally {
            if (conn) {
                try {
                    await conn.close();
                } catch (e) {
                    console.debug('[SQL All in One] Dameng test connection close error:', e);
                }
            }
            if (tempPool) {
                try {
                    await tempPool.close();
                } catch (e) {
                    console.debug('[SQL All in One] Dameng temp pool close error:', e);
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
            conn = await this.shared.pool.connect();
            try {
                // ODBC connections do not expose a ping() method; run a
                // trivial SELECT to verify the connection is alive.
                await conn.query('SELECT 1 AS ONE FROM dual');
                return true;
            } finally {
                await conn.close();
            }
        } catch (e) {
            console.debug('[SQL All in One] DamengConnectionAdapter.checkConnectionHealth failed:', e);
            return false;
        }
    }


    /**
     * Surfaces the ODBC SQLSTATE (or a `DM-XXXX` tag derived from the ODBC
     * error code when no SQLSTATE is present) so that
     * {@link BaseConnectionAdapter.formatConnectionError} can prepend it to
     * the raw error message when no localised mapping applied. This replaces
     * the previous per-dialect `formatConnectionError` override, which only
     * prepended the same tag and otherwise delegated to the base class.
     */
    protected override extractErrorCodeTag(error: unknown): string | null {
        const odbcErrors = (error as { odbcErrors?: { code?: number; state?: string; message?: string }[] })?.odbcErrors ?? [];
        const firstError = odbcErrors[0];
        const state = firstError?.state ?? '';
        if (state) {
            return state;
        }
        const codeStr = firstError?.code !== undefined ? String(firstError.code) : '';
        return codeStr ? `DM-${codeStr}` : null;
    }

    protected override formatDriverSpecificError(error: unknown, config: ConnectionConfig): Error | undefined {
        const msg = error instanceof Error ? error.message : String(error);
        const hostPort = `${config.host}:${config.port}`;

        // ODBC errors surface a structured `odbcErrors` array whose entries
        // carry a numeric `code` and a 5-character SQLSTATE `state`. Dameng
        // reuses Oracle-style error codes (e.g. ORA-01017) for backward
        // compatibility, so we pattern-match on both the SQLSTATE and the
        // raw message text.
        const odbcErrors = (error as { odbcErrors?: { code?: number; state?: string; message?: string }[] })?.odbcErrors ?? [];
        const firstError = odbcErrors[0];
        const state = firstError?.state ?? '';
        const codeStr = firstError?.code !== undefined ? String(firstError.code) : '';

        // Authentication failures.
        if (state === '28000' || codeStr === '1017' || msg.includes('ORA-01017') || msg.includes('invalid username/password') || msg.includes('authentication')) {
            return new Error(t('database.accessDenied', config.username, hostPort));
        }
        // Database / service not found.
        if (codeStr === '12505' || codeStr === '12514' || msg.includes('ORA-12505') || msg.includes('ORA-12514') || msg.includes('service') && msg.includes('not found')) {
            return new Error(t('database.databaseNotExist', config.database || '(none)', hostPort));
        }
        // No listener / connection refused.
        if (codeStr === '12541' || msg.includes('ORA-12541') || msg.includes('no listener')) {
            return new Error(t('database.connectionRefused', hostPort));
        }
        // Connect timeout.
        if (codeStr === '12170' || msg.includes('ORA-12170') || msg.includes('connect timeout') || state === 'HYT01') {
            return new Error(t('database.connectionTimedOut', hostPort));
        }
        // Host not found / unreachable.
        if (codeStr === '12545' || msg.includes('ORA-12545')) {
            return new Error(t('database.hostNotFound', config.host));
        }
        if (msg.includes('connection was closed') || msg.includes('connection lost')) {
            return new Error(t('database.connectionLost', hostPort));
        }

        // SSL/certificate and common network errors are handled by the base
        // class (BaseConnectionAdapter).
        return undefined;
    }

    /**
     * Builds the Dameng ODBC connection string from the host/port/database
     * config.
     *
     * Format:
     *   DRIVER=\{DM8 ODBC DRIVER\};SERVER=host:port;UID=user;PWD=pwd;[SCHEMA=schema;][CHARSET=UTF-8;]
     *
     * If `config.options.connectString` is provided it is used verbatim,
     * taking precedence over the host/port/database derivation. The driver
     * name may be overridden via `config.options.driver` (e.g. for older
     * `DM7 ODBC DRIVER` installations).
     */
    private buildConnectionString(config: ConnectionConfig): string {
        const explicit = config.options?.connectString;
        if (typeof explicit === 'string' && explicit.length > 0) {
            return explicit;
        }

        const driver = (config.options?.driver as string | undefined) ?? 'DM8 ODBC DRIVER';
        const host = config.host;
        const port = String(config.port ?? 5236);
        const server = `${host}:${port}`;

        const parts: string[] = [];
        parts.push(`DRIVER={${driver}}`);
        parts.push(`SERVER=${server}`);
        parts.push(`UID=${config.username}`);
        if (config.password !== undefined && config.password !== null) {
            parts.push(`PWD=${config.password}`);
        }

        // The `database` field is used as the default SCHEMA on connect so
        // that unqualified object names resolve against it (Dameng mirrors
        // Oracle's schema-as-user model).
        const schema = (config.options?.schema as string | undefined) ?? config.database;
        if (typeof schema === 'string' && schema.length > 0) {
            parts.push(`SCHEMA=${schema}`);
        }

        const charset = config.options?.charset as string | undefined;
        if (typeof charset === 'string' && charset.length > 0) {
            parts.push(`CHARSET=${charset}`);
        }

        return parts.join(';') + ';';
    }

    private createPoolParameters(config: ConnectionConfig, maxSizeOverride?: number): PoolParameters {
        const params: PoolParameters = {
            connectionString: this.buildConnectionString(config),
            connectionTimeout: Math.floor((config.connectTimeout ?? 10000) / 1000),
            loginTimeout: Math.floor((config.connectTimeout ?? 10000) / 1000),
            initialSize: config.poolConfig?.minConnections ?? 1,
            incrementSize: 1,
            maxSize: maxSizeOverride ?? config.poolConfig?.maxConnections ?? 5,
            shrink: true,
        };

        return params;
    }
}

/**
 * Dameng (DM8) query adapter.
 *
 * Executes queries via `connection.query(sql, params, options)` through the
 * `odbc` npm package. ODBC uses `?` positional placeholders and accepts a flat
 * array of primitive bind values, which matches the existing QueryParam[]
 * shape used by the other adapters (we only need to flatten the `.value`
 * fields and coerce booleans to 0/1).
 *
 * Transactions are managed through a dedicated connection acquired from the
 * pool; queries issued while a transaction is active are routed through that
 * connection. Auto-commit is left enabled on the pool connections and
 * disabled only on the transaction connection via `beginTransaction()`.
 *
 * Query cancellation: ODBC does not expose a native cancel API on the
 * connection object. We enforce a per-query timeout via the odbc
 * `query(sql, params, { timeout })` option (see DEFAULT_QUERY_TIMEOUT_MS).
 * Explicit `cancelQuery()` requests cannot safely target the exact running
 * session without risking killing unrelated same-user sessions on shared
 * pools, so `cancelQuery` is a no-op and relies on the per-query timeout.
 */
class DamengQueryAdapter extends BaseQueryAdapter<DamengSharedContext> {
    /** Per-query timeout (ms) passed to odbc `query` options. Bounds runaway queries. */
    private static readonly DEFAULT_QUERY_TIMEOUT_MS = 30000;

    protected override async executeWithConnection(sql: string, params: QueryParam[] | undefined, queryId: string, startTime: number): Promise<QueryResult> {
        let acquiredConn: Connection | null = null;

        // Use the transaction connection if active, otherwise acquire one
        // from the pool for the duration of this query.
        let queryConn: Connection;
        if (this.shared.transactionConnection) {
            queryConn = this.shared.transactionConnection;
        } else {
            acquiredConn = await this.shared.pool!.connect();
            this.shared.activeConnectionCount++;
            queryConn = acquiredConn;
            this.shared.activeQueryConnections.set(queryId, acquiredConn);
        }

        try {
            const { finalSql, binds } = this.prepareSqlAndBinds(sql, params);
            // Pass the per-query timeout so ODBC aborts runaway queries.
            // ODBC's QueryOptions.timeout is in seconds; convert ms -> s.
            const timeoutSeconds = Math.max(1, Math.floor(DamengQueryAdapter.DEFAULT_QUERY_TIMEOUT_MS / 1000));
            const result = await queryConn.query<QueryRow, { timeout: number }>(
                finalSql,
                binds as (number | string)[],
                { timeout: timeoutSeconds },
            );
            const executionTime = Date.now() - startTime;

            // odbc's Result extends Array<T>, so the rows ARE the result
            // itself. `count` holds the affected-rows count for DML.
            const rows = Array.isArray(result) ? (result as QueryRow[]) : [];
            const columns = (result.columns ?? []).map(col => ({
                name: col.name,
                type: col.dataTypeName || String(col.dataType) || 'UNKNOWN',
                nullable: col.nullable ?? true,
                isPrimaryKey: false,
                isAutoIncrement: false,
                isEnum: false,
            }));

            const rowCount = rows.length;
            const affectedRows = typeof result.count === 'number' && result.count > 0
                ? result.count
                : undefined;

            return {
                queryId,
                status: 'success',
                columns,
                rows,
                rowCount,
                affectedRows,
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
                    console.debug('[SQL All in One] Dameng connection close error:', e);
                }
            }
        }
    }

    /**
     * Dameng/ODBC-specific error mapping: derives `DM-XXXX` codes from the
     * first `odbcErrors` entry, falling back to the ODBC SQLSTATE.
     */
    protected override mapError(error: unknown, sql: string, queryId: string, executionTime: number): QueryResult {
        const odbcError = error as { odbcErrors?: { code?: number; state?: string }[]; message?: string };
        const firstError = odbcError.odbcErrors?.[0];
        const code = firstError?.code !== undefined
            ? `DM-${String(firstError.code)}`
            : (firstError?.state ?? 'EXEC_ERROR');
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

        // Acquire a dedicated connection from the pool and start an explicit
        // transaction on it. Subsequent statements are routed through this
        // connection until commit/rollback.
        const conn = await this.shared.pool.connect();
        try {
            await conn.beginTransaction();
        } catch (e) {
            try {
                await conn.close();
            } catch (closeErr) {
                console.debug('[SQL All in One] Dameng close after beginTransaction error:', closeErr);
            }
            throw e;
        }
        this.shared.transactionConnection = conn;
    }

    async commit(): Promise<void> {
        if (!this.shared.transactionConnection) {
            throw new Error(t('database.noTransactionInProgress'));
        }

        const conn = this.shared.transactionConnection;
        try {
            await conn.commit();
        } finally {
            this.shared.transactionConnection = null;
            try {
                await conn.close();
            } catch (e) {
                console.debug('[SQL All in One] Dameng close after commit error:', e);
            }
        }
    }

    async rollback(): Promise<void> {
        if (!this.shared.transactionConnection) {
            throw new Error(t('database.noTransactionInProgress'));
        }

        const conn = this.shared.transactionConnection;
        try {
            await conn.rollback();
        } catch (rollbackError) {
            console.error('Dameng rollback failed:', rollbackError);
        } finally {
            this.shared.transactionConnection = null;
            try {
                await conn.close();
            } catch (e) {
                console.debug('[SQL All in One] Dameng close after rollback error:', e);
            }
        }
    }

    async cancelQuery(_queryId: string): Promise<void> {
        // ODBC does not expose a native cancel() on a running statement, and
        // the previous best-effort `ALTER SYSTEM KILL SESSION` approach was
        // unsafe: it targeted the most recently logged-in active session for
        // the same user, which on a shared pool could kill an unrelated
        // query from the same user.
        //
        // Cancellation is instead bounded by the per-query `timeout` option
        // passed to `connection.query(...)` in execute() (see
        // DEFAULT_QUERY_TIMEOUT_MS). This method is intentionally a no-op so
        // that callers can call it without risk, while runaway queries are
        // still terminated by the ODBC timeout.
        //
        // The associated activeQueryConnections entry is cleaned up lazily
        // by execute()'s finally block once the query returns/times out.
        void _queryId;
    }

    /**
     * Returns the per-query timeout (ms) passed to the odbc `query` options.
     * Exposed so callers can centralise timeout derivation if needed.
     */
    static getQueryTimeoutMs(): number {
        return DamengQueryAdapter.DEFAULT_QUERY_TIMEOUT_MS;
    }

    /**
     * Converts the QueryParam[] into the flat `Array<number|string>` shape
     * expected by the odbc driver. Booleans are coerced to 0/1 because ODBC
     * has no native boolean type; null/undefined are passed through as null
     * (ODBC treats unbound parameters as NULL). The SQL text is returned
     * unchanged because odbc uses `?` positional placeholders natively.
     *
     * Literal question marks inside string literals are preserved by the
     * caller: since we do not rewrite the SQL, the driver handles the
     * placeholder binding directly.
     */
    private prepareSqlAndBinds(
        sql: string,
        params?: QueryParam[]
    ): { finalSql: string; binds: (number | string | null)[] } {
        if (!params || params.length === 0) {
            return { finalSql: sql, binds: [] };
        }

        const binds: (number | string | null)[] = [];
        for (const p of params) {
            const v = p.value;
            if (v === null || v === undefined) {
                binds.push(null);
            } else if (typeof v === 'boolean') {
                binds.push(v ? 1 : 0);
            } else if (typeof v === 'number') {
                binds.push(v);
            } else {
                binds.push(String(v));
            }
        }
        return { finalSql: sql, binds };
    }
}

/**
 * Metadata for a sequence object, as exposed by Dameng's `all_sequences`
 * view. Declared locally because the base `IMetadataAdapter` interface does
 * not (yet) require `listSequences`; Dameng surfaces it as an extension
 * method so the UI can show sequences in the explorer tree.
 */
interface DamengSequenceInfo {
    name: string;
    minValue?: number;
    maxValue?: number;
    increment?: number;
    lastValue?: number;
    cycle?: boolean;
    cache?: number;
}

/**
 * Metadata for a synonym object, as exposed by Dameng's `all_synonyms` view.
 * Declared locally for the same reason as `DamengSequenceInfo`.
 */
interface DamengSynonymInfo {
    name: string;
    tableOwner?: string;
    tableName: string;
    dbLink?: string;
}

/**
 * Dameng (DM8) metadata adapter.
 *
 * Queries the Dameng data dictionary views (all_users, all_tables,
 * all_views, all_source, all_procedures, all_triggers, all_sequences,
 * all_synonyms) to enumerate database objects. Dameng mirrors Oracle's
 * ALL_* view catalogue for backwards compatibility, so this adapter is a
 * direct subclass of {@link OracleMetadataAdapter} and only overrides:
 *
 *   - {@link placeholderFor} to emit ODBC `?` positional binds instead of
 *     oracledb `:1` named binds.
 *   - {@link resolveOwner} to fall back to `'SYSDBA'` instead of `'SYS'`.
 *   - {@link defaultDatabaseName} to fall back to `'DAMENG'` instead of
 *     `'ORCL'`.
 *   - {@link listSchemas} to use Dameng's bare SELECT-username-FROM-all_users
 *     projection (Oracle aliases the column as username-AS-username; the
 *     alias is cosmetic but preserved for exact parity with the pre-refactor
 *     behaviour).
 *
 * In addition to the base IMetadataAdapter surface, this adapter exposes
 * `listSequences` and `listSynonyms` which enumerate the all_sequences and
 * all_synonyms views respectively. They are surfaced as extension methods on
 * the adapter (not part of IMetadataAdapter) so the UI can show them in the
 * database explorer tree without changing the shared adapter contract.
 */
class DamengMetadataAdapter extends OracleMetadataAdapter<DamengSharedContext> {
    protected override placeholderFor(_index: number): string {
        return '?';
    }

    protected override defaultDatabaseName(): string {
        return 'DAMENG';
    }

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

    override async listSchemas(_database?: string): Promise<string[]> {
        // Dameng historically projected the bare `username` column without the
        // `AS username` alias Oracle uses. The result is identical (column name
        // is `username` either way) but the SQL is preserved verbatim for
        // parity with the pre-refactor behaviour.
        const sql = `SELECT username FROM all_users ORDER BY username`;
        const result = await this.executeQuery(sql);
        if (result.status !== 'success') {
            return [];
        }

        return result.rows.map((row: QueryRow) => row.username as string);
    }

    /**
     * Lists sequences owned by (or accessible to) the given schema.
     *
     * Dameng exposes sequence metadata through all_sequences, mirroring
     * Oracle. The `sequence_owner` column is the owning schema.
     */
    async listSequences(_database?: string, schema?: string): Promise<DamengSequenceInfo[]> {
        const owner = this.resolveOwner(schema);
        const sql = `SELECT sequence_name, min_value, max_value, increment_by AS increment, last_number AS last_value FROM all_sequences WHERE sequence_owner = ${this.placeholderFor(1)} ORDER BY sequence_name`;
        const result = await this.executeQuery(sql, [{ value: owner }]);
        if (result.status !== 'success') {
            return [];
        }

        return result.rows.map((row: QueryRow) => ({
            name: row.sequence_name as string,
            minValue: row.min_value != null ? Number(row.min_value) : undefined,
            maxValue: row.max_value != null ? Number(row.max_value) : undefined,
            increment: row.increment != null ? Number(row.increment) : undefined,
            lastValue: row.last_value != null ? Number(row.last_value) : undefined,
        }));
    }

    /**
     * Lists synonyms owned by (or accessible to) the given schema.
     *
     * Dameng exposes synonym metadata through all_synonyms, mirroring
     * Oracle. The `owner` column is the owning schema; `table_owner` and
     * `table_name` identify the referenced object.
     */
    async listSynonyms(_database?: string, schema?: string): Promise<DamengSynonymInfo[]> {
        const owner = this.resolveOwner(schema);
        const sql = `SELECT synonym_name, table_owner, table_name, db_link FROM all_synonyms WHERE owner = ${this.placeholderFor(1)} ORDER BY synonym_name`;
        const result = await this.executeQuery(sql, [{ value: owner }]);
        if (result.status !== 'success') {
            return [];
        }

        return result.rows.map((row: QueryRow) => ({
            name: row.synonym_name as string,
            tableOwner: row.table_owner as string | undefined,
            tableName: row.table_name as string,
            dbLink: row.db_link as string | undefined,
        }));
    }
}

/**
 * Dameng (DM8) schema adapter.
 *
 * Dameng is Oracle-dialect compatible (DBMS_METADATA.GET_DDL,
 * all_tab_columns, all_constraints, double-quoted identifiers, etc.), so
 * this class extends {@link OracleSchemaAdapter} and reuses the describe /
 * DDL / row-count / quote / validate / parseDirection / index / FK / column
 * helpers unchanged. The Oracle base class's SQL strings are written in
 * terms of the {@link OracleSchemaAdapter.placeholderFor} hook, so the only
 * plumbing required to make them emit ODBC `?` placeholders is a single
 * override of that hook here.
 *
 * The remaining divergences from Oracle are:
 *
 *   - Placeholder syntax: Dameng's ODBC driver uses positional `?`
 *     placeholders instead of Oracle's named `:1` / `:2` binds. Overriding
 *     {@link placeholderFor} alone rewrites every SQL string in the base
 *     class.
 *   - EXPLAIN syntax: Dameng uses `EXPLAIN <sql>` (no `FOR` keyword) and
 *     returns plan rows directly via the ODBC connection (no plan_table /
 *     DBMS_XPLAN indirection). {@link getExplainPlan} is overridden end-to-end.
 *   - Default owner: `SYSDBA` instead of Oracle's `SYS` (via
 *     {@link resolveOwner}).
 *   - `VARCHAR` is treated as a length-parameterised type alongside
 *     VARCHAR2/CHAR/etc. (via {@link lengthParameterisedDataTypes}).
 *   - `supportsCancel: false` (ODBC has no native cancel) and the supported
 *     object types include `sequence` / `synonym` (via
 *     {@link getDialectCapabilities}).
 *   - The supported data-type list reflects Dameng's broader numeric/string
 *     type set (INT/BIGINT/TINYINT/REAL/DOUBLE/TEXT/IMAGE/...).
 */
class DamengSchemaAdapter extends OracleSchemaAdapter<DamengSharedContext> {
    constructor(
        shared: DamengSharedContext,
        executeQuery: (sql: string, params?: QueryParam[]) => Promise<QueryResult>,
        listTriggersFn: (database?: string, schema?: string) => Promise<TriggerInfo[]>
    ) {
        super(shared, executeQuery, listTriggersFn);
    }

    protected override placeholderFor(_index: number): string {
        return '?';
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

    /**
     * Dameng additionally treats `VARCHAR` as a length-parameterised type
     * (distinct from `VARCHAR2`); Oracle's canonical list excludes it.
     */
    protected override lengthParameterisedDataTypes(): Set<string> {
        return new Set(['VARCHAR2', 'CHAR', 'NVARCHAR2', 'NCHAR', 'RAW', 'VARCHAR']);
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

/**
 * Dameng (DM8) database adapter.
 *
 * Assembles the five Dameng sub-adapters (connection, query, metadata,
 * schema, shared context) and delegates the IDatabaseAdapter surface to
 * them. Dameng has no official Node.js driver, so the adapter bridges to the
 * database via the `odbc` npm package (2.4.x) together with the Dameng DM8
 * ODBC driver. The odbc driver is loaded lazily via dynamic import inside
 * the sub-adapters so it is only required when a Dameng connection is
 * actually used and stays in the esbuild `external` list.
 *
 * Dameng is largely Oracle-compatible at the metadata layer (ALL_* views,
 * DBMS_METADATA, v$session, etc.), so the metadata/schema sub-adapters
 * mirror the OracleAdapter structure and only differ in placeholder style
 * (ODBC `?` positional vs oracledb `:1` named binds).
 */
export class DamengAdapter extends BaseDatabaseAdapter<DamengSharedContext> {
    protected override createSharedContext(): DamengSharedContext {
        return new DamengSharedContext(this);
    }
    protected override createConnectionAdapter(): IConnectionLifecycle {
        return new DamengConnectionAdapter(this.shared);
    }
    protected override createQueryAdapter(): IQueryAdapter {
        return new DamengQueryAdapter(this.shared);
    }
    protected override createMetadataAdapter(): IMetadataAdapter {
        return new DamengMetadataAdapter(
            this.shared,
            (sql, params) => this.queryAdapter.execute(sql, params)
        );
    }
    protected override createSchemaAdapter(): ISchemaAdapter {
        return new DamengSchemaAdapter(
            this.shared,
            (sql, params) => this.queryAdapter.execute(sql, params),
            (db, schema) => this.metadataAdapter.listTriggers(db, schema)
        );
    }

    protected override getReapLogPrefix(): string {
        return 'Dameng';
    }

    static getDialectMetadata(): DialectMetadata {
        return {
            dialect: 'dameng',
            displayName: '达梦 DM',
            defaultPort: 5236,
            defaultUsername: 'SYSDBA',
            iconKey: 'dameng',
            supportsSshTunnel: true,
            supportsSsl: false,
            isFileBased: false
        };
    }
}
