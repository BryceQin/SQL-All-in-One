interface LRUCacheEntry<V> {
  value: V;
  timestamp: number;
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

    this.cache.delete(key);
    this.cache.set(key, entry);
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

  peek(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.timestamp > this.maxAge) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value;
  }

  delete(key: K): void {
    this.cache.delete(key);
  }

  deleteByPrefix(prefix: string): void {
    this.cache.forEach((_, key) => {
      if (String(key).startsWith(prefix)) {
        this.cache.delete(key);
      }
    });
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
  }

  size(): number {
    return this.cache.size;
  }
}
