import { getContainer, Tokens, type DIContainer } from "./diContainer";
import { createConfigManager } from "./configManager";
import { createErrorHandler } from "./errorHandler";
import { createPerformanceMonitor } from "./performanceMonitor";
import { createParserEngine } from "../parser/SqlParserEngine";
import { createDocumentAstCache } from "../parser/DocumentAstCache";
import { createRuleRegistry } from "../linter/RuleRegistry";
import { createConnectionStore } from "../database/connection/ConnectionStore";
import { createConnectionManager, ConnectionManager } from "../database/connection/ConnectionManager";
import { createSchemaCache } from "../database/schema/SchemaCache";
import { createSchemaProvider } from "../database/schema/SchemaProvider";
import { createAstConverter } from "../converter/AstConverter";
import { createDialectConverter, DialectConverter } from "../converter/DialectConverter";
import { SqlParserEngine } from "../parser/SqlParserEngine";
import { AdapterFactory } from "../database/adapters/AdapterFactory";
import { MysqlAdapter } from "../database/adapters/MysqlAdapter";
import { PostgresAdapter } from "../database/adapters/PostgresAdapter";
import { SqliteAdapter } from "../database/adapters/SqliteAdapter";
import { StarrocksAdapter } from "../database/adapters/StarrocksAdapter";
import { SqlServerAdapter } from "../database/adapters/SqlServerAdapter";
import { OracleAdapter } from "../database/adapters/OracleAdapter";
import { DamengAdapter } from "../database/adapters/DamengAdapter";
import { QueryExecutor } from "../database/query/QueryExecutor";
import { SafeQueryGuard } from "../database/query/SafeQueryGuard";
import { QueryHistory } from "../database/history/QueryHistory";
import { SqlStatementDetector } from "../database/query/SqlStatementDetector";
import { SqlLinter } from "../providers/SqlLinter";
import { AstDiagnosticsProvider } from "../providers/AstDiagnosticsProvider";
import { AstNavigator } from "../navigation/AstNavigator";
import { SqlDiagnosticsProvider } from "../providers/SqlDiagnosticsProvider";
import { StatusBarProvider } from "../providers/StatusBarProvider";
import { SqlCompletionProvider } from "../completion/SqlCompletionProvider";
import { SqlCodeActionProvider } from "../providers/SqlCodeActionProvider";
import { SqlParameterHighlighter } from "../providers/SqlParameterHighlighter";
import { SqlFoldingRangeProvider } from "../providers/SqlFoldingRangeProvider";
import { SqlOutlineProvider } from "../providers/SqlOutlineProvider";
import { SqlHoverProvider } from "../providers/SqlHoverProvider";
import { SqlDefinitionProvider } from "../navigation/SqlDefinitionProvider";
import { SqlReferenceProvider } from "../navigation/SqlReferenceProvider";
import { SqlRenameProvider } from "../navigation/SqlRenameProvider";
import {
    ConnectionServiceImpl,
    DataEditServiceImpl,
    DataTransferServiceImpl,
    DialectMetadataProviderImpl,
    ExplainPlanServiceImpl,
    QueryServiceImpl,
    SchemaServiceImpl,
} from "../application/portImplementations";

/**
 * Register the standard set of adapter implementations with the global
 * AdapterFactory.  In production every supported dialect is registered;
 * in tests a minimal subset (MySQL only) is typically sufficient.
 *
 * @param allDialects - when `true`, register all built-in adapters; when
 *                    `false`, register only the MySQL adapter (the historical
 *                    test configuration).
 */
export function registerAdapters(allDialects: boolean): void {
    AdapterFactory.register("mysql", MysqlAdapter, MysqlAdapter.getDialectMetadata);
    if (allDialects) {
        AdapterFactory.register("postgresql", PostgresAdapter, PostgresAdapter.getDialectMetadata);
        AdapterFactory.register("sqlite", SqliteAdapter, SqliteAdapter.getDialectMetadata);
        AdapterFactory.register("starrocks", StarrocksAdapter, StarrocksAdapter.getDialectMetadata);
        AdapterFactory.register("sqlserver", SqlServerAdapter, SqlServerAdapter.getDialectMetadata);
        AdapterFactory.register("oracle", OracleAdapter, OracleAdapter.getDialectMetadata);
        AdapterFactory.register("dameng", DamengAdapter, DamengAdapter.getDialectMetadata);
    }
}

/**
 * Register every singleton service the extension relies on into the supplied
 * DIContainer.  This is the single source of truth for service wiring shared
 * by both production activation (extension.ts) and the test container
 * bootstrap (test/helpers/diSetup.ts).
 *
 * @param container - the container to register into
 * @param extensionPath - extension path forwarded to providers that need it
 *                      (e.g. SqlCompletionProvider); pass `''` in tests
 */
