interface LRUCacheEntry<V> {
  value: V;
  timestamp: number;
  lastAccessed: number;
}

export class LRUCache<K, V> {
  private cache = new Map<K, LRUCacheEntry<V>>();
  private maxSize: number;
  private maxAge: number;

  constructor(options: { maxSize?: number; maxAge?: number } = {}) {
    this.maxSize = options.maxSize ?? 100;
    this.maxAge = options.maxAge ?? 30000;
  }

  set(key: K, value: V): void {
    this.evictIfNeeded();

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      lastAccessed: Date.now(),
    });
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      return undefined;
    }

    if (Date.now() - entry.timestamp > this.maxAge) {
      this.cache.delete(key);
      return undefined;
    }

    entry.lastAccessed = Date.now();
    return entry.value;
  }

  has(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (Date.now() - entry.timestamp > this.maxAge) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  delete(key: K): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  private evictIfNeeded(): void {
    if (this.cache.size >= this.maxSize) {
      const entries = Array.from(this.cache.entries());
      entries.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);

      const toRemove = Math.max(1, Math.floor(this.maxSize * 0.2));
      for (let i = 0; i < toRemove; i++) {
        if (entries[i]) {
          this.cache.delete(entries[i][0]);
        }
      }
    }
  }
}
