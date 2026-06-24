import type { ConfigManager } from './configManager';
import type { SqlParserEngine } from '../parser/SqlParserEngine';
import type { DocumentAstCache } from '../parser/DocumentAstCache';
import type { ErrorHandler } from './errorHandler';
import type { PerformanceMonitor } from './performanceMonitor';
import type { SqlDiagnosticsProvider } from '../providers/SqlDiagnosticsProvider';
import type { StatusBarProvider } from '../providers/StatusBarProvider';
import type { SqlParameterHighlighter } from '../providers/SqlParameterHighlighter';
import type { SqlCompletionProvider } from '../completion/SqlCompletionProvider';
import type { SqlCodeActionProvider } from '../providers/SqlCodeActionProvider';
import type { SqlFoldingRangeProvider } from '../providers/SqlFoldingRangeProvider';
import type { SqlOutlineProvider } from '../providers/SqlOutlineProvider';
import type { SqlHoverProvider } from '../providers/SqlHoverProvider';
import type { AstNavigator } from '../navigation/AstNavigator';
import type { SqlDefinitionProvider } from '../navigation/SqlDefinitionProvider';
import type { SqlReferenceProvider } from '../navigation/SqlReferenceProvider';
import type { SqlRenameProvider } from '../navigation/SqlRenameProvider';
import type { SqlLinter } from '../providers/SqlLinter';
import type { AstDiagnosticsProvider } from '../providers/AstDiagnosticsProvider';
import type { AstConverter } from '../converter/AstConverter';
import type { RuleRegistry } from '../linter/RuleRegistry';
import type { ConnectionManager } from '../database/connection/ConnectionManager';
import type { ConnectionStore } from '../database/connection/ConnectionStore';
import type { QueryExecutor } from '../database/query/QueryExecutor';
import type { SafeQueryGuard } from '../database/query/SafeQueryGuard';
import type { QueryHistory } from '../database/history/QueryHistory';
import type { SqlStatementDetector } from '../database/query/SqlStatementDetector';
import type { SchemaProvider } from '../database/schema/SchemaProvider';
import type { SchemaCache } from '../database/schema/SchemaCache';
import type { DatabaseModule } from '../database/DatabaseModule';
import type { AdapterFactory } from '../database/adapters/AdapterFactory';

export interface TokenMap {
    ConfigManager: ConfigManager;
    ParserEngine: SqlParserEngine;
    DocumentAstCache: DocumentAstCache;
    ErrorHandler: ErrorHandler;
    PerformanceMonitor: PerformanceMonitor;
    SqlDiagnosticsProvider: SqlDiagnosticsProvider;
    StatusBarProvider: StatusBarProvider;
    ParameterHighlighter: SqlParameterHighlighter;
    CompletionProvider: SqlCompletionProvider;
    CodeActionProvider: SqlCodeActionProvider;
    FoldingRangeProvider: SqlFoldingRangeProvider;
    OutlineProvider: SqlOutlineProvider;
    HoverProvider: SqlHoverProvider;
    AstNavigator: AstNavigator;
    DefinitionProvider: SqlDefinitionProvider;
    ReferenceProvider: SqlReferenceProvider;
    RenameProvider: SqlRenameProvider;
    SqlLinter: SqlLinter;
    AstDiagnosticsProvider: AstDiagnosticsProvider;
    AstConverter: AstConverter;
    RuleRegistry: RuleRegistry;
    ConnectionManager: ConnectionManager;
    ConnectionStore: ConnectionStore;
    QueryExecutor: QueryExecutor;
    SafeQueryGuard: SafeQueryGuard;
    QueryHistory: QueryHistory;
    SqlStatementDetector: SqlStatementDetector;
    SchemaProvider: SchemaProvider;
    SchemaCache: SchemaCache;
    DatabaseModule: DatabaseModule;
    DialectAdapterFactory: typeof AdapterFactory;
}

export class DIContainer {
    private services = new Map<string, unknown>();
    private factories = new Map<string, () => unknown>();
    private singletons = new Map<string, () => unknown>();
    private creating = new Set<string>();
    private dependencyMap = new Map<string, string[]>();

    register<T>(token: string, service: T): void {
        this.services.set(token, service);
    }

    registerFactory<T>(token: string, factory: () => T): void {
        this.factories.set(token, factory);
    }

    registerSingleton<T>(token: string, factory: () => T, dependencies?: string[]): void {
        this.singletons.set(token, factory);
        if (dependencies && dependencies.length > 0) {
            this.dependencyMap.set(token, dependencies);
        }
    }