export function registerServicesToContainer(container: DIContainer, extensionPath: string): void {
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

    // Converter services — dependencies are constructor-injected by the
    // factory closures below (no service-locator calls inside the classes).
    container.registerSingleton(
        Tokens.DialectConverter,
        () => {
            const parserEngine = container.get<SqlParserEngine>(Tokens.ParserEngine);
            return createDialectConverter(parserEngine);
        },
        [Tokens.ParserEngine],
    );
    container.registerSingleton(
        Tokens.AstConverter,
        () => {
            const parserEngine = container.get<SqlParserEngine>(Tokens.ParserEngine);
            const dialectConverter = container.get<DialectConverter>(Tokens.DialectConverter);
            return createAstConverter(parserEngine, dialectConverter);
        },
        [Tokens.ParserEngine, Tokens.DialectConverter],
    );

    // AdapterFactory (registered as a pre-built instance, not a factory)
    container.register(Tokens.DialectAdapterFactory, AdapterFactory);

    // Database services
    container.registerSingleton(Tokens.ConnectionManager, createConnectionManager, [Tokens.ConnectionStore, Tokens.DialectAdapterFactory]);
    container.registerSingleton(Tokens.SchemaCache, createSchemaCache, [Tokens.ConfigManager, Tokens.ConnectionManager]);
    container.registerSingleton(Tokens.SchemaProvider, createSchemaProvider, [
        Tokens.SchemaCache,
        Tokens.ConnectionManager,
        Tokens.ParserEngine,
    ]);
    container.registerSingleton(Tokens.QueryExecutor, () => new QueryExecutor(), [Tokens.ConfigManager, Tokens.ConnectionManager]);
    container.registerSingleton(Tokens.SafeQueryGuard, () => new SafeQueryGuard(), [
        Tokens.ConfigManager,
        Tokens.ConnectionManager,
        Tokens.ParserEngine,
    ]);
    container.registerSingleton(Tokens.SqlStatementDetector, () => new SqlStatementDetector(), [Tokens.ParserEngine]);

    // Provider services — factories resolve their dependencies via the
    // container so the provider constructors themselves stay free of any
    // service-locator calls.
    container.registerSingleton(Tokens.SqlLinter, () => new SqlLinter(), [Tokens.RuleRegistry]);
    container.registerSingleton(Tokens.AstNavigator, () => new AstNavigator(), [Tokens.DocumentAstCache]);
    container.registerSingleton(
        Tokens.SqlDiagnosticsProvider,
        () => {
            const astDiag = container.get<AstDiagnosticsProvider>(Tokens.AstDiagnosticsProvider);
            const linter = container.get<SqlLinter>(Tokens.SqlLinter);
            return new SqlDiagnosticsProvider(astDiag, linter);
        },
        [Tokens.AstDiagnosticsProvider, Tokens.SqlLinter, Tokens.ConfigManager, Tokens.DocumentAstCache, Tokens.PerformanceMonitor],
    );
    container.registerSingleton(
        Tokens.StatusBarProvider,
        () => {
            const connMgr = container.get<ConnectionManager>(Tokens.ConnectionManager);
            return new StatusBarProvider(connMgr);
        },
        [Tokens.ConfigManager, Tokens.ConnectionManager],
    );
    container.registerSingleton(Tokens.CompletionProvider, () => new SqlCompletionProvider(extensionPath), [
        Tokens.ConfigManager,
        Tokens.PerformanceMonitor,
        Tokens.ConnectionManager,
        Tokens.DocumentAstCache,
    ]);
    container.registerSingleton(Tokens.FoldingRangeProvider, () => new SqlFoldingRangeProvider(), [Tokens.DocumentAstCache]);
    container.registerSingleton(Tokens.OutlineProvider, () => new SqlOutlineProvider(), [Tokens.DocumentAstCache, Tokens.ConfigManager]);
    container.registerSingleton(Tokens.HoverProvider, () => new SqlHoverProvider(), [
        Tokens.ConfigManager,
        Tokens.ConnectionManager,
        Tokens.PerformanceMonitor,
    ]);
    container.registerSingleton(
        Tokens.DefinitionProvider,
        () => {
            const nav = container.get<AstNavigator>(Tokens.AstNavigator);
            return new SqlDefinitionProvider(nav);
        },
        [Tokens.AstNavigator],
    );
    container.registerSingleton(
        Tokens.ReferenceProvider,
        () => {
            const nav = container.get<AstNavigator>(Tokens.AstNavigator);
            return new SqlReferenceProvider(nav);
        },
        [Tokens.AstNavigator],
    );
    container.registerSingleton(
        Tokens.RenameProvider,
        () => {
            const nav = container.get<AstNavigator>(Tokens.AstNavigator);
            return new SqlRenameProvider(nav);
        },
        [Tokens.AstNavigator],
    );

    // Application-layer port implementations. Views-layer components resolve
    // services by port interface (e.g. IConnectionService) via these tokens
    // so they never import concrete database singletons directly. Each
    // adapter is a thin facade that delegates to the database singletons
    // registered above.
    container.registerSingleton(Tokens.ConnectionService, () => new ConnectionServiceImpl(), [
        Tokens.ConnectionManager,
        Tokens.ConnectionStore,
    ]);
    container.registerSingleton(Tokens.QueryService, () => new QueryServiceImpl(), [Tokens.QueryExecutor, Tokens.ConnectionManager]);
    container.registerSingleton(Tokens.SchemaService, () => new SchemaServiceImpl(), [Tokens.SchemaCache, Tokens.ConnectionManager]);
    container.registerSingleton(Tokens.DataEditService, () => new DataEditServiceImpl(), [Tokens.ConnectionManager]);
    container.registerSingleton(Tokens.DataTransferService, () => new DataTransferServiceImpl());
    container.registerSingleton(Tokens.ExplainPlanService, () => new ExplainPlanServiceImpl());
    container.registerSingleton(Tokens.DialectMetadataProvider, () => new DialectMetadataProviderImpl(), [Tokens.DialectAdapterFactory]);
    // Note: `IConnectionStore` port is NOT registered separately. The concrete
    // `ConnectionStore` singleton (registered above via createConnectionStore)
    // already satisfies the `IConnectionStore` interface, and `ConnectionManager`
    // depends on the concrete `ConnectionStore` type (load/addConnection/
    // setSecretStorage). Views-layer components that need `IConnectionStore`
    // resolve `Tokens.ConnectionStore` and get the concrete instance, which is
    // structurally compatible with the port.
}

/**
 * Convenience wrapper that registers adapters + all services into the
 * process-global container.  Used by production activation.
 */
export function bootstrapContainer(extensionPath: string): void {
    registerAdapters(true);
    registerServicesToContainer(getContainer(), extensionPath);
}
