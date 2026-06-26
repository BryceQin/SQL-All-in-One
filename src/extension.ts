import * as vscode from 'vscode';
import { initI18n } from './i18n';
import { getConfigManager, createConfigManager } from './core/configManager';
import { getDocumentAstCache, createDocumentAstCache } from './parser/DocumentAstCache';
import { getErrorHandler, createErrorHandler, ErrorLevel, ErrorCategory } from './core/errorHandler';
import { createPerformanceMonitor } from './core/performanceMonitor';
import { getContainer, Tokens } from './core/diContainer';
import { createParserEngine } from './parser/SqlParserEngine';
import { createRuleRegistry } from './linter/RuleRegistry';
import { SqlCodeActionProvider } from './providers/SqlCodeActionProvider';
import { SqlDiagnosticsProvider } from './providers/SqlDiagnosticsProvider';
import { StatusBarProvider } from './providers/StatusBarProvider';
import { SqlParameterHighlighter } from './providers/SqlParameterHighlighter';
import { SqlCompletionProvider } from './completion';
import { SqlFoldingRangeProvider } from './providers/SqlFoldingRangeProvider';
import { SqlOutlineProvider } from './providers/SqlOutlineProvider';
import { SqlHoverProvider } from './providers/SqlHoverProvider';
import { AstNavigator } from './navigation/AstNavigator';
import { SqlDefinitionProvider } from './navigation/SqlDefinitionProvider';
import { SqlReferenceProvider } from './navigation/SqlReferenceProvider';
import { SqlRenameProvider } from './navigation/SqlRenameProvider';
import { DatabaseModule } from './database/DatabaseModule';
import { AdapterFactory } from './database/adapters/AdapterFactory';
import { MysqlAdapter } from './database/adapters/MysqlAdapter';
import { PostgresAdapter } from './database/adapters/PostgresAdapter';
import { SqliteAdapter } from './database/adapters/SqliteAdapter';
import { StarrocksAdapter } from './database/adapters/StarrocksAdapter';
import { SqlServerAdapter } from './database/adapters/SqlServerAdapter';
import { OracleAdapter } from './database/adapters/OracleAdapter';
import { DamengAdapter } from './database/adapters/DamengAdapter';
import { createConnectionManager } from './database/connection/ConnectionManager';
import { createConnectionStore } from './database/connection/ConnectionStore';
import { createSchemaProvider } from './database/schema/SchemaProvider';
import { createSchemaCache } from './database/schema/SchemaCache';
import { QueryExecutor } from './database/query/QueryExecutor';
import { SafeQueryGuard } from './database/query/SafeQueryGuard';
import { QueryHistory } from './database/history/QueryHistory';
import { SqlStatementDetector } from './database/query/SqlStatementDetector';
import { clearParameterScanCache } from './hover/ParameterHoverResolver';
import { clearFormatterCache } from './formatter/sqlFormatter';
import { invalidateRuleDefinitions } from './linter/lintRules';
import { BaseWebviewPanel } from './views/BaseWebviewPanel';
import { invalidateTokenColorCache } from './utils/themeColors';
import { AstDiagnosticsProvider } from './providers/AstDiagnosticsProvider';
import { SqlLinter } from './providers/SqlLinter';
import { ModuleRegistry } from './core/ModuleRegistry';
import { FormatterModule } from './modules/FormatterModule';
import { DiagnosticsModule } from './modules/DiagnosticsModule';
import { ProviderModule } from './modules/ProviderModule';

