export class DIContainer {
    private services = new Map<string, unknown>();
    private factories = new Map<string, () => unknown>();
    private singletons = new Map<string, () => unknown>();
    private creating = new Set<string>();

    register<T>(token: string, service: T): void {
        this.services.set(token, service);
    }

    registerFactory<T>(token: string, factory: () => T): void {
        this.factories.set(token, factory);
    }

    registerSingleton<T>(token: string, factory: () => T): void {
        this.singletons.set(token, factory);
    }

    get<T>(token: string): T {
        // 首先检查是否已有实例
        if (this.services.has(token)) {
            return this.services.get(token) as T;
        }

        // 检查是否是单例
        if (this.singletons.has(token) && !this.creating.has(token)) {
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

        // 检查是否有工厂函数
        if (this.factories.has(token)) {
            const factory = this.factories.get(token) as () => T;
            return factory();
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
        } catch {
            return undefined;
        }
    }

    disposeAll(): void {
        for (const service of this.services.values()) {
            if (
                service !== null &&
                service !== undefined &&
                typeof (service as Record<string, unknown>).dispose === 'function'
            ) {
                try {
                    (service as { dispose: () => void }).dispose();
                } catch {
                    // ignore dispose errors
                }
            }
        }
        this.services.clear();
        this.factories.clear();
        this.singletons.clear();
    }

    clear(): void {
        for (const service of this.services.values()) {
            if (
                service !== null &&
                service !== undefined &&
                typeof (service as Record<string, unknown>).dispose === 'function'
            ) {
                try {
                    (service as { dispose: () => void }).dispose();
                } catch {
                    // ignore dispose errors
                }
            }
        }
        this.services.clear();
        this.creating.clear();
    }

    unregister(token: string): void {
        const service = this.services.get(token);
        if (
            service !== null &&
            service !== undefined &&
            typeof (service as Record<string, unknown>).dispose === 'function'
        ) {
            try {
                (service as { dispose: () => void }).dispose();
            } catch {
                // ignore dispose errors
            }
        }
        this.services.delete(token);
    }
}

const container = new DIContainer();

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
} as const;

export type Token = typeof Tokens[keyof typeof Tokens];

export function getContainer(): DIContainer {
    return container;
}
