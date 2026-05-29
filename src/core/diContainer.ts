export class DIContainer {
  private services = new Map<string, unknown>();
  private factories = new Map<string, () => unknown>();

  register<T>(token: string, service: T): void {
    this.services.set(token, service);
  }

  registerFactory<T>(token: string, factory: () => T): void {
    this.factories.set(token, factory);
  }

  registerSingleton<T>(token: string, factory: () => T): void {
    this.factories.set(token, () => {
      if (this.services.has(token)) {
        return this.services.get(token) as T;
      }
      const instance = factory();
      this.services.set(token, instance);
      return instance as T;
    });
  }

  get<T>(token: string): T {
    if (this.services.has(token)) {
      return this.services.get(token) as T;
    }
    if (this.factories.has(token)) {
      const factory = this.factories.get(token) as () => T;
      const instance = factory();
      this.services.set(token, instance);
      return instance as T;
    }
    throw new Error(`Service not registered: ${token}`);
  }

  has(token: string): boolean {
    return this.services.has(token) || this.factories.has(token);
  }

  hasInstance(token: string): boolean {
    return this.services.has(token);
  }

  tryGet<T>(token: string): T | undefined {
    if (this.services.has(token)) {
      return this.services.get(token) as T;
    }
    if (this.factories.has(token)) {
      const factory = this.factories.get(token) as () => T;
      const instance = factory();
      this.services.set(token, instance);
      return instance as T;
    }
    return undefined;
  }

  disposeAll(): void {
    for (const service of this.services.values()) {
      if (
        service !== null &&
        service !== undefined &&
        typeof (service as Record<string, unknown>).dispose === 'function'
      ) {
        (service as { dispose: () => void }).dispose();
      }
    }
    this.services.clear();
    this.factories.clear();
  }

  clear(): void {
    this.services.clear();
  }

  unregister(token: string): void {
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
