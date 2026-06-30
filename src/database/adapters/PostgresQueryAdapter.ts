import type { IQueryAdapter, QueryResult, QueryRow, QueryParam, SqlStatement, QueryStreamOptions, StreamBatch, ColumnMeta } from './IDatabaseAdapter';
import type { PoolClient, QueryResult as PgQueryResult } from 'pg';
import type { PostgresSharedContext } from './PostgresSharedContext';
import { t } from '../../i18n/index';
import { generateShortId } from '../../utils/idGenerator';

export class PostgresQueryAdapter implements IQueryAdapter {
    constructor(private shared: PostgresSharedContext) {}

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

        try {
            this.shared.lastActivityTime = Date.now();
            const values = params?.map(p => p.value);
            let queryConn: PoolClient | typeof this.shared.pool = this.shared.transactionClient ?? this.shared.pool;
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
                const pid = typeof clientPid === 'number' && clientPid > 0
                    ? clientPid
                    : ((await acquiredClient.query('SELECT pg_backend_pid() AS pid')).rows[0] as Record<string, unknown>)?.pid as number;
                this.shared.activeQueryPids.set(queryId, pid);
            }

            try {
                const pgResult: PgQueryResult = await queryConn.query(sql, values);
                const executionTime = Date.now() - startTime;

                const columns = pgResult.fields.map(field => ({
                    name: field.name,
                    type: String(field.dataTypeID ?? 'UNKNOWN'),
                    nullable: true,
                    isPrimaryKey: false,
                    isAutoIncrement: false,
                    isEnum: false,
                }));

                return {
                    queryId,
                    status: 'success',
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
        } catch (error: unknown) {
            const executionTime = Date.now() - startTime;
            const pgError = error as { code?: string; message?: string };
            return {
                queryId,
                status: 'error',
                columns: [],
                rows: [],
                rowCount: 0,
                executionTime,
                error: {
                    code: pgError.code ?? 'EXEC_ERROR',
                    message: error instanceof Error ? error.message : String(error),
                    sql,
                },
                database: this.shared.config?.database,
            };
        }
    }

    async executeBatch(statements: SqlStatement[]): Promise<QueryResult[]> {
        const results: QueryResult[] = [];
        for (const stmt of statements) {
            results.push(await this.execute(stmt.sql, stmt.params));
        }
        return results;
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
            throw new Error(t('database.notConnected'));
        }

        const batchSize = clampBatchSize(options?.batchSize);
        const maxRows = options?.maxRows;
        const values = options?.params?.map(p => p.value);
        const signal = options?.signal;

        // Reuse the user's transaction client if present; otherwise acquire a
        // fresh client and wrap the cursor in an internal transaction.
        const useTransactionClient = !!this.shared.transactionClient;
        const client: PoolClient = useTransactionClient
            ? this.shared.transactionClient!
            : await this.shared.pool.connect();
        if (!useTransactionClient) {
            this.shared.activeConnectionCount++;
        }

        const cursorName = `sai_stream_${generateShortId('cur').replace(/-/g, '_')}`;
        let beganInternalTransaction = false;
        let columns: ColumnMeta[] = [];
        let batchIndex = 0;
        let totalRowsReceived = 0;
        let truncated = false;
        let abortedError: Error | null = null;

        const onAbort = (): void => {
            abortedError = new Error('Query stream aborted');
        };
        if (signal) {
            if (signal.aborted) {
                onAbort();
            } else {
                signal.addEventListener('abort', onAbort, { once: true });
            }
        }

        try {
            if (!useTransactionClient) {
                await client.query('BEGIN');
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
                    abortedError = new Error('Query stream aborted');
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
            } catch { /* ignore: cursor cleanup is best-effort */ }

            if (beganInternalTransaction) {
                try {
                    if (abortedError) {
                        await client.query('ROLLBACK');
                    } else {
                        await client.query('COMMIT');
                    }
                } catch { /* ignore: tx cleanup is best-effort */ }
            }

            if (signal) {
                signal.removeEventListener('abort', onAbort);
            }

            if (!useTransactionClient) {
                this.shared.activeConnectionCount--;
                client.release();
            }
        }
    }

    async beginTransaction(): Promise<void> {
        if (this.shared.transactionClient) {
            throw new Error(t('database.transactionInProgress'));
        }
        if (!this.shared.pool) {
            throw new Error(t('database.notConnected'));
        }

        this.shared.transactionClient = await this.shared.pool.connect();
        await this.shared.transactionClient.query('BEGIN');
    }

    async commit(): Promise<void> {
        if (!this.shared.transactionClient) {
            throw new Error(t('database.noTransactionInProgress'));
        }

        try {
            await this.shared.transactionClient.query('COMMIT');
        } finally {
            this.shared.transactionClient.release();
            this.shared.transactionClient = null;
        }
    }

    async rollback(): Promise<void> {
        if (!this.shared.transactionClient) {
            throw new Error(t('database.noTransactionInProgress'));
        }

        try {
            await this.shared.transactionClient.query('ROLLBACK');
            this.shared.transactionClient.release();
        } catch (rollbackError) {
            console.error('PG rollback failed:', rollbackError);
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
            console.debug('[SQL All in One] PG cancel query error:', e);
        }
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

/**
 * Convert pg column field metadata to the shared {@link ColumnMeta} shape.
 * pg does not expose primary-key / auto-increment flags on result fields, so
 * those default to false (matching the existing {@link PostgresQueryAdapter.execute} behavior).
 */
function mapPgFields(fields: PgQueryResult['fields']): ColumnMeta[] {
    return fields.map(field => ({
        name: field.name,
        type: String(field.dataTypeID ?? 'UNKNOWN'),
        nullable: true,
        isPrimaryKey: false,
        isAutoIncrement: false,
        isEnum: false,
    }));
}
