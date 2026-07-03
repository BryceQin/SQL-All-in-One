import type { Pool, PoolConnection, PoolOptions, RowDataPacket, FieldPacket, ResultSetHeader, QueryResult as MysqlQueryResult } from 'mysql2/promise';
import type { Readable } from 'stream';
import type {
    DialectMetadata,
    IConnectionLifecycle,
    IMetadataAdapter,
    IQueryAdapter,
    ISchemaAdapter,
    ConnectionConfig,
    TestConnectionResult,
    QueryResult,
    QueryRow,
    QueryParam,
    QueryStreamOptions,
    StreamBatch,
    ColumnMeta,
    DatabaseInfo,
    TableInfo,
    ViewInfo,
    FunctionInfo,
    ProcedureInfo,
    TriggerInfo,
    ColumnInfo,
    IndexInfo,
    ForeignKeyInfo,
    TableStructure,
    RoutineParameterInfo,
    DataTypeCategory,
    ExplainResult,
    ExplainNode,
} from './IDatabaseAdapter';
import { t } from '../../i18n/index';
import { clampBatchSize } from './queryStreamUtils';
import { BaseDatabaseAdapter } from './BaseDatabaseAdapter';
import { BaseSharedContext } from './BaseSharedContext';
import { BaseConnectionAdapter } from './BaseConnectionAdapter';
import { BaseQueryAdapter } from './BaseQueryAdapter';
import { BaseMetadataAdapter } from './BaseMetadataAdapter';
import { BaseSchemaAdapter } from './BaseSchemaAdapter';
import { getSystemDatabases } from '../../utils/systemDatabases';

/**
 * Structural shape shared by {@link MysqlSharedContext} and
 * {@link StarrocksSharedContext}. Declared so that
 * {@link MysqlQueryAdapter} (and any other MySQL-protocol sub-adapter that
 * StarRocks reuses via inheritance) can be typed against a common contract
 * without forcing StarRocks to import the MySQL shared-context class.
 *
 * Both contexts delegate `config` / `connectionId` / activity counters to a
 * {@link BaseDatabaseAdapter} instance, so the structural members below are
 * guaranteed to be present on either dialect's context.
 */
export interface IMysqlProtocolSharedContext {
    pool: Pool | null;
    transactionConnection: PoolConnection | null;
    activeQueryThreadIds: Map<string, number>;
    readonly config: ConnectionConfig;
    activeConnectionCount: number;
    totalConnectionCount: number;
    lastActivityTime: number;
}

/**
 * MySQL shared context.
 *
 * Holds the mysql2 Pool, the transaction-scoped PoolConnection and the
 * active-query threadId map used by the query/schema/connection sub-adapters.
 * Common adapter-delegated state (config / connectionId / activity counters /
 * reap timer) is inherited from {@link BaseSharedContext}.
 */
export class MysqlSharedContext extends BaseSharedContext implements IMysqlProtocolSharedContext {
    // MySQL-specific state
    pool: Pool | null = null;
    transactionConnection: PoolConnection | null = null;
    activeQueryThreadIds = new Map<string, number>();
}

/**
 * MySQL-specific connection pool operations.
 *
 * Implemented as a generic over the shared-context contract so that
 * StarRocks (which reuses the mysql2 driver) can subclass it via
 * {@link StarrocksConnectionAdapter} and only override the dialect-specific
 * version-SQL and log-prefix behaviour. Used internally by MysqlAdapter;
 * common lifecycle logic lives in BaseDatabaseAdapter.
 */
export class MysqlConnectionAdapter<TShared extends IMysqlProtocolSharedContext = IMysqlProtocolSharedContext> extends BaseConnectionAdapter<TShared> {
    constructor(protected shared: TShared) {
        super();
    }

    async connect(config: ConnectionConfig): Promise<void> {
        const poolOptions = this.createPoolOptions(config);

        try {
            const mysql = await import('mysql2/promise');
            this.shared.pool = mysql.createPool(poolOptions);

            const conn = await this.shared.pool.getConnection();
            try {
                await conn.query<RowDataPacket[]>('SELECT 1');
            } finally {
                conn.release();
            }

            const minConnections = config.poolConfig?.minConnections ?? 1;
            const warmupPromises: Promise<void>[] = [];
            for (let i = 0; i < minConnections; i++) {
                warmupPromises.push(
                    this.shared.pool!.getConnection().then(conn => conn.release()).catch((e) => { console.debug(`[SQL All in One] ${this.warmupFailureLogPrefix()} connection warmup failed:`, e); })
                );
            }
            await Promise.all(warmupPromises);
            this.shared.totalConnectionCount = minConnections;
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
                console.debug(`[SQL All in One] ${this.rollbackFailureLogPrefix()} rollback error on disconnect:`, e);
            }
            this.shared.transactionConnection.release();
            this.shared.transactionConnection = null;
        }

