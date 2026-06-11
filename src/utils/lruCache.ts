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

    if (this.maxAge < Infinity && Date.now() - entry.timestamp > this.maxAge) {
      this.cache.delete(key);
      return undefined;
    }

    // If the key is already the most recently inserted, skip delete+set
    const lastKey = Array.from(this.cache.keys()).pop();
    if (lastKey === key) {
      return entry.value;
    }

    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  has(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (this.maxAge < Infinity && Date.now() - entry.timestamp > this.maxAge) {
      this.cache.delete(key);
      return false;
    }

    // Update access order to be consistent with get()
    this.cache.delete(key);
    this.cache.set(key, entry);
    return true;
}

  peek(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (this.maxAge < Infinity && Date.now() - entry.timestamp > this.maxAge) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value;
  }

  delete(key: K): void {
    this.cache.delete(key);
  }

  deleteByPrefix(prefix: string): void {
    const keysToDelete: K[] = [];
    for (const key of this.cache.keys()) {
      if (String(key).startsWith(prefix)) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
  }

  *entries(): IterableIterator<[K, V]> {
    if (this.maxAge >= Infinity) {
      for (const [key, entry] of this.cache) {
        yield [key, entry.value];
      }
    } else {
      const now = Date.now();
      const expiredKeys: K[] = [];
      for (const [key, entry] of this.cache) {
        if (now - entry.timestamp > this.maxAge) {
          expiredKeys.push(key);
        } else {
          yield [key, entry.value];
        }
      }
      for (const key of expiredKeys) {
        this.cache.delete(key);
      }
    }
  }

  *values(): IterableIterator<V> {
    if (this.maxAge >= Infinity) {
      for (const entry of this.cache.values()) {
        yield entry.value;
      }
    } else {
      const now = Date.now();
      const expiredKeys: K[] = [];
      for (const [key, entry] of this.cache) {
        if (now - entry.timestamp > this.maxAge) {
          expiredKeys.push(key);
        } else {
          yield entry.value;
        }
      }
      for (const key of expiredKeys) {
        this.cache.delete(key);
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