    get<T extends keyof TokenMap>(token: T): TokenMap[T];
    get<T>(token: string): T;
    get<T>(token: string): T {
        if (this.services.has(token)) {
            return this.services.get(token) as T;
        }

        if (this.creating.has(token)) {
            throw new Error(`Circular dependency detected: ${token}`);
        }

        if (this.singletons.has(token)) {
            this.creating.add(token);
            try {
                const factory = this.singletons.get(token) as () => T;
                const instance = factory();
                this.services.set(token, instance);
                return instance;
            } finally {
                this.creating.delete(token);
            }
        }

        if (this.factories.has(token)) {
            this.creating.add(token);
            try {
                const factory = this.factories.get(token) as () => T;
                return factory();
            } finally {
                this.creating.delete(token);
            }
        }

        throw new Error(`Service not registered: ${token}`);
    }

    has(token: string): boolean {
        return (
            this.services.has(token) ||
            this.factories.has(token) ||
            this.singletons.has(token)
        );
    }

    hasInstance(token: string): boolean {
        return this.services.has(token);
    }

    tryGet<T>(token: string): T | undefined {
        try {
            return this.get(token);
        } catch (e) {
            console.debug('[SQL All in One] DIContainer.tryGet failed for token:', token, e)
            return undefined;
        }
    }

    private disposeService(service: unknown): void {
        if (
            service !== null &&
            service !== undefined &&
            typeof (service as Record<string, unknown>).dispose === 'function'
        ) {
            try {
                (service as { dispose: () => void }).dispose();
            } catch (e) {
                // ignore dispose errors; log for debugging
                console.debug('[SQL All in One] DIContainer.disposeService failed:', e)
            }
        }
    }

    private async disposeServiceAsync(service: unknown): Promise<void> {
        if (
            service !== null &&
            service !== undefined &&
            typeof (service as Record<string, unknown>).dispose === 'function'
        ) {
            try {
                const result = (service as { dispose: () => unknown }).dispose();
                if (result instanceof Promise) {
                    await result;
                }
            } catch (e) {
                // ignore dispose errors; log for debugging
                console.debug('[SQL All in One] DIContainer.disposeServiceAsync failed:', e)
            }
        }
    }

    /**
     * Compute a topological dispose order based on declared dependencies.
     * Services with no dependents are disposed first; services that others
     * depend upon are disposed last.  If a circular dependency is detected
     * among a subset of services, those services fall back to reverse
     * insertion order.
     */
    private computeDisposeOrder(): string[] {
        const serviceKeys = Array.from(this.services.keys());

        // Only consider keys that have a dependency declaration
        const keysWithDeps = serviceKeys.filter((k) => this.dependencyMap.has(k));

        if (keysWithDeps.length === 0) {
            // No dependency info – fall back to reverse insertion order
            return serviceKeys.reverse();
        }

        // Build adjacency: edge A -> B means "A depends on B" (B must be disposed after A)
        const inDegree = new Map<string, number>();
        const dependents = new Map<string, Set<string>>(); // reverse edges: B -> {A} (who depends on B)

        for (const key of serviceKeys) {
            inDegree.set(key, 0);
            dependents.set(key, new Set());
        }

        for (const key of keysWithDeps) {
            const deps = this.dependencyMap.get(key) ?? [];
            for (const dep of deps) {
                if (this.services.has(dep)) {
                    // key depends on dep → dep must be disposed AFTER key
                    // So in the dispose graph, key -> dep (key must come before dep)
                    dependents.get(dep)!.add(key);
                    inDegree.set(key, (inDegree.get(key) ?? 0) + 1);
                }
            }
        }

        // Kahn's algorithm – produces topological order where dependencies come
        // first (inDegree=0 nodes have no dependencies).  We then reverse the
        // result so that dependents are disposed first.
        const queue: string[] = [];
        for (const [key, deg] of inDegree) {
            if (deg === 0) {
                queue.push(key);
            }
        }

        const sorted: string[] = [];
        const visited = new Set<string>();

        while (queue.length > 0) {
            const current = queue.shift()!;
            sorted.push(current);
            visited.add(current);

            for (const dependent of dependents.get(current) ?? []) {
                const newDeg = (inDegree.get(dependent) ?? 1) - 1;
                inDegree.set(dependent, newDeg);
                if (newDeg === 0) {
                    queue.push(dependent);
                }
            }
        }

        // Reverse so dependents come first (disposed before their dependencies)
        sorted.reverse();

        // Any keys not visited are part of a cycle – append in reverse insertion order
        const cyclicKeys = serviceKeys.filter((k) => !visited.has(k)).reverse();

        return [...sorted, ...cyclicKeys];
    }

    disposeAll(): void {
        const disposeOrder = this.computeDisposeOrder();
        for (const key of disposeOrder) {
            const service = this.services.get(key);
            this.disposeService(service);
        }
        this.services.clear();
        this.factories.clear();
        this.singletons.clear();
        this.creating.clear();
        this.dependencyMap.clear();
    }

