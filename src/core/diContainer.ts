export class DIContainer {
  private services = new Map<string, unknown>();

  register<T>(token: string, service: T): void {
    this.services.set(token, service);
  }

  get<T>(token: string): T {
    const service = this.services.get(token) as T | undefined;
    if (service === undefined) {
      throw new Error(`Service not registered: ${token}`);
    }
    return service;
  }

  has(token: string): boolean {
    return this.services.has(token);
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
  }

  clear(): void {
    this.services.clear();
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
} as const;

export type Token = typeof Tokens[keyof typeof Tokens];

export function getContainer(): DIContainer {
  return container;
}
