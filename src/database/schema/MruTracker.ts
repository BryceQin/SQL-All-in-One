/**
 * Tracks recently-used schema identifiers (database/table/column keys) in
 * most-recently-used order. Used by {@link SchemaProvider} to bias
 * completion item sorting toward items the user has selected before.
 *
 * This class encapsulates only the MRU data structure and its operations.
 * Reads (e.g. {@link isInMru} during item generation) and writes
 * (e.g. {@link addToMru} during `SchemaProvider.resolveCompletionItem`)
 * are kept on the same object so that completion item generation remains
 * a pure read while MRU updates are tied to actual user interaction.
 *
 * In addition to the general key-based MRU, a separate table-name queue
 * (populated via {@link addTableToMru} when a table completion item is
 * selected) supports {@link getRecentTables} so that the column-completion
 * fallback path can prefer tables the user actually uses instead of
 * arbitrary schema order.
 */
export class MruTracker {
    private static readonly MRU_MAX_SIZE = 50;
    private static readonly TABLE_MRU_MAX_SIZE = 20;
    private mruMap = new Map<string, true>();
    private tableMruMap = new Map<string, true>();

    /**
     * Mark a key as most-recently-used. Moves the key to the end of the
     * insertion-ordered map and evicts the oldest entry when the capacity
     * is exceeded.
     */
    addToMru(key: string): void {
        this.mruMap.delete(key);
        this.mruMap.set(key, true);
        if (this.mruMap.size > MruTracker.MRU_MAX_SIZE) {
            const oldest = this.mruMap.keys().next().value as string;
            this.mruMap.delete(oldest);
        }
    }

    /**
     * Mark a table name as most-recently-used in the table-level queue.
     * This is recorded in addition to the general key MRU so that
     * {@link getRecentTables} can return a clean table-only ordering
     * (the general map mixes database, table and column keys and cannot
     * reliably distinguish them by name alone).
     */
    addTableToMru(tableName: string): void {
        const key = tableName.toLowerCase();
        this.tableMruMap.delete(key);
        this.tableMruMap.set(key, true);
        if (this.tableMruMap.size > MruTracker.TABLE_MRU_MAX_SIZE) {
            const oldest = this.tableMruMap.keys().next().value as string;
            this.tableMruMap.delete(oldest);
        }
    }

    /** Returns true when the key has been recorded in the MRU cache. */
    isInMru(key: string): boolean {
        return this.mruMap.has(key);
    }

    /** Returns the MRU keys in insertion order (oldest first). */
    getMruKeys(): IterableIterator<string> {
        return this.mruMap.keys();
    }

    /**
     * Returns recently-used table names in most-recently-used order
     * (most recent first). Useful for ranking tables when generating
     * column completions without an explicit alias map.
     */
    getRecentTables(): string[] {
        const keys = Array.from(this.tableMruMap.keys());
        keys.reverse();
        return keys;
    }

    /** Remove all entries from the MRU cache. */
    clear(): void {
        this.mruMap.clear();
        this.tableMruMap.clear();
    }

    dispose(): void {
        this.mruMap.clear();
        this.tableMruMap.clear();
    }
}
