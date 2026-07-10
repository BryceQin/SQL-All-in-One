import { getContainer, Tokens } from "./diContainer";
import { getConfigManager } from "./configManager";
import { LRUCache } from "../utils/lruCache";

export type MonitorLevel = "off" | "light" | "full";

interface AggregateStats {
    count: number;
    totalDuration: number;
    maxDuration: number;
    minDuration: number;
}

export class PerformanceMonitor {
    private static readonly MAX_STATS_ENTRIES = 200;
    private aggregateStats = new LRUCache<string, AggregateStats>({ maxSize: PerformanceMonitor.MAX_STATS_ENTRIES, maxAge: 3600000 });
    private monitorLevel: MonitorLevel = "light";
    private slowThreshold = 100;
    private configDisposable: import("vscode").Disposable | undefined;
    // 慢操作告警节流：同一操作名 60 秒内只 warn 一次，避免刷屏
    private slowOpWarnedAt = new Map<string, number>();
    private static readonly SLOW_OP_WARN_THROTTLE_MS = 60000;

    constructor() {
        this.refreshConfig();
        try {
            this.configDisposable = getConfigManager().onConfigChange(() => {
                this.refreshConfig();
            });
        } catch (e) {
            // ConfigManager may not be available in tests
            console.debug("[SQL All in One] PerformanceMonitor: ConfigManager not available for config change subscription:", e);
        }
    }

    private refreshConfig(): void {
        try {
            const cfg = getConfigManager();
            this.monitorLevel = cfg.get<MonitorLevel>("performance.monitorLevel", "light");
        } catch (e) {
            // ConfigManager may not be available in tests
            console.debug("[SQL All in One] PerformanceMonitor: ConfigManager not available for config refresh:", e);
        }
    }

    setMonitorLevel(level: MonitorLevel): void {
        this.monitorLevel = level;
    }

    getMonitorLevel(): MonitorLevel {
        return this.monitorLevel;
    }

    /** @deprecated Use setMonitorLevel instead */
    setEnabled(enabled: boolean): void {
        this.monitorLevel = enabled ? "full" : "off";
    }

    isEnabled(): boolean {
        return this.monitorLevel !== "off";
    }

    measure<T>(name: string, fn: () => T): T {
        if (this.monitorLevel === "off") return fn();
        const start = performance.now();
        try {
            return fn();
        } finally {
            const duration = performance.now() - start;
            this.recordMeasurement(name, duration);
        }
    }

    async measureAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
        if (this.monitorLevel === "off") return fn();
        const start = performance.now();
        try {
            return await fn();
        } finally {
            const duration = performance.now() - start;
            this.recordMeasurement(name, duration);
        }
    }

    private recordMeasurement(name: string, duration: number): void {
        if (this.monitorLevel === "off") return;
        if (this.monitorLevel === "light" && duration <= this.slowThreshold) return;
        const existing = this.aggregateStats.peek(name);
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
            // 节流：同一操作名 60 秒内只 warn 一次，避免频繁超阈值刷屏
            const now = Date.now();
            const lastWarned = this.slowOpWarnedAt.get(name);
            if (lastWarned === undefined || now - lastWarned > PerformanceMonitor.SLOW_OP_WARN_THROTTLE_MS) {
                this.slowOpWarnedAt.set(name, now);
                console.warn(`[Performance] Slow operation: ${name} took ${duration.toFixed(2)}ms`);
            }
        }
    }

    getStats(name?: string): {
        count: number;
        avgDuration: number;
        maxDuration: number;
        minDuration: number;
    } {
        if (name) {
            const stats = this.aggregateStats.peek(name);
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
        this.slowOpWarnedAt.clear();
        this.configDisposable?.dispose();
        this.configDisposable = undefined;
    }
}

export function createPerformanceMonitor(): PerformanceMonitor {
    return new PerformanceMonitor();
}

export function getPerformanceMonitor(): PerformanceMonitor {
    return getContainer().get<PerformanceMonitor>(Tokens.PerformanceMonitor);
}