        if (this.shared.pool) {
            await this.shared.pool.end();
            this.shared.pool = null;
        }
    }

    async testConnection(config: ConnectionConfig): Promise<TestConnectionResult> {
        const startTime = Date.now();
        let tempConn: import('mysql2/promise').Connection | null = null;

        try {
            const mysql = await import('mysql2/promise');
            const connectOptions = this.createConnectionOptions(config);

            tempConn = await mysql.createConnection(connectOptions);
            const [rows] = await tempConn.query<RowDataPacket[]>(this.getServerVersionSql());
            const endTime = Date.now();
            return {
                success: true,
                serverVersion: (rows[0] as Record<string, unknown>)?.version as string ?? this.defaultServerVersion(),
                latency: endTime - startTime,
            };
        } catch (error: unknown) {
            const formatted = this.formatConnectionError(error, config);
            return {
                success: false,
                error: formatted.message,
            };
        } finally {
            if (tempConn) {
                await tempConn.end();
            }
        }
    }

    async checkConnectionHealth(): Promise<boolean> {
        if (!this.shared.pool) {
            return false;
        }

        try {
            const conn = await this.shared.pool.getConnection();
            try {
                await conn.ping();
                return true;
            } finally {
                conn.release();
            }
        } catch (e) {
            // Health check failure means connection is not available
            console.debug(`[SQL All in One] ${this.healthCheckFailureLogPrefix()}.checkConnectionHealth failed:`, e)
            return false;
        }
    }

    protected override formatDriverSpecificError(error: unknown, config: ConnectionConfig): Error | undefined {
        const msg = error instanceof Error ? error.message : String(error);
        const hostPort = `${config.host}:${config.port}`;

        // MySQL-specific errors
        if (msg.includes('ER_ACCESS_DENIED_ERROR') || msg.includes('Access denied')) {
            return new Error(t('database.accessDenied', config.username, hostPort));
        }
        if (msg.includes('ER_DBACCESS_DENIED_ERROR') || msg.includes('denied to user')) {
            return new Error(t('database.databaseAccessDenied', config.username, config.database || '(none)'));
        }
        if (msg.includes('PROTOCOL_CONNECTION_LOST')) {
            return new Error(t('database.connectionLost', hostPort));
        }
        if (msg.includes('ER_CON_COUNT_ERROR') || msg.includes('Too many connections')) {
            return new Error(t('database.tooManyConnections', hostPort));
        }
        if (msg.includes('ER_BAD_DB_ERROR')) {
            return new Error(t('database.databaseNotExist', config.database || '(none)', hostPort));
        }

        // SSL/certificate and common network errors are handled by the base
        // class (BaseConnectionAdapter).
        return undefined;
    }

    /**
     * SQL used by {@link testConnection} to fetch the server version.
     *
     * MySQL uses `SELECT VERSION() AS version`. Subclasses speaking a
     * MySQL-protocol-compatible dialect (e.g. StarRocks) may override this
     * if their canonical version query differs.
     */
    protected getServerVersionSql(): string {
        return 'SELECT VERSION() AS version';
    }

    /**
     * Default server version string returned by {@link testConnection} when
     * the version query yields no row. Override in subclasses to return the
     * dialect's product name.
     */
    protected defaultServerVersion(): string {
        return 'MySQL';
    }

    /**
     * Log label inserted into the connection-warmup failure debug message.
     * Override in subclasses to distinguish dialect-specific logs.
     */
    protected warmupFailureLogPrefix(): string {
        return 'Connection';
    }

    /**
     * Log label inserted into the rollback-on-disconnect failure debug
     * message. Override in subclasses to distinguish dialect-specific logs.
     */
    protected rollbackFailureLogPrefix(): string {
        return 'Connection';
    }

    /**
     * Log label inserted into the checkConnectionHealth failure debug
     * message. Override in subclasses to distinguish dialect-specific logs.
     */
    protected healthCheckFailureLogPrefix(): string {
        return 'MysqlConnectionAdapter';
    }

    private createPoolOptions(config: ConnectionConfig, connectionLimitOverride?: number): PoolOptions {
        const poolOptions: PoolOptions = {
            host: config.host,
            port: config.port,
            user: config.username,
            password: config.password,
            database: config.database,
            connectionLimit: connectionLimitOverride ?? config.poolConfig?.maxConnections ?? 5,
            waitForConnections: true,
            queueLimit: 0,
            connectTimeout: config.connectTimeout ?? 10000,
            enableKeepAlive: config.poolConfig?.enableKeepAlive ?? true,
            keepAliveInitialDelay: config.poolConfig?.keepAliveInterval ?? 30000,
        };

        if (config.options?.charset) {
            poolOptions.charset = config.options.charset as string;
        }
        if (config.options?.timezone) {
            poolOptions.timezone = config.options.timezone as string;
        }

        if (config.ssl?.enabled) {
            poolOptions.ssl = {
                rejectUnauthorized: config.ssl.rejectUnauthorized ?? true,
                ca: config.ssl.ca,
                cert: config.ssl.cert,
                key: config.ssl.key,
            };
        }

        return poolOptions;
    }

    private createConnectionOptions(config: ConnectionConfig): Record<string, unknown> {
        const options: Record<string, unknown> = {
            host: config.host,
            port: config.port,
            user: config.username,
            password: config.password,
            database: config.database,
            connectTimeout: config.connectTimeout ?? 10000,
        };

        if (config.options?.charset) {
            options.charset = config.options.charset;
        }
        if (config.options?.timezone) {
            options.timezone = config.options.timezone;
        }

        if (config.ssl?.enabled) {
            options.ssl = {
                rejectUnauthorized: config.ssl.rejectUnauthorized ?? true,
                ca: config.ssl.ca,
                cert: config.ssl.cert,
                key: config.ssl.key,
            };
        }

        return options;
    }
}

