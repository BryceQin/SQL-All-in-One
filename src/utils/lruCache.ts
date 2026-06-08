interface LRUCacheEntry<V> {
  value: V;
  timestamp: number;
}

export class LRUCache<K, V> {
  private cache = new Map<K, LRUCacheEntry<V>>();
  private maxSize: number;
  private maxAge: number;
  private lastKey: K | undefined;

  constructor(options: { maxSize?: number; maxAge?: number } = {}) {
    this.maxSize = options.maxSize ?? 100;
    this.maxAge = options.maxAge ?? 30000;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      const lruKey = this.cache.keys().next().value as K;
      this.cache.delete(lruKey);
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
    });
    this.lastKey = key;
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      return undefined;
    }

    if (Date.now() - entry.timestamp > this.maxAge) {
      this.cache.delete(key);
      if (this.lastKey === key) this.lastKey = undefined;
      return undefined;
    }

    if (this.lastKey !== key) {
      this.cache.delete(key);
      this.cache.set(key, entry);
      this.lastKey = key;
    }
    return entry.value;
  }

  has(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (Date.now() - entry.timestamp > this.maxAge) {
      this.cache.delete(key);
      if (this.lastKey === key) this.lastKey = undefined;
      return false;
    }

    if (this.lastKey !== key) {
      this.cache.delete(key);
      this.cache.set(key, entry);
      this.lastKey = key;
    }
    return true;
  }

  delete(key: K): void {
    if (this.lastKey === key) this.lastKey = undefined;
    this.cache.delete(key);
  }

  deleteByPrefix(prefix: string): void {
    const keys = [...this.cache.keys()];
    for (const key of keys) {
      if (String(key).startsWith(prefix)) {
        if (this.lastKey === key) this.lastKey = undefined;
        this.cache.delete(key);
      }
    }
  }

  *entries(): IterableIterator<[K, V]> {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp <= this.maxAge) {
        yield [key, entry.value];
      }
    }
  }

  *values(): IterableIterator<V> {
    const now = Date.now();
    for (const entry of this.cache.values()) {
      if (now - entry.timestamp <= this.maxAge) {
        yield entry.value;
      }
    }
  }

  clear(): void {
    this.cache.clear();
    this.lastKey = undefined;
  }

  size(): number {
    return this.cache.size;
  }
}
