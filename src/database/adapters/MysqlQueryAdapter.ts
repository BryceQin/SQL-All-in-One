import type { IQueryAdapter, QueryResult, QueryRow, QueryParam, SqlStatement, QueryStreamOptions, StreamBatch, ColumnMeta } from './IDatabaseAdapter';
import type { Pool, PoolConnection, RowDataPacket, FieldPacket, ResultSetHeader, QueryResult as MysqlQueryResult } from 'mysql2/promise';
import type { IMysqlProtocolSharedContext } from './MysqlSharedContext';
import type { Readable } from 'stream';
import { t } from '../../i18n/index';
import { generateShortId } from '../../utils/idGenerator';

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
}

/**
 * MySQL query adapter.
 *
 * Implemented as a generic over the shared-context contract so that
 * StarRocks (which reuses the mysql2 driver) can subclass it via
 * {@link StarrocksQueryAdapter} and only override the dialect-specific
 * transaction/cancel behaviour.
 */
export class MysqlQueryAdapter<TShared extends IMysqlProtocolSharedContext = IMysqlProtocolSharedContext> implements IQueryAdapter {
    constructor(protected shared: TShared) {}

    async execute(sql: string, params?: QueryParam[]): Promise<QueryResult> {
        const startTime = Date.now();
        const queryId = generateShortId('query');

        if (!this.shared.pool) {
            const executionTime = Date.now() - startTime;
            return {
                queryId,
                status: 'error',
                columns: [],
                rows: [],
                rowCount: 0,
                executionTime,
                error: {
                    code: 'NOT_CONNECTED',
                    message: t('database.notConnected'),
                    sql,
                },
                database: this.shared.config?.database,
            };
        }

        this.shared.lastActivityTime = Date.now();
        const values = params?.map(p => p.value);
        const acquireTimeout = this.shared.config?.poolConfig?.acquireTimeout ?? 60000;

        try {
            return await this.withAcquiredConnection(acquireTimeout, queryId, async (conn) => {
                const [result, fields] = await conn.query(sql, values);
                const executionTime = Date.now() - startTime;
                return this.mapResultToQueryResult(result, fields, sql, queryId, executionTime);
            });
        } catch (error: unknown) {
            const executionTime = Date.now() - startTime;
            return this.mapMysqlError(error, sql, queryId, executionTime);
        }
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

    async executeBatch(statements: SqlStatement[]): Promise<QueryResult[]> {
        const results: QueryResult[] = [];
        for (const stmt of statements) {
            results.push(await this.execute(stmt.sql, stmt.params));
        }
        return results;
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
        let fieldsEmitted = false;

        const fieldsPromise = new Promise<void>((resolve) => {
            query.on('fields', (fields: FieldPacket[]) => {
                fieldsEmitted = true;
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
            });
            // If the query is a non-SELECT (no fields), resolve immediately so
            // the consumer still receives a first (empty) batch.
            query.on('end', () => {
                if (!fieldsEmitted) {
                    resolve();
                }
            });
            query.on('error', () => {
                if (!fieldsEmitted) {
                    resolve();
                }
            });
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

        // Flush any remaining rows as the final batch.
        if (!truncated && batchRows.length > 0 && !isAborted()) {
            yield {
                columns: batchIndex === 0 ? getColumns() : [],
                rows: batchRows,
                batchIndex,
                totalRowsReceived,
                truncated: false,
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
    }

    async commit(): Promise<void> {
        if (!this.shared.transactionConnection) {
            throw new Error(t('database.noTransactionInProgress'));
        }

        try {
            await this.shared.transactionConnection.commit();
        } finally {
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
            this.shared.transactionConnection = null;
        }
    }

    async cancelQuery(_queryId: string): Promise<void> {
        if (!this.shared.pool) {
            return;
        }

        const threadId = this.shared.activeQueryThreadIds.get(_queryId);
        if (!threadId) {
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
 * Clamp the caller-supplied batch size to a sane positive integer. The
 * default of 1000 mirrors the documented contract on
 * {@link QueryStreamOptions.batchSize}.
 */
function clampBatchSize(value: number | undefined): number {
    const DEFAULT = 1000;
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        return DEFAULT;
    }
    return Math.floor(value);
}
