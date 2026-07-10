// ---------------------------------------------------------------------------
// Doubly-linked list node for LRU ordering
// ---------------------------------------------------------------------------

interface LRUNode<K, V> {
    key: K;
    value: V;
    timestamp: number;
    prev: LRUNode<K, V> | null;
    next: LRUNode<K, V> | null;
}

// ---------------------------------------------------------------------------
// LRUCache – O(1) get / set / delete via doubly-linked list + Map
//
// Additional optimisations over the previous implementation:
//  • True O(1) LRU reordering (no delete+re-insert on every get)
//  • Removed the single-key `lastKey` micro-optimisation
//  • Prefix grouping index makes deleteByPrefix O(k) instead of O(n)
// ---------------------------------------------------------------------------

export class LRUCache<K, V> {
    private map = new Map<K, LRUNode<K, V>>();
    private maxSize: number;
    private maxAge: number;

    // Doubly-linked list sentinels – head.next is MRU, tail.prev is LRU
    private head: LRUNode<K, V>;
    private tail: LRUNode<K, V>;

    // Prefix grouping index: prefix string -> Set of keys whose String(key) starts with prefix.
    // Populated lazily on first deleteByPrefix call so caches that never use deleteByPrefix
    // pay zero overhead.
    private prefixIndex: Map<string, Set<K>> | null = null;
    private prefixIndexBuilt = false;

    constructor(options: { maxSize?: number; maxAge?: number } = {}) {
        this.maxSize = options.maxSize ?? 100;
        this.maxAge = options.maxAge ?? 30000;

        // Circular sentinel nodes – they never hold real data
        this.head = { key: null as K, value: null as V, timestamp: 0, prev: null, next: null };
        this.tail = { key: null as K, value: null as V, timestamp: 0, prev: null, next: null };
        this.head.next = this.tail;
        this.tail.prev = this.head;
    }

    // -----------------------------------------------------------------------
    // Internal linked-list helpers
    // -----------------------------------------------------------------------

    /** Detach a node from the list (does not remove from map). */
    private detachNode(node: LRUNode<K, V>): void {
        node.prev!.next = node.next;
        node.next!.prev = node.prev;
    }

    /** Insert node right after head (most-recently-used position). */
    private insertAtHead(node: LRUNode<K, V>): void {
        node.prev = this.head;
        node.next = this.head.next;
        this.head.next!.prev = node;
        this.head.next = node;
    }

    /** Move an existing node to the MRU position. */
    private moveToHead(node: LRUNode<K, V>): void {
        this.detachNode(node);
        this.insertAtHead(node);
    }

    /** Remove the LRU node (the one just before tail sentinel). */
    private removeLRU(): LRUNode<K, V> | null {
        const lru = this.tail.prev!;
        if (lru === this.head) {
            return null; // list is empty
        }
        this.detachNode(lru);
        return lru;
    }

    // -----------------------------------------------------------------------
    // Prefix index helpers
    // -----------------------------------------------------------------------

    private ensurePrefixIndex(): Map<string, Set<K>> {
        if (!this.prefixIndex) {
            this.prefixIndex = new Map();
        }
        if (!this.prefixIndexBuilt) {
            this.rebuildPrefixIndex();
            this.prefixIndexBuilt = true;
        }
        return this.prefixIndex;
    }

    private rebuildPrefixIndex(): void {
        if (!this.prefixIndex) {
            this.prefixIndex = new Map();
        }
        this.prefixIndex.clear();
        for (const key of this.map.keys()) {
            this.addToPrefixIndex(key);
        }
    }

    /** Add a single key to the prefix index. */
    private addToPrefixIndex(key: K): void {
        if (!this.prefixIndex) {
            return;
        }
        const keyStr = String(key);
        // Index all prefix boundaries: we split on common delimiters used in
        // cache keys (e.g. "uri::dialect" -> index "uri" and "uri::dialect").
        // For correctness with arbitrary prefixes we index every prefix from
        // the start of the string up to and including each delimiter.
        const delimiters = ["::", ":", "/", "\\", ".", "-"];
        const added = new Set<string>();
        for (const delim of delimiters) {
            let idx = keyStr.indexOf(delim);
            while (idx !== -1) {
                const prefix = keyStr.substring(0, idx + delim.length);
                if (!added.has(prefix)) {
                    added.add(prefix);
                    let set = this.prefixIndex.get(prefix);
                    if (!set) {
                        set = new Set();
                        this.prefixIndex.set(prefix, set);
                    }
                    set.add(key);
                }
                idx = keyStr.indexOf(delim, idx + delim.length);
            }
        }
        // Also index the full key string as a prefix so that
        // deleteByPrefix with the full key works in O(1).
        if (!added.has(keyStr)) {
            let set = this.prefixIndex.get(keyStr);
            if (!set) {
                set = new Set();
                this.prefixIndex.set(keyStr, set);
            }
            set.add(key);
        }
    }

