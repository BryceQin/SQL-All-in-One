import { getContainer, resetContainer, Tokens } from '../../core/diContainer';
import { createConfigManager } from '../../core/configManager';
import { createErrorHandler } from '../../core/errorHandler';
import { createParserEngine } from '../../parser/SqlParserEngine';
import { createDocumentAstCache } from '../../parser/DocumentAstCache';
import { createSchemaCache } from '../../database/schema/SchemaCache';
import { createSchemaProvider } from '../../database/schema/SchemaProvider';
import { createConnectionStore } from '../../database/connection/ConnectionStore';
import { createConnectionManager } from '../../database/connection/ConnectionManager';
import { createPerformanceMonitor } from '../../core/performanceMonitor';
import { createRuleRegistry } from '../../linter/RuleRegistry';
import { AdapterFactory } from '../../database/adapters/AdapterFactory';
import { MysqlAdapter } from '../../database/adapters/MysqlAdapter';
import { QueryHistory } from '../../database/history/QueryHistory';
import { AstDiagnosticsProvider } from '../../providers/AstDiagnosticsProvider';
import { SqlParameterHighlighter } from '../../providers/SqlParameterHighlighter';
import { SqlCodeActionProvider } from '../../providers/SqlCodeActionProvider';
import { QueryExecutor } from '../../database/query/QueryExecutor';
import { SafeQueryGuard } from '../../database/query/SafeQueryGuard';
import { SqlStatementDetector } from '../../database/query/SqlStatementDetector';
import { SqlLinter } from '../../providers/SqlLinter';
import { AstNavigator } from '../../navigation/AstNavigator';
import { SqlDiagnosticsProvider } from '../../providers/SqlDiagnosticsProvider';
import { StatusBarProvider } from '../../providers/StatusBarProvider';
import { SqlCompletionProvider } from '../../completion/SqlCompletionProvider';
import { SqlFoldingRangeProvider } from '../../providers/SqlFoldingRangeProvider';
import { SqlOutlineProvider } from '../../providers/SqlOutlineProvider';
import { SqlHoverProvider } from '../../providers/SqlHoverProvider';
import { SqlDefinitionProvider } from '../../navigation/SqlDefinitionProvider';
import { SqlReferenceProvider } from '../../navigation/SqlReferenceProvider';
import { SqlRenameProvider } from '../../navigation/SqlRenameProvider';

let initialized = false;

export function setupTestContainer(): void {
    if (initialized) {
        return;
    }
    initialized = true;

    const container = getContainer();

    container.registerSingleton(Tokens.ConfigManager, createConfigManager);
    container.registerSingleton(Tokens.ParserEngine, createParserEngine);
    container.registerSingleton(Tokens.ErrorHandler, createErrorHandler);
    container.registerSingleton(Tokens.ConnectionStore, createConnectionStore);
    container.registerSingleton(Tokens.QueryHistory, () => new QueryHistory());
    container.registerSingleton(Tokens.AstDiagnosticsProvider, () => new AstDiagnosticsProvider());
    container.registerSingleton(Tokens.ParameterHighlighter, () => new SqlParameterHighlighter());
    container.registerSingleton(Tokens.CodeActionProvider, () => new SqlCodeActionProvider());

    container.registerSingleton(Tokens.PerformanceMonitor, createPerformanceMonitor, [Tokens.ConfigManager]);
    container.registerSingleton(Tokens.RuleRegistry, createRuleRegistry, [Tokens.ConfigManager]);
    container.registerSingleton(Tokens.DocumentAstCache, createDocumentAstCache, [Tokens.PerformanceMonitor, Tokens.ParserEngine]);

    AdapterFactory.register('mysql', MysqlAdapter, MysqlAdapter.getDialectMetadata);
    container.register(Tokens.DialectAdapterFactory, AdapterFactory);

    container.registerSingleton(Tokens.ConnectionManager, createConnectionManager, [Tokens.ConnectionStore, Tokens.DialectAdapterFactory]);
    container.registerSingleton(Tokens.SchemaCache, createSchemaCache, [Tokens.ConfigManager, Tokens.ConnectionManager]);
    container.registerSingleton(Tokens.SchemaProvider, createSchemaProvider, [Tokens.SchemaCache, Tokens.ConnectionManager, Tokens.ParserEngine]);
    container.registerSingleton(Tokens.QueryExecutor, () => new QueryExecutor(), [Tokens.ConfigManager, Tokens.ConnectionManager]);
    container.registerSingleton(Tokens.SafeQueryGuard, () => new SafeQueryGuard(), [Tokens.ConfigManager, Tokens.ConnectionManager, Tokens.ParserEngine]);
    container.registerSingleton(Tokens.SqlStatementDetector, () => new SqlStatementDetector(), [Tokens.ParserEngine]);

    container.registerSingleton(Tokens.SqlLinter, () => new SqlLinter(), [Tokens.RuleRegistry]);
    container.registerSingleton(Tokens.AstNavigator, () => new AstNavigator(), [Tokens.DocumentAstCache]);
    container.registerSingleton(Tokens.SqlDiagnosticsProvider, () => new SqlDiagnosticsProvider(), [Tokens.AstDiagnosticsProvider, Tokens.SqlLinter, Tokens.ConfigManager, Tokens.DocumentAstCache, Tokens.PerformanceMonitor]);
    container.registerSingleton(Tokens.StatusBarProvider, () => new StatusBarProvider(), [Tokens.ConfigManager, Tokens.ConnectionManager]);
    container.registerSingleton(Tokens.CompletionProvider, () => new SqlCompletionProvider(''), [Tokens.ConfigManager, Tokens.PerformanceMonitor, Tokens.ConnectionManager, Tokens.DocumentAstCache]);
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

export function teardownTestContainer(): void {
    resetContainer();
    initialized = false;
}

try {
    setupTestContainer();
} catch (e) {
    console.error('[diSetup] Failed to setup test container:', e);
}