/**
 * Minimal structural type for the core mysql2 Connection exposed on a
 * PromisePoolConnection via `.connection`. Used by {@link MysqlQueryAdapter.executeStream}
 * to access the event-emitter form of `query()` (the promise wrapper always
 * resolves to a materialized result and cannot be streamed).
 */
interface MysqlCoreConnection {
    query(options: {
        sql: string;
        values?: unknown;
        rowsAsArray?: boolean;
    }): MysqlCoreQuery;
}

/**
 * The Query command object returned by the core mysql2 connection when no
 * callback is supplied. Only the surface we need for streaming is declared.
 */
interface MysqlCoreQuery {
    stream(options?: { highWaterMark?: number; objectMode?: true }): Readable;
    on(event: 'fields', listener: (fields: FieldPacket[], index: number) => void): this;
    on(event: 'result', listener: (result: RowDataPacket | ResultSetHeader, index: number) => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: 'end', listener: () => void): this;
    removeListener(event: 'fields', listener: (fields: FieldPacket[], index: number) => void): this;
    removeListener(event: 'result', listener: (result: RowDataPacket | ResultSetHeader, index: number) => void): this;
    removeListener(event: 'error', listener: (err: Error) => void): this;
    removeListener(event: 'end', listener: () => void): this;
}

/**
 * MySQL query adapter.
 *
 * Implemented as a generic over the shared-context contract so that
 * StarRocks (which reuses the mysql2 driver) can subclass it via
 * {@link StarrocksQueryAdapter} and only override the dialect-specific
 * transaction/cancel behaviour.
 */
export class MysqlQueryAdapter<TShared extends IMysqlProtocolSharedContext = IMysqlProtocolSharedContext> extends BaseQueryAdapter<TShared> {
    protected override async executeWithConnection(sql: string, params: QueryParam[] | undefined, queryId: string, startTime: number): Promise<QueryResult> {
        const values = params?.map(p => p.value);
        const acquireTimeout = this.shared.config?.poolConfig?.acquireTimeout ?? 60000;

        return await this.withAcquiredConnection(acquireTimeout, queryId, async (conn) => {
            const [result, fields] = await conn.query(sql, values);
            const executionTime = Date.now() - startTime;
            return this.mapResultToQueryResult(result, fields, sql, queryId, executionTime);
        });
    }

    /**
     * MySQL-specific error mapping: extracts `error.code` (e.g. `ER_*`)
     * and `error.sqlMessage` from the mysql2 error shape.
     */
    protected override mapError(error: unknown, sql: string, queryId: string, executionTime: number): QueryResult {
        return this.mapMysqlError(error, sql, queryId, executionTime);
    }

    /**
     * Acquire a connection (reusing the in-flight transaction connection if
     * any), invoke `fn` with it, and release it in a `finally` block when it
     * came from the pool. Also keeps {@link IMysqlProtocolSharedContext.activeConnectionCount}
     * and {@link IMysqlProtocolSharedContext.activeQueryThreadIds} in sync so
     * the supplied `queryId` can be cancelled via `KILL QUERY <threadId>`.
     */
    private async withAcquiredConnection<T>(
        acquireTimeout: number,
        queryId: string,
        fn: (conn: Pool | PoolConnection) => Promise<T>,
    ): Promise<T> {
        let queryConn: Pool | PoolConnection = this.shared.transactionConnection ?? this.shared.pool!;
        let acquiredConn: PoolConnection | null = null;

        if (!this.shared.transactionConnection && this.shared.pool) {
            acquiredConn = await this.acquireConnectionWithTimeout(acquireTimeout);
            queryConn = acquiredConn;
        }

        try {
            if (acquiredConn) {
                this.shared.activeConnectionCount++;
                this.shared.activeQueryThreadIds.set(queryId, (acquiredConn as unknown as { threadId: number }).threadId);
            }
            return await fn(queryConn);
        } finally {
            if (acquiredConn) {
                this.shared.activeConnectionCount--;
                acquiredConn.release();
            }
            this.shared.activeQueryThreadIds.delete(queryId);
        }
    }

    /**
     * Map a mysql2 query result (either a row array for SELECT or a
     * {@link ResultSetHeader} for DML/DDL) into a {@link QueryResult}.
     */
    private mapResultToQueryResult(
        result: MysqlQueryResult,
        fields: FieldPacket[] | undefined,
        sql: string,
        queryId: string,
        executionTime: number,
    ): QueryResult {
        // `sql` is accepted for symmetry with {@link mapMysqlError} and to keep
        // the call site self-documenting, but it is not part of the success
        // payload (it is only surfaced on the error path).
        void sql;

        if (Array.isArray(result)) {
            const rows = result as RowDataPacket[];
            const fieldPackets = fields as FieldPacket[];

            const columns = fieldPackets.map(field => {
                const flags = field.flags as number;
                return {
                    name: field.name,
                    type: String(field.type ?? 'UNKNOWN'),
                    nullable: (flags & 0x0001) === 0,
                    isPrimaryKey: (flags & 0x0002) !== 0,
                    isAutoIncrement: (flags & 0x0200) !== 0,
                    isEnum: field.columnType === 247,
                };
            });

            return {
                queryId,
                status: 'success',
                columns,
                rows: rows as QueryRow[],
                rowCount: rows.length,
                executionTime,
                database: this.shared.config?.database,
            };
        }

        const header = result as ResultSetHeader;
        return {
            queryId,
            status: 'success',
            columns: [],
            rows: [],
            rowCount: 0,
            affectedRows: header.affectedRows,
            executionTime,
            database: this.shared.config?.database,
        };
    }