    /** Remove a single key from the prefix index. */
    private removeFromPrefixIndex(key: K): void {
        if (!this.prefixIndex || !this.prefixIndexBuilt) {
            return;
        }
        const keyStr = String(key);
        const delimiters = ["::", ":", "/", "\\", ".", "-"];
        const removed = new Set<string>();
        for (const delim of delimiters) {
            let idx = keyStr.indexOf(delim);
            while (idx !== -1) {
                const prefix = keyStr.substring(0, idx + delim.length);
                if (!removed.has(prefix)) {
                    removed.add(prefix);
                    const set = this.prefixIndex.get(prefix);
                    if (set) {
                        set.delete(key);
                        if (set.size === 0) {
                            this.prefixIndex.delete(prefix);
                        }
                    }
                }
                idx = keyStr.indexOf(delim, idx + delim.length);
            }
        }
        if (!removed.has(keyStr)) {
            const set = this.prefixIndex.get(keyStr);
            if (set) {
                set.delete(key);
                if (set.size === 0) {
                    this.prefixIndex.delete(keyStr);
                }
            }
        }
    }

    // -----------------------------------------------------------------------
    // TTL helper
    // -----------------------------------------------------------------------

    private isExpired(node: LRUNode<K, V>): boolean {
        return this.maxAge < Infinity && Date.now() - node.timestamp > this.maxAge;
    }

    /** Remove a node from both the list and the map (and prefix index). */
    private evictNode(node: LRUNode<K, V>): void {
        this.detachNode(node);
        this.map.delete(node.key);
        // Only maintain the prefix index if it has been built; otherwise the
        // index is null/empty and rebuildPrefixIndex() will reconstruct it on
        // the next deleteByPrefix call.
        if (this.prefixIndexBuilt) {
            this.removeFromPrefixIndex(node.key);
        }
    }

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    set(key: K, value: V): void {
        const existing = this.map.get(key);
        if (existing) {
            // Update value & timestamp, move to MRU
            existing.value = value;
            existing.timestamp = Date.now();
            this.moveToHead(existing);
            return;
        }

        // Evict LRU entries if at capacity
        while (this.map.size >= this.maxSize) {
            const lru = this.removeLRU();
            if (lru) {
                this.map.delete(lru.key);
                if (this.prefixIndexBuilt) {
                    this.removeFromPrefixIndex(lru.key);
                }
            }
        }

        const node: LRUNode<K, V> = {
            key,
            value,
            timestamp: Date.now(),
            prev: null,
            next: null,
        };
        this.insertAtHead(node);
        this.map.set(key, node);
        // Only maintain the prefix index if it has been built; caches that never
        // call deleteByPrefix pay zero indexing overhead.
        if (this.prefixIndexBuilt) {
            this.addToPrefixIndex(key);
        }
    }

    get(key: K): V | undefined {
        const node = this.map.get(key);
        if (!node) {
            return undefined;
        }
        if (this.isExpired(node)) {
            this.evictNode(node);
            return undefined;
        }
        this.moveToHead(node);
        return node.value;
    }

    has(key: K): boolean {
        const node = this.map.get(key);
        if (!node) {
            return false;
        }
        if (this.isExpired(node)) {
            this.evictNode(node);
            return false;
        }
        return true;
    }

    peek(key: K): V | undefined {
        const node = this.map.get(key);
        if (!node) {
            return undefined;
        }
        if (this.isExpired(node)) {
            this.evictNode(node);
            return undefined;
        }
        return node.value;
    }

    delete(key: K): void {
        const node = this.map.get(key);
        if (node) {
            this.evictNode(node);
        }
    }

    deleteByPrefix(prefix: string): void {
        const idx = this.ensurePrefixIndex();
        const matching = idx.get(prefix);
        if (matching) {
            // Iterate over a snapshot so deletion during iteration is safe
            for (const key of Array.from(matching)) {
                this.delete(key);
            }
        }
    }

    *entries(): IterableIterator<[K, V]> {
        // Walk from MRU to LRU, skipping expired entries
        let current = this.head.next!;
        while (current !== this.tail) {
            const nextNode = current.next!; // save before potential eviction
            if (this.isExpired(current)) {
                this.evictNode(current);
            } else {
                yield [current.key, current.value];
            }
            current = nextNode;
        }
    }

    *values(): IterableIterator<V> {
        let current = this.head.next!;
        while (current !== this.tail) {
            const nextNode = current.next!;
            if (this.isExpired(current)) {
                this.evictNode(current);
            } else {
                yield current.value;
            }
            current = nextNode;
        }
    }

    clear(): void {
        this.map.clear();
        this.head.next = this.tail;
        this.tail.prev = this.head;
        if (this.prefixIndex) {
            this.prefixIndex.clear();
            this.prefixIndexBuilt = false;
        }
    }

    size(): number {
        // Purge expired entries first for an accurate count
        if (this.maxAge < Infinity) {
            let current = this.tail.prev!;
            while (current !== this.head) {
                const prevNode = current.prev!;
                if (this.isExpired(current)) {
                    this.evictNode(current);
                }
                current = prevNode;
            }
        }
        return this.map.size;
    }
}
