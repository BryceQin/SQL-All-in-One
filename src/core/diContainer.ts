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
}

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
                this.singletons.delete(token);
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
        } catch {
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
            } catch {
                // ignore dispose errors
            }
        }
    }

    disposeAll(): void {
        const disposeOrder = Array.from(this.services.keys()).reverse();
        for (const key of disposeOrder) {
            const service = this.services.get(key);
            this.disposeService(service);
        }
        this.services.clear();
        this.factories.clear();
        this.singletons.clear();
        this.creating.clear();
    }

    clear(): void {
        this.disposeAll();
    }

    unregister(token: string): void {
        const service = this.services.get(token);
        this.disposeService(service);
        this.services.delete(token);
        this.singletons.delete(token);
        this.factories.delete(token);
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
} as const;

export type Token = typeof Tokens[keyof typeof Tokens];

export function getContainer(): DIContainer {
    return container;
}

export function resetContainer(): void {
    container.disposeAll();
    container = new DIContainer();
}