    /**
     * Convert a thrown mysql2 error into a failed {@link QueryResult}. Mirrors
     * the original {@link execute} catch block: errors are surfaced as
     * `status: 'error'` results rather than re-thrown.
     */
    private mapMysqlError(error: unknown, sql: string, queryId: string, executionTime: number): QueryResult {
        const mysqlError = error as { code?: string; errno?: number; sqlMessage?: string };
        return {
            queryId,
            status: 'error',
            columns: [],
            rows: [],
            rowCount: 0,
            executionTime,
            error: {
                code: mysqlError.code ?? String(mysqlError.errno ?? 'EXEC_ERROR'),
                message: mysqlError.sqlMessage ?? (error instanceof Error ? error.message : String(error)),
                sql,
            },
            database: this.shared.config?.database,
        };
    }

    /**
     * Streaming SELECT execution backed by mysql2's Query command object.
     *
     * The promise-wrapped {@link Pool.query} always materializes the full
     * result set, so we reach into the core connection (exposed on
     * `PoolConnection.connection`) and call its event-emitter `query()` with
     * no callback. The returned Query emits `fields` once with column
     * metadata and `result` per row; we accumulate rows into batches of
     * `batchSize` and yield them.
     *
     * Cancellation: if the caller aborts the supplied {@link AbortSignal}, we
     * destroy the underlying Readable, which causes mysql2 to surface an
     * error on the query and release the connection back to the pool.
     *
     * Connection handling mirrors {@link execute}: a connection is acquired
     * from the pool (or the in-flight transaction connection is reused) and
     * released in a `finally` block. When `maxRows` is reached we stop
     * consuming the stream and destroy it early.
     */
    async *executeStream(sql: string, options?: QueryStreamOptions): AsyncIterable<StreamBatch> {
        if (!this.shared.pool) {
            throw new Error(t('database.notConnected'));
        }

        const batchSize = clampBatchSize(options?.batchSize);
        const maxRows = options?.maxRows;
        const values = options?.params?.map(p => p.value);
        const signal = options?.signal;

        const acquireTimeout = this.shared.config?.poolConfig?.acquireTimeout ?? 60000;
        // Reuse the transaction connection if one is active; otherwise acquire
        // a fresh connection from the pool and release it when streaming ends.
        const useTransactionConn = !!this.shared.transactionConnection;
        const queryConn: Pool | PoolConnection = this.shared.transactionConnection ?? this.shared.pool;
        const acquiredConn: PoolConnection | null = useTransactionConn
            ? null
            : await this.acquireConnectionWithTimeout(acquireTimeout);

        if (acquiredConn) {
            this.shared.activeConnectionCount++;
        }

        // The promise wrapper exposes the core connection via `.connection`.
        const coreConn = (acquiredConn ?? queryConn) as unknown as {
            connection?: MysqlCoreConnection;
        } & MysqlCoreConnection;
        const core = coreConn.connection ?? coreConn;

        const query = core.query({ sql, values, rowsAsArray: false });
        const stream = query.stream();

        const aborted = new Error('Query stream aborted');
        let abortedError: Error | null = null;
        const isAborted = (): Error | null => abortedError;

        const onAbort = (): void => {
            abortedError = aborted;
            // Destroying the readable cancels the in-flight query and causes
            // the for-await loop below to throw, which we convert into the
            // normal end-of-stream path.
            try { stream.destroy(); } catch { /* ignore */ }
        };
        if (signal) {
            if (signal.aborted) {
                onAbort();
            } else {
                signal.addEventListener('abort', onAbort, { once: true });
            }
        }

        const { fieldsPromise, getColumns } = this.setupStreamFields(query);

        try {
            await fieldsPromise;

            // If aborted before we started iterating, emit nothing and stop.
            if (abortedError) {
                return;
            }

            // Delegate all row accumulation, batching, maxRows truncation,
            // final partial-batch flush and empty-batch-with-columns emission
            // to the helper generator. `yield*` preserves the original yield
            // timing and backpressure semantics exactly.
            yield* this.iterateStreamRows(
                stream as AsyncIterable<QueryRow>,
                batchSize,
                maxRows,
                getColumns,
                isAborted,
            );

            // If the caller aborted the stream, surface that as a stream
            // error so the collector converts it into a STREAM_ERROR result.
            // This is intentionally outside the finally block so we do not
            // swallow any error thrown while iterating the readable.
            if (abortedError) {
                throw abortedError;
            }
        } finally {
            if (signal) {
                signal.removeEventListener('abort', onAbort);
            }
            // Ensure the underlying query is torn down if we broke out early.
            try { stream.destroy(); } catch { /* ignore */ }

            if (acquiredConn) {
                this.shared.activeConnectionCount--;
                acquiredConn.release();
            }
        }
    }

