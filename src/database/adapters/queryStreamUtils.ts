/**
 * Shared utilities for query-streaming adapters.
 *
 * Extracted here so that {@link MysqlQueryAdapter} and
 * {@link PostgresQueryAdapter} (and any future streaming adapter) can share
 * the same batch-size clamping logic without copy-paste.
 */

/**
 * Clamp the caller-supplied batch size to a sane positive integer. The
 * default of 1000 mirrors the documented contract on
 * `QueryStreamOptions.batchSize`.
 */
export function clampBatchSize(value: number | undefined): number {
    const DEFAULT = 1000;
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        return DEFAULT;
    }
    return Math.floor(value);
}
