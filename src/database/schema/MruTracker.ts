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
 */
export class MruTracker {
    private static readonly MRU_MAX_SIZE = 50;
    private mruMap = new Map<string, true>();

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

    /** Returns true when the key has been recorded in the MRU cache. */
    isInMru(key: string): boolean {
        return this.mruMap.has(key);
    }

    /** Returns the MRU keys in insertion order (oldest first). */
    getMruKeys(): IterableIterator<string> {
        return this.mruMap.keys();
    }

    /** Remove all entries from the MRU cache. */
    clear(): void {
        this.mruMap.clear();
    }

    dispose(): void {
        this.mruMap.clear();
    }
}
