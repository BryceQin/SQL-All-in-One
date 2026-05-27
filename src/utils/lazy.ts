export class Lazy<T> {
  private instance: T | null = null;
  private factory: () => T;
  private initialized = false;

  constructor(factory: () => T) {
    this.factory = factory;
  }

  get(): T {
    if (!this.initialized) {
      this.instance = this.factory();
      this.initialized = true;
    }
    return this.instance as T;
  }

  get isInitialized(): boolean {
    return this.initialized;
  }

  reset(): void {
    this.instance = null;
    this.initialized = false;
  }

  dispose(): void {
    if (this.initialized && this.instance !== null) {
      const obj = this.instance as Record<string, unknown>;
      if (typeof obj.dispose === 'function') {
        (obj as { dispose: () => void }).dispose();
      }
    }
    this.instance = null;
    this.initialized = false;
  }
}

export function lazy<T>(factory: () => T): Lazy<T> {
  return new Lazy(factory);
}

export class LazyAsync<T> {
  private instance: T | null = null;
  private factory: () => Promise<T>;
  private promise: Promise<T> | null = null;
  private initialized = false;

  constructor(factory: () => Promise<T>) {
    this.factory = factory;
  }

  async get(): Promise<T> {
    if (this.initialized && this.instance !== null) {
      return this.instance;
    }

    if (this.promise !== null) {
      return this.promise;
    }

    this.promise = this.factory();
    this.instance = await this.promise;
    this.initialized = true;
    this.promise = null;
    return this.instance;
  }

  get isInitialized(): boolean {
    return this.initialized;
  }
}

export function lazyAsync<T>(factory: () => Promise<T>): LazyAsync<T> {
  return new LazyAsync(factory);
}