    /**
     * Subscribe to the `fields` / `end` / `error` events on the supplied
     * mysql2 Query command object and resolve a promise once column metadata
     * has been received (or once the query ends/errors without ever emitting
     * fields, in which case columns stay empty). The captured
     * {@link ColumnMeta} array is exposed via the returned `getColumns`
     * accessor so the caller does not need to share mutable state with this
     * helper.
     */
    private setupStreamFields(query: MysqlCoreQuery): {
        fieldsPromise: Promise<void>;
        getColumns: () => ColumnMeta[];
    } {
        let columns: ColumnMeta[] = [];

        const fieldsPromise = new Promise<void>((resolve) => {
            // 任一回调触发后立即移除全部 listener，避免 listener 泄漏。
            // 注意：error 路径同样 resolve（而非 reject），因为 stream 后续
            // 还会消费/迭代，真正的错误会在 for-await 循环中抛出。
            const removeAll = (): void => {
                query.removeListener('fields', onFields);
                query.removeListener('end', onEnd);
                query.removeListener('error', onError);
            };
            const onFields = (fields: FieldPacket[]): void => {
                removeAll();
                columns = fields.map(field => {
                    const flags = field.flags as number;
                    return {
                        name: field.name,
                        type: String(field.type ?? 'UNKNOWN'),
                        nullable: (flags & 0x0001) === 0,
                        isPrimaryKey: (flags & 0x0002) !== 0,
                        isAutoIncrement: (flags & 0x0200) !== 0,
                        isEnum: field.columnType === 247,
                    };
                });
                resolve();
            };
            // If the query is a non-SELECT (no fields), resolve immediately so
            // the consumer still receives a first (empty) batch.
            const onEnd = (): void => {
                removeAll();
                resolve();
            };
            const onError = (): void => {
                removeAll();
                resolve();
            };
            query.on('fields', onFields);
            query.on('end', onEnd);
            query.on('error', onError);
        });

        return { fieldsPromise, getColumns: () => columns };
    }

    /**
     * Iterate the supplied stream, accumulating rows into batches of
     * `batchSize` and yielding one {@link StreamBatch} per full batch. Stops
     * early when `maxRows` is reached (yielding the truncated batch with
     * `truncated: true`) or when `isAborted` reports an abort error. After the
     * loop, flushes any remaining partial batch and, when no rows were
     * produced but columns were, emits a single empty batch so the collector
     * can still record column metadata.
     *
     * Implemented as an async generator so the enclosing
     * {@link executeStream} can delegate via `yield*`, preserving the original
     * yield timing and backpressure semantics without sharing mutable flags
     * across the boundary.
     */
    private async *iterateStreamRows(
        stream: AsyncIterable<QueryRow>,
        batchSize: number,
        maxRows: number | undefined,
        getColumns: () => ColumnMeta[],
        isAborted: () => Error | null,
    ): AsyncGenerator<StreamBatch, void, unknown> {
        let batchRows: QueryRow[] = [];
        let batchIndex = 0;
        let totalRowsReceived = 0;
        let truncated = false;

        for await (const row of stream) {
            if (isAborted()) {
                break;
            }
            batchRows.push(row);
            totalRowsReceived++;
            if (batchRows.length >= batchSize) {
                const truncatedThisBatch = maxRows !== undefined && totalRowsReceived >= maxRows;
                yield {
                    columns: batchIndex === 0 ? getColumns() : [],
                    rows: batchRows,
                    batchIndex,
                    totalRowsReceived,
                    truncated: truncatedThisBatch,
                };
                batchRows = [];
                batchIndex++;
                if (truncatedThisBatch) {
                    truncated = true;
                    break;
                }
            }
            if (maxRows !== undefined && totalRowsReceived >= maxRows) {
                truncated = true;
                break;
            }
        }

        // Flush any remaining rows as the final batch. This covers both the
        // normal end-of-stream case and the maxRows-truncation case: when
        // maxRows < batchSize the loop exits via the maxRows branch without
        // ever triggering the batchSize flush, so the accumulated rows live
        // only in `batchRows` and must be yielded here.
        if (batchRows.length > 0 && !isAborted()) {
            yield {
                columns: batchIndex === 0 ? getColumns() : [],
                rows: batchRows,
                batchIndex,
                totalRowsReceived,
                truncated,
            };
            batchIndex++;
        }

        // When no rows were produced but columns were, still emit a single
        // empty batch so the collector can record column metadata.
        if (batchIndex === 0 && getColumns().length > 0 && batchRows.length === 0 && !isAborted()) {
            yield {
                columns: getColumns(),
                rows: [],
                batchIndex: 0,
                totalRowsReceived: 0,
                truncated: false,
            };
        }
    }