    async asyncDisposeAll(): Promise<void> {
        const disposeOrder = this.computeDisposeOrder();

        // Group services by dependency level for parallel disposal.
        // We compute levels via BFS on the dependency graph so that
        // services at the same level can be disposed concurrently.
        const levels = this.computeDisposeLevels(disposeOrder);

        for (const level of levels) {
            const results = await Promise.allSettled(
                level.map(async (key) => {
                    const service = this.services.get(key);
                    await this.disposeServiceAsync(service);
                })
            );
            // Log any rejections (already caught inside disposeServiceAsync, but just in case)
            for (const result of results) {
                if (result.status === 'rejected') {
                    // Already handled inside disposeServiceAsync, but we don't want
                    // unhandled promise rejections
                }
            }
        }

        this.services.clear();
        this.factories.clear();
        this.singletons.clear();
        this.creating.clear();
        this.dependencyMap.clear();
    }

    /**
     * Given the topological dispose order, group keys into levels.
     * Level 0 = services with no dependents (can be disposed first, in parallel).
     * Level N = services whose dependents are all at levels less than N.
     */
    private computeDisposeLevels(disposeOrder: string[]): string[][] {
        if (disposeOrder.length === 0) {
            return [];
        }

        // Build reverse map: for each key, what depends on it?
        const isDependedUpon = new Map<string, Set<string>>();
        for (const key of disposeOrder) {
            isDependedUpon.set(key, new Set());
        }
        for (const key of disposeOrder) {
            const deps = this.dependencyMap.get(key) ?? [];
            for (const dep of deps) {
                if (isDependedUpon.has(dep)) {
                    isDependedUpon.get(dep)!.add(key);
                }
            }
        }

        // Compute level for each key: level = max(level of dependents) + 1
        // Keys with no dependents get level 0
        const levels = new Map<string, number>();
        const computed = new Set<string>();

        const computeLevel = (key: string): number => {
            if (computed.has(key)) {
                return levels.get(key) ?? 0;
            }
            computed.add(key);
            const deps = isDependedUpon.get(key);
            if (!deps || deps.size === 0) {
                levels.set(key, 0);
                return 0;
            }
            let maxDepLevel = 0;
            for (const dep of deps) {
                maxDepLevel = Math.max(maxDepLevel, computeLevel(dep) + 1);
            }
            levels.set(key, maxDepLevel);
            return maxDepLevel;
        };

        for (const key of disposeOrder) {
            computeLevel(key);
        }

        // Group by level
        const maxLevel = Math.max(...levels.values(), 0);
        const result: string[][] = [];
        for (let i = 0; i <= maxLevel; i++) {
            result.push([]);
        }
        for (const key of disposeOrder) {
            const level = levels.get(key) ?? 0;
            result[level].push(key);
        }

        return result.filter((level) => level.length > 0);
    }

    clear(): void {
        this.services.clear();
        this.factories.clear();
        this.singletons.clear();
        this.creating.clear();
        this.dependencyMap.clear();
    }

    unregister(token: string): void {
        const service = this.services.get(token);
        this.disposeService(service);
        this.services.delete(token);
        this.singletons.delete(token);
        this.factories.delete(token);
        this.dependencyMap.delete(token);
    }
}

let container = new DIContainer();

export const Tokens = {
    ConfigManager: 'ConfigManager',
    ParserEngine: 'ParserEngine',
    DocumentAstCache: 'DocumentAstCache',
    ErrorHandler: 'ErrorHandler',
    PerformanceMonitor: 'PerformanceMonitor',
    SqlDiagnosticsProvider: 'SqlDiagnosticsProvider',
    StatusBarProvider: 'StatusBarProvider',
    ParameterHighlighter: 'ParameterHighlighter',
    CompletionProvider: 'CompletionProvider',
    CodeActionProvider: 'CodeActionProvider',
    FoldingRangeProvider: 'FoldingRangeProvider',
    OutlineProvider: 'OutlineProvider',
    HoverProvider: 'HoverProvider',
    AstNavigator: 'AstNavigator',
    DefinitionProvider: 'DefinitionProvider',
    ReferenceProvider: 'ReferenceProvider',
    RenameProvider: 'RenameProvider',
    SqlLinter: 'SqlLinter',
    AstDiagnosticsProvider: 'AstDiagnosticsProvider',
    AstConverter: 'AstConverter',
    RuleRegistry: 'RuleRegistry',
    ConnectionManager: 'ConnectionManager',
    ConnectionStore: 'ConnectionStore',
    QueryExecutor: 'QueryExecutor',
    SafeQueryGuard: 'SafeQueryGuard',
    QueryHistory: 'QueryHistory',
    SqlStatementDetector: 'SqlStatementDetector',
    SchemaProvider: 'SchemaProvider',
    SchemaCache: 'SchemaCache',
    DatabaseModule: 'DatabaseModule',
    DialectAdapterFactory: 'DialectAdapterFactory',
} as const;

export type Token = typeof Tokens[keyof typeof Tokens];

export function getContainer(): DIContainer {
    return container;
}

export function resetContainer(): void {
    container.disposeAll();
    container = new DIContainer();
}