function registerServicesToContainer(extensionPath: string): void {
  const container = getContainer();

  // Core services (no DI dependencies)
  container.registerSingleton(Tokens.ConfigManager, createConfigManager);
  container.registerSingleton(Tokens.ParserEngine, createParserEngine);
  container.registerSingleton(Tokens.ErrorHandler, createErrorHandler);
  container.registerSingleton(Tokens.ConnectionStore, createConnectionStore);
  container.registerSingleton(Tokens.QueryHistory, () => new QueryHistory());
  container.registerSingleton(Tokens.AstDiagnosticsProvider, () => new AstDiagnosticsProvider());
  container.registerSingleton(Tokens.ParameterHighlighter, () => new SqlParameterHighlighter());
  container.registerSingleton(Tokens.CodeActionProvider, () => new SqlCodeActionProvider());

  // Core services (with dependencies)
  container.registerSingleton(Tokens.PerformanceMonitor, createPerformanceMonitor, [Tokens.ConfigManager]);
  container.registerSingleton(Tokens.RuleRegistry, createRuleRegistry, [Tokens.ConfigManager]);
  container.registerSingleton(Tokens.DocumentAstCache, createDocumentAstCache, [Tokens.PerformanceMonitor, Tokens.ParserEngine]);

  // Database services
  container.registerSingleton(Tokens.ConnectionManager, createConnectionManager, [Tokens.ConnectionStore, Tokens.DialectAdapterFactory]);
  container.registerSingleton(Tokens.SchemaCache, createSchemaCache, [Tokens.ConfigManager, Tokens.ConnectionManager]);
  container.registerSingleton(Tokens.SchemaProvider, createSchemaProvider, [Tokens.SchemaCache, Tokens.ConnectionManager, Tokens.ParserEngine]);
  container.registerSingleton(Tokens.QueryExecutor, () => new QueryExecutor(), [Tokens.ConfigManager, Tokens.ConnectionManager]);
  container.registerSingleton(Tokens.SafeQueryGuard, () => new SafeQueryGuard(), [Tokens.ConfigManager, Tokens.ConnectionManager, Tokens.ParserEngine]);
  container.registerSingleton(Tokens.SqlStatementDetector, () => new SqlStatementDetector(), [Tokens.ParserEngine]);

  // Register AdapterFactory in the DI container
  AdapterFactory.register('mysql', MysqlAdapter, MysqlAdapter.getDialectMetadata);
  AdapterFactory.register('postgresql', PostgresAdapter, PostgresAdapter.getDialectMetadata);
  AdapterFactory.register('sqlite', SqliteAdapter, SqliteAdapter.getDialectMetadata);
  AdapterFactory.register('starrocks', StarrocksAdapter, StarrocksAdapter.getDialectMetadata);
  AdapterFactory.register('sqlserver', SqlServerAdapter, SqlServerAdapter.getDialectMetadata);
  AdapterFactory.register('oracle', OracleAdapter, OracleAdapter.getDialectMetadata);
  AdapterFactory.register('dameng', DamengAdapter, DamengAdapter.getDialectMetadata);
  container.register(Tokens.DialectAdapterFactory, AdapterFactory);

  // Provider services
  container.registerSingleton(Tokens.SqlLinter, () => new SqlLinter(), [Tokens.RuleRegistry]);
  container.registerSingleton(Tokens.AstNavigator, () => new AstNavigator(), [Tokens.DocumentAstCache]);
  container.registerSingleton(Tokens.SqlDiagnosticsProvider, () => new SqlDiagnosticsProvider(), [Tokens.AstDiagnosticsProvider, Tokens.SqlLinter, Tokens.ConfigManager, Tokens.DocumentAstCache, Tokens.PerformanceMonitor]);
  container.registerSingleton(Tokens.StatusBarProvider, () => new StatusBarProvider(), [Tokens.ConfigManager, Tokens.ConnectionManager]);
  container.registerSingleton(Tokens.CompletionProvider, () => new SqlCompletionProvider(extensionPath), [Tokens.ConfigManager, Tokens.PerformanceMonitor, Tokens.ConnectionManager, Tokens.DocumentAstCache]);
  container.registerSingleton(Tokens.FoldingRangeProvider, () => new SqlFoldingRangeProvider(), [Tokens.DocumentAstCache]);
  container.registerSingleton(Tokens.OutlineProvider, () => new SqlOutlineProvider(), [Tokens.DocumentAstCache, Tokens.ConfigManager]);
  container.registerSingleton(Tokens.HoverProvider, () => new SqlHoverProvider(), [Tokens.ConfigManager, Tokens.ConnectionManager, Tokens.PerformanceMonitor]);
  container.registerSingleton(Tokens.DefinitionProvider, () => {
    const nav = container.get<AstNavigator>(Tokens.AstNavigator);
    return new SqlDefinitionProvider(nav);
  }, [Tokens.AstNavigator]);
  container.registerSingleton(Tokens.ReferenceProvider, () => {
    const nav = container.get<AstNavigator>(Tokens.AstNavigator);
    return new SqlReferenceProvider(nav);
  }, [Tokens.AstNavigator]);
  container.registerSingleton(Tokens.RenameProvider, () => {
    const nav = container.get<AstNavigator>(Tokens.AstNavigator);
    return new SqlRenameProvider(nav);
  }, [Tokens.AstNavigator]);
}

let moduleRegistry: ModuleRegistry | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    registerServicesToContainer(context.extensionPath);

    try {
        initI18n();

        const registry = new ModuleRegistry();
        moduleRegistry = registry;

        registry.register(new FormatterModule());
        registry.register(new DiagnosticsModule());
        registry.register(new ProviderModule());

        const dbModule = new DatabaseModule(
            context,
            getContainer().get<QueryExecutor>(Tokens.QueryExecutor),
            getContainer().get<SafeQueryGuard>(Tokens.SafeQueryGuard),
            getContainer().get<QueryHistory>(Tokens.QueryHistory),
            getContainer().get<SqlStatementDetector>(Tokens.SqlStatementDetector),
        );
        getContainer().register(Tokens.DatabaseModule, dbModule);
        registry.register(dbModule);

        await registry.activateAll(context);

        context.subscriptions.push(getConfigManager());
        context.subscriptions.push(getDocumentAstCache());
        context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('workbench.colorTheme')) {
                    invalidateTokenColorCache();
                }
            })
        );
    } catch (e) {
        console.error('[SQL All in One] activate() ERROR:', e);
        getErrorHandler().handle(e, 'Extension activation', ErrorLevel.FATAL, ErrorCategory.CRITICAL);
    }
}

export function deactivate(): Thenable<void> {
  clearParameterScanCache();
  clearFormatterCache();
  invalidateRuleDefinitions();
  // Dispose any lingering webview panels to avoid leaking static instance references.
  BaseWebviewPanel.disposeAll();
  const registry = moduleRegistry;
  moduleRegistry = undefined;
  return Promise.all([
    registry ? registry.deactivateAll() : Promise.resolve(),
    getContainer().disposeAll(),
  ]).then(() => undefined);
}