    async beginTransaction(): Promise<void> {
        if (this.shared.transactionConnection) {
            throw new Error(t('database.transactionInProgress'));
        }
        if (!this.shared.pool) {
            throw new Error(t('database.notConnected'));
        }

        this.shared.transactionConnection = await this.shared.pool.getConnection();
        await this.shared.transactionConnection.beginTransaction();
        // 记录 transaction 连接的 threadId 到 activeQueryThreadIds，
        // 使用特殊 key `__transaction__`，使事务内执行的查询能够通过
        // cancelQuery 取消（否则事务路径下 queryId 不会被注册，cancelQuery
        // 会静默无操作）。与 StarrocksQueryAdapter 保持一致。
        const txThreadId = (this.shared.transactionConnection as unknown as { threadId?: number }).threadId;
        if (txThreadId !== undefined) {
            this.shared.activeQueryThreadIds.set('__transaction__', txThreadId);
        }
    }

    async commit(): Promise<void> {
        if (!this.shared.transactionConnection) {
            throw new Error(t('database.noTransactionInProgress'));
        }

        try {
            await this.shared.transactionConnection.commit();
        } finally {
            this.shared.activeQueryThreadIds.delete('__transaction__');
            this.shared.transactionConnection.release();
            this.shared.transactionConnection = null;
        }
    }

    async rollback(): Promise<void> {
        if (!this.shared.transactionConnection) {
            throw new Error(t('database.noTransactionInProgress'));
        }

        try {
            await this.shared.transactionConnection.rollback();
            this.shared.transactionConnection.release();
        } catch (rollbackError) {
            this.shared.transactionConnection.destroy();
            console.error('Rollback failed, connection destroyed:', rollbackError);
        } finally {
            this.shared.activeQueryThreadIds.delete('__transaction__');
            this.shared.transactionConnection = null;
        }
    }

    async cancelQuery(_queryId: string): Promise<void> {
        if (!this.shared.pool) {
            return;
        }

        // 先按 queryId 查找 threadId；若未找到且当前存在事务连接，则回退到
        // `__transaction__` key，以便取消在事务内执行的查询。
        let threadId = this.shared.activeQueryThreadIds.get(_queryId);
        if (threadId === undefined && this.shared.transactionConnection) {
            threadId = this.shared.activeQueryThreadIds.get('__transaction__');
        }
        if (threadId === undefined) {
            return;
        }

        try {
            const conn = await this.shared.pool.getConnection();
            try {
                await conn.query(`KILL QUERY ${threadId}`);
            } finally {
                conn.release();
            }
        } catch (e) {
            console.debug('[SQL All in One] Cancel query error:', e);
        }
    }

    protected async acquireConnectionWithTimeout(timeout: number): Promise<PoolConnection> {
        return new Promise<PoolConnection>((resolve, reject) => {
            let timedOut = false;
            const timer = setTimeout(() => {
                timedOut = true;
                reject(new Error(t('database.connectionAcquireTimeout', String(timeout))));
            }, timeout);

            this.shared.pool!.getConnection()
                .then((conn) => {
                    clearTimeout(timer);
                    if (timedOut) {
                        conn.release();
                    } else {
                        resolve(conn);
                    }
                })
                .catch((error: unknown) => {
                    clearTimeout(timer);
                    if (!timedOut) {
                        reject(error);
                    }
                });
        });
    }
}

/**
 * MySQL metadata adapter.
 *
 * Implemented as a generic over the shared-context contract so that
 * StarRocks (which reuses the mysql2 driver and exposes metadata through
 * information_schema with the same shape as MySQL) can subclass it via
 * {@link StarrocksMetadataAdapter} and only override the dialect-specific
 * database-filter and unsupported-object behaviour.
 */
export class MysqlMetadataAdapter<TShared extends IMysqlProtocolSharedContext = IMysqlProtocolSharedContext> extends BaseMetadataAdapter<TShared> {
    override async listDatabaseRows(): Promise<DatabaseInfo[]> {
        return this.runListQuery<DatabaseInfo>(
            'SHOW DATABASES',
            undefined,
            (row: QueryRow) => ({ name: row.Database as string }),
        );
    }

    async listSchemas(_database?: string): Promise<string[]> {
        return [];
    }

    async listTables(database?: string, _schema?: string, filter?: string): Promise<TableInfo[]> {
        const db = database ?? this.shared.config?.database;
        if (!db) {
            return [];
        }

        let sql = `SELECT TABLE_NAME, TABLE_TYPE, ENGINE, TABLE_ROWS, TABLE_COMMENT FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'`;
        const params: QueryParam[] = [{ value: db }];

        if (filter) {
            sql += ` AND TABLE_NAME LIKE ?`;
            params.push({ value: `%${filter}%` });
        }

        sql += ` ORDER BY TABLE_NAME`;

        return this.runListQuery<TableInfo>(sql, params, (row: QueryRow) => ({
            name: row.TABLE_NAME as string,
            type: row.TABLE_TYPE as string,
            engine: row.ENGINE as string,
            rowCount: row.TABLE_ROWS != null ? Number(row.TABLE_ROWS) : undefined,
            comment: row.TABLE_COMMENT as string,
        }));
    }

