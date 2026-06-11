import { getContainer, Tokens } from './diContainer';
import { LRUCache } from '../utils/lruCache';

interface AggregateStats {
  count: number;
  totalDuration: number;
  maxDuration: number;
  minDuration: number;
}

export class PerformanceMonitor {
    private static readonly MAX_STATS_ENTRIES = 200;
    private aggregateStats = new LRUCache<string, AggregateStats>({ maxSize: PerformanceMonitor.MAX_STATS_ENTRIES, maxAge: 3600000 });
    private enabled = false;
    private slowThreshold = 100;

    setEnabled(enabled: boolean): void { this.enabled = enabled; }

    isEnabled(): boolean { return this.enabled; }

    measure<T>(name: string, fn: () => T): T {
        if (!this.enabled) return fn();
        const start = performance.now();
        try {
            return fn();
        } finally {
            const duration = performance.now() - start;
            this.recordMeasurement(name, duration);
        }
    }

    async measureAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
        if (!this.enabled) return fn();
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

    if (this.aggregateStats.size() === 0) {
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

    if (totalCount === 0) {
      return { count: 0, avgDuration: 0, maxDuration: 0, minDuration: 0 };
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

  dispose(): void {
    this.aggregateStats.clear();
  }
}

export function createPerformanceMonitor(): PerformanceMonitor {
  return new PerformanceMonitor();
}

export function getPerformanceMonitor(): PerformanceMonitor {
  return getContainer().get<PerformanceMonitor>(Tokens.PerformanceMonitor);
}
