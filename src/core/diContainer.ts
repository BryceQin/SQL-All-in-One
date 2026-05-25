export class DIContainer {
  private services = new Map<string, unknown>();
  private factories = new Map<string, () => unknown>();

  register<T>(token: string, service: T): void {
    this.services.set(token, service);
  }

  registerFactory<T>(token: string, factory: () => T): void {
    this.factories.set(token, factory);
  }

  registerLazySingleton<T>(token: string, factory: () => T): void {
    this.factories.set(token, factory);
  }

  get<T>(token: string): T {
    let service = this.services.get(token) as T | undefined;

    if (service === undefined) {
      const factory = this.factories.get(token);
      if (factory) {
        service = factory() as T;
        this.services.set(token, service);
      } else {
        throw new Error(`Service not registered: ${token}`);
      }
    }

    return service;
  }

  has(token: string): boolean {
    return this.services.has(token) || this.factories.has(token);
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
    this.factories.clear();
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
  EnhancedSqlChecker: 'EnhancedSqlChecker',
  SqlLinter: 'SqlLinter',
  AstDiagnosticsProvider: 'AstDiagnosticsProvider',
  AstConverter: 'AstConverter',
} as const;

export type Token = typeof Tokens[keyof typeof Tokens];

export function getContainer(): DIContainer {
  return container;
}