    async listViews(database?: string, _schema?: string): Promise<ViewInfo[]> {
        const db = database ?? this.shared.config?.database;
        if (!db) {
            return [];
        }

        const sql = `SELECT TABLE_NAME, TABLE_COMMENT FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'VIEW' ORDER BY TABLE_NAME`;
        return this.runListQuery<ViewInfo>(sql, [{ value: db }], (row: QueryRow) => ({
            name: row.TABLE_NAME as string,
            comment: row.TABLE_COMMENT as string,
        }));
    }

    override async listFunctions(database?: string, _schema?: string): Promise<FunctionInfo[]> {
        const db = database ?? this.shared.config?.database;
        if (!db) {
            return [];
        }

        const sql = `SELECT ROUTINE_NAME, DTD_IDENTIFIER, ROUTINE_DEFINITION FROM INFORMATION_SCHEMA.ROUTINES WHERE ROUTINE_SCHEMA = ? AND ROUTINE_TYPE = 'FUNCTION' ORDER BY ROUTINE_NAME`;
        return this.runListQuery<FunctionInfo>(sql, [{ value: db }], (row: QueryRow) => ({
            name: row.ROUTINE_NAME as string,
            returns: row.DTD_IDENTIFIER as string,
            definition: row.ROUTINE_DEFINITION as string,
        }));
    }

    override async listProcedures(database?: string, _schema?: string): Promise<ProcedureInfo[]> {
        const db = database ?? this.shared.config?.database;
        if (!db) {
            return [];
        }

        const sql = `SELECT ROUTINE_NAME, ROUTINE_DEFINITION FROM INFORMATION_SCHEMA.ROUTINES WHERE ROUTINE_SCHEMA = ? AND ROUTINE_TYPE = 'PROCEDURE' ORDER BY ROUTINE_NAME`;
        return this.runListQuery<ProcedureInfo>(sql, [{ value: db }], (row: QueryRow) => ({
            name: row.ROUTINE_NAME as string,
            definition: row.ROUTINE_DEFINITION as string,
        }));
    }

    async listTriggers(database?: string, _schema?: string): Promise<TriggerInfo[]> {
        const db = database ?? this.shared.config?.database;
        if (!db) {
            return [];
        }

        const sql = `SELECT TRIGGER_NAME, EVENT_MANIPULATION, ACTION_TIMING, ACTION_STATEMENT FROM INFORMATION_SCHEMA.TRIGGERS WHERE TRIGGER_SCHEMA = ? ORDER BY TRIGGER_NAME`;
        return this.runListQuery<TriggerInfo>(sql, [{ value: db }], (row: QueryRow) => ({
            name: row.TRIGGER_NAME as string,
            event: row.EVENT_MANIPULATION as string,
            timing: row.ACTION_TIMING as string,
            statement: row.ACTION_STATEMENT as string,
        }));
    }

    /**
     * Returns true if `name` is a built-in system database that should be
     * hidden from {@link listDatabases} results. MySQL filters out
     * information_schema / mysql / performance_schema / sys. Subclasses
     * speaking a MySQL-protocol-compatible dialect (e.g. StarRocks) override
     * this to filter their own system databases.
     */
    protected override isSystemDatabase(name: string): boolean {
        return getSystemDatabases('mysql').includes(name.toLowerCase());
    }
}

/**
 * Keys produced by MySQL EXPLAIN JSON that describe a leaf table-access node
 * inline (rather than as nested children). When walking the sub-entries of a
 * generic EXPLAIN node we skip these so they are not mistaken for child
 * operations. Used by {@link MysqlSchemaAdapter.parseGenericNode}.
 */
const EXPLAIN_SKIP_KEYS = new Set<string>([
    'table_name',
    'rows_examined',
    'key',
    'attached_condition',
    'cost_info',
]);

/**
 * MySQL schema adapter.
 *
 * Implemented as a generic over the shared-context contract so that
 * StarRocks (which reuses the mysql2 driver) can subclass it via
 * {@link StarrocksSchemaAdapter} and only override the dialect-specific
 * DDL / EXPLAIN / capabilities behaviour.
 *
 * Common scaffolding (constructor wiring, `quoteIdentifier`, `validateIdentifier`,
 * `getDialectCapabilities`, list-query / row-count / Map-accumulator helpers)
 * is inherited from {@link BaseSchemaAdapter}.
 */
export class MysqlSchemaAdapter<TShared extends IMysqlProtocolSharedContext = IMysqlProtocolSharedContext> extends BaseSchemaAdapter<TShared> {
    protected readonly quoteChar = '`' as const;

    protected override identifierMaxLength(): number {
        // MySQL/StarRocks identifiers are at most 64 characters.
        return 64;
    }

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

            const raw = (result[0].EXPLAIN ?? '{}') as string;

