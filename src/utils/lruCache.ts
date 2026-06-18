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

    if (this.maxAge < Infinity && Date.now() - entry.timestamp > this.maxAge) {
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
    if (!this.cache.has(key)) return false;

    if (this.maxAge < Infinity && Date.now() - this.cache.get(key)!.timestamp > this.maxAge) {
      this.cache.delete(key);
      if (this.lastKey === key) this.lastKey = undefined;
      return false;
    }

    return true;
  }

  peek(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (this.maxAge < Infinity && Date.now() - entry.timestamp > this.maxAge) {
      this.cache.delete(key);
      if (this.lastKey === key) this.lastKey = undefined;
      return undefined;
    }
    return entry.value;
  }

  delete(key: K): void {
    this.cache.delete(key);
    if (this.lastKey === key) this.lastKey = undefined;
  }

  deleteByPrefix(prefix: string): void {
    for (const key of this.cache.keys()) {
      if (String(key).startsWith(prefix)) {
        this.cache.delete(key);
        if (this.lastKey === key) this.lastKey = undefined;
      }
    }
  }

  private purgeAndGetEntries(): [K, LRUCacheEntry<V>][] {
    if (this.maxAge >= Infinity) {
      return Array.from(this.cache.entries());
    }
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > this.maxAge) {
        this.cache.delete(key);
        if (this.lastKey === key) this.lastKey = undefined;
      }
    }
    return Array.from(this.cache.entries());
  }

  *entries(): IterableIterator<[K, V]> {
    for (const [key, entry] of this.purgeAndGetEntries()) {
      yield [key, entry.value];
    }
  }

  *values(): IterableIterator<V> {
    for (const [, entry] of this.purgeAndGetEntries()) {
      yield entry.value;
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
