interface AggregateStats {
  count: number;
  totalDuration: number;
  maxDuration: number;
  minDuration: number;
}

export class PerformanceMonitor {
  private aggregateStats = new Map<string, AggregateStats>();
  private slowThreshold = 100;

  measure<T>(name: string, fn: () => T): T {
    const start = performance.now();
    try {
      return fn();
    } finally {
      const duration = performance.now() - start;
      this.recordMeasurement(name, duration);
    }
  }

  async measureAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      return await fn();
    } finally {
      const duration = performance.now() - start;
      this.recordMeasurement(name, duration);
    }
  }

  private recordMeasurement(name: string, duration: number): void {
    const existing = this.aggregateStats.get(name);
    if (existing) {
      existing.count += 1;
      existing.totalDuration += duration;
      if (duration > existing.maxDuration) existing.maxDuration = duration;
      if (duration < existing.minDuration) existing.minDuration = duration;
    } else {
      this.aggregateStats.set(name, {
        count: 1,
        totalDuration: duration,
        maxDuration: duration,
        minDuration: duration,
      });
    }

    if (duration > this.slowThreshold) {
      console.warn(`[Performance] Slow operation: ${name} took ${duration.toFixed(2)}ms`);
    }
  }

  getStats(name?: string): {
    count: number;
    avgDuration: number;
    maxDuration: number;
    minDuration: number;
  } {
    if (name) {
      const stats = this.aggregateStats.get(name);
      if (!stats) {
        return { count: 0, avgDuration: 0, maxDuration: 0, minDuration: 0 };
      }
      return {
        count: stats.count,
        avgDuration: stats.totalDuration / stats.count,
        maxDuration: stats.maxDuration,
        minDuration: stats.minDuration,
      };
    }

    if (this.aggregateStats.size === 0) {
      return { count: 0, avgDuration: 0, maxDuration: 0, minDuration: 0 };
    }

    let totalCount = 0;
    let totalDuration = 0;
    let maxDuration = -Infinity;
    let minDuration = Infinity;

    for (const stats of this.aggregateStats.values()) {
      totalCount += stats.count;
      totalDuration += stats.totalDuration;
      if (stats.maxDuration > maxDuration) maxDuration = stats.maxDuration;
      if (stats.minDuration < minDuration) minDuration = stats.minDuration;
    }

    return {
      count: totalCount,
      avgDuration: totalDuration / totalCount,
      maxDuration,
      minDuration,
    };
  }

  clear(): void {
    this.aggregateStats.clear();
  }
}

let instance: PerformanceMonitor | null = null;

export function getPerformanceMonitor(): PerformanceMonitor {
  if (!instance) {
    instance = new PerformanceMonitor();
  }
  return instance;
}