            let nodes: ExplainNode[] = [];
            try {
                const parsed = JSON.parse(raw) as Record<string, unknown>;
                nodes = this.parseExplainNodes(parsed);
            } catch (_e) {
                // EXPLAIN JSON may be malformed or non-JSON; fall back to empty nodes
                console.debug('[SQL All in One] Failed to parse EXPLAIN JSON, falling back to empty nodes:', _e)
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

        const tableRows = result.rows[0].TABLE_ROWS;
        return tableRows != null ? Number(tableRows) : 0;
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
            const lengthRaw = row.CHARACTER_MAXIMUM_LENGTH ?? row.NUMERIC_PRECISION ?? undefined;

            return {
                name: row.COLUMN_NAME as string,
                type: row.COLUMN_TYPE as string,
                length: lengthRaw != null ? Number(lengthRaw) : undefined,
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
                    isUnique: Number(row.Non_unique) === 0,
                    isPrimary: indexName === 'PRIMARY',
                });
            }
            indexMap.get(indexName)!.columns.push(row.Column_name as string);
        }

        return Array.from(indexMap.values());
    }

    protected async describeTableForeignKeys(database: string, table: string): Promise<ForeignKeyInfo[]> {
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

    /**
     * Parse a MySQL EXPLAIN JSON object into a flat list of explain nodes.
     *
     * This is a thin dispatcher: a top-level `query_block` is handled by
     * {@link parseQueryBlockNode} and any other top-level dictionary shape is
     * handled by {@link parseGenericNode}.
     *
     * NOTE: `idCounter` is a mutable by-ref parameter so that node ids remain
     * globally unique across the recursive walk. This mirrors the original
     * implementation and is the reason we don't return the counter alongside
     * the nodes.
     */
    private parseExplainNodes(obj: Record<string, unknown>, idCounter: { value: number } = { value: 0 }): ExplainNode[] {
        if (!obj) {
            return [];
        }

        if (obj.query_block) {
            return this.parseQueryBlockNode(obj.query_block as Record<string, unknown>, idCounter);
        }

        return this.parseGenericTopLevel(obj, idCounter);
    }

    /**
     * Parse a `query_block` EXPLAIN node: emit one node describing the block
     * (with select_id and cost_info) and recurse into every other entry, which
     * may be either a single nested object or an array of nested objects.
     */
    private parseQueryBlockNode(block: Record<string, unknown>, idCounter: { value: number }): ExplainNode[] {
        const costInfo = block.cost_info as Record<string, unknown> | undefined;
        const node: ExplainNode = {
            id: String(++idCounter.value),
            operation: block.select_id != null ? `query_block (id=${Number(block.select_id)})` : 'query_block',
            rows: costInfo?.rows_examined_per_scan != null ? Number(costInfo.rows_examined_per_scan) : undefined,
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

        return [node];
    }

    /**
     * Parse a generic (non-query_block) EXPLAIN object: each top-level entry
     * becomes its own node, with nested children recursed via
     * {@link parseGenericNode}.
     */
    private parseGenericTopLevel(obj: Record<string, unknown>, idCounter: { value: number }): ExplainNode[] {
        const nodes: ExplainNode[] = [];
        for (const [key, value] of Object.entries(obj)) {
            if (key === 'cost_info') {
                continue;
            }
            nodes.push(this.parseGenericNode(key, value, idCounter));
        }
        return nodes;
    }

    /**
     * Parse a single generic EXPLAIN entry: emit a node describing the entry
     * (reading the inline table_name / rows_examined / key / attached_condition
     * / cost_info fields if present) and recurse into any remaining object
     * sub-entries, skipping the inline keys enumerated in
     * {@link EXPLAIN_SKIP_KEYS}.
     */
    private parseGenericNode(key: string, value: unknown, idCounter: { value: number }): ExplainNode {
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
            for (const [subKey, subValue] of Object.entries(value)) {
                if (EXPLAIN_SKIP_KEYS.has(subKey)) {
                    continue;
                }
                if (typeof subValue === 'object' && subValue !== null) {
                    node.children.push(...this.parseExplainNodes(subValue as Record<string, unknown>, idCounter));
                }
            }
        }

        return node;
    }
}

/**
 * MySQL database adapter.
 *
 * Assembles the five MySQL sub-adapters (shared context, connection, query,
 * metadata, schema) via the 5 factory methods declared on
 * {@link BaseDatabaseAdapter}. All common lifecycle / status / reap logic is
 * inherited from the base class.
 */
export class MysqlAdapter extends BaseDatabaseAdapter<MysqlSharedContext> {
    protected override createSharedContext(): MysqlSharedContext {
        return new MysqlSharedContext(this);
    }
    protected override createConnectionAdapter(): IConnectionLifecycle {
        return new MysqlConnectionAdapter(this.shared);
    }
    protected override createQueryAdapter(): IQueryAdapter {
        return new MysqlQueryAdapter(this.shared);
    }
    protected override createMetadataAdapter(): IMetadataAdapter {
        return new MysqlMetadataAdapter(
            this.shared,
            (sql, params) => this.queryAdapter.execute(sql, params)
        );
    }
    protected override createSchemaAdapter(): ISchemaAdapter {
        return new MysqlSchemaAdapter(
            this.shared,
            (sql, params) => this.queryAdapter.execute(sql, params),
            (db, schema) => this.metadataAdapter.listTriggers(db, schema)
        );
    }

    static getDialectMetadata(): DialectMetadata {
        return {
            dialect: 'mysql',
            displayName: 'MySQL',
            defaultPort: 3306,
            defaultUsername: 'root',
            iconKey: 'mysql',
            supportsSshTunnel: true,
            supportsSsl: true,
            isFileBased: false
        };
    }
}
