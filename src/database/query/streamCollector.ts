import type { ColumnMeta, QueryResult, QueryRow, StreamBatch } from "../adapters/IDatabaseAdapter";

/**
 * Input for {@link collectStreamToResult}.
 *
 * The caller (typically {@link QueryExecutor}) provides the stream produced
 * by {@link IDatabaseAdapter.executeStream} along with the metadata required
 * to build a {@link QueryResult} that is API-compatible with the non-streaming
 * {@link IDatabaseAdapter.execute} path.
 */
export interface CollectStreamToResultOptions {
    /**
     * The async iterable yielded by {@link IDatabaseAdapter.executeStream}.
     */
    stream: AsyncIterable<StreamBatch>;
    /**
     * The query id to assign to the resulting {@link QueryResult}.
     */
    queryId: string;
    /**
     * Maximum number of rows to retain in the final {@link QueryResult.rows}.
     * The collector stops pulling from the stream once this limit is reached.
     */
    maxRows: number;
    /**
     * Elapsed time (ms) to report on the result. The caller is responsible
     * for measuring total wall-clock time, since it owns the start instant.
     */
    executionTime: number;
    /**
     * Optional database name to attach to the result.
     */
    database?: string;
    /**
     * Optional SQL text, included in error results when the stream throws.
     */
    sql?: string;
}

/**
 * Drain an {@link IDatabaseAdapter.executeStream} async iterable into a fully
 * materialized {@link QueryResult}.
 *
 * This bridges the streaming adapter contract back to the non-streaming
 * {@link QueryResult} shape so that {@link QueryExecutor.execute} can keep
 * its existing public API. The streaming path is the memory win: rows are
 * pulled lazily from the adapter, so the underlying driver never buffers the
 * entire result set in one shot.
 *
 * Behavior contract (verified by streaming.test.ts):
 *
 * - The first batch's `columns` populate the result's column metadata.
 * - Rows accumulate up to `maxRows`; the stream is abandoned (no further
 *   pulls) once the cap is reached.
 * - If a batch reports `truncated === true` the collector stops pulling
 *   further batches.
 * - If the stream throws, the error is converted to a `status: 'error'`
 *   {@link QueryResult} (code `STREAM_ERROR`) so callers see the same
 *   error-shape they would from {@link IDatabaseAdapter.execute}.
 */
export async function collectStreamToResult(options: CollectStreamToResultOptions): Promise<QueryResult> {
    const { stream, queryId, maxRows, executionTime, database, sql } = options;

    const columns: ColumnMeta[] = [];
    const rows: QueryRow[] = [];
    let rowCount = 0;
    let truncated = false;

    try {
        for await (const batch of stream) {
            if (batch.columns.length > 0 && columns.length === 0) {
                for (const col of batch.columns) {
                    columns.push(col);
                }
            }

            if (batch.rows.length > 0) {
                const remaining = maxRows - rows.length;
                if (remaining <= 0) {
                    truncated = true;
                    break;
                }
                if (batch.rows.length <= remaining) {
                    for (const row of batch.rows) {
                        rows.push(row);
                    }
                } else {
                    for (let i = 0; i < remaining; i++) {
                        rows.push(batch.rows[i]);
                    }
                    truncated = true;
                }
            }

            rowCount = batch.totalRowsReceived;

            if (batch.truncated) {
                truncated = true;
                break;
            }

            if (rows.length >= maxRows) {
                truncated = true;
                break;
            }
        }
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            queryId,
            status: "error",
            columns,
            rows,
            rowCount: rows.length,
            executionTime,
            error: {
                code: "STREAM_ERROR",
                message,
                sql,
            },
            database,
        };
    }

    // Prefer the adapter-reported running tally; fall back to what we kept.
    // When the stream was truncated we intentionally report `rowCount` as
    // the number of rows we retained (matching rows.length) so downstream
    // pagination logic does not assume there are more rows than we hold.
    const reportedRowCount = truncated ? rows.length : rowCount > 0 ? rowCount : rows.length;

    // `truncated` is intentionally not surfaced on the returned QueryResult:
    // the QueryResult interface is shared with the non-streaming path and
    // adding optional fields there would widen the contract for every caller.
    // The truncation state is reflected via rowCount === rows.length and via
    // the QueryExecutor-level logging.
    return {
        queryId,
        status: "success",
        columns,
        rows,
        rowCount: reportedRowCount,
        executionTime,
        database,
    };
}
