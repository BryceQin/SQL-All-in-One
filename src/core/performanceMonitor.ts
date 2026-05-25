import { getContainer, Tokens } from './diContainer';

interface Measurement {
  name: string;
  duration: number;
  timestamp: number;
}

export class PerformanceMonitor {
  private measurements: Measurement[] = [];
  private maxMeasurements = 1000;
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
    const measurement: Measurement = {
      name,
      duration,
      timestamp: Date.now(),
    };

    this.measurements.push(measurement);

    if (this.measurements.length > this.maxMeasurements) {
      this.measurements = this.measurements.slice(-this.maxMeasurements);
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
    const relevant = name
      ? this.measurements.filter(m => m.name === name)
      : this.measurements;

    if (relevant.length === 0) {
      return { count: 0, avgDuration: 0, maxDuration: 0, minDuration: 0 };
    }

    const durations = relevant.map(m => m.duration);
    return {
      count: durations.length,
      avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
      maxDuration: Math.max(...durations),
      minDuration: Math.min(...durations),
    };
  }

  clear(): void {
    this.measurements = [];
  }
}

let instance: PerformanceMonitor | null = null;

export function getPerformanceMonitor(): PerformanceMonitor {
  if (!instance) {
    instance = new PerformanceMonitor();
  }
  return instance;
}

getContainer().registerFactory(Tokens.PerformanceMonitor, getPerformanceMonitor);
