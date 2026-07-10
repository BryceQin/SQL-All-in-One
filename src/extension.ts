import * as vscode from "vscode";
import { initI18n } from "./i18n";
import { getConfigManager } from "./core/configManager";
import { getDocumentAstCache } from "./parser/DocumentAstCache";
import { getErrorHandler, ErrorLevel, ErrorCategory } from "./core/errorHandler";
import { getContainer, Tokens } from "./core/diContainer";
import { bootstrapContainer } from "./core/serviceRegistration";
import { DatabaseModule } from "./database/DatabaseModule";
import { QueryExecutor } from "./database/query/QueryExecutor";
import { SafeQueryGuard } from "./database/query/SafeQueryGuard";
import { QueryHistory } from "./database/history/QueryHistory";
import { SqlStatementDetector } from "./database/query/SqlStatementDetector";
import { clearParameterScanCache } from "./hover/ParameterHoverResolver";
import { clearFormatterCache } from "./formatter/sqlFormatter";
import { invalidateRuleDefinitions } from "./linter/lintRules";
import { BaseWebviewPanel } from "./views/BaseWebviewPanel";
import { registerViewsCommands } from "./views/viewsCommands";
import { invalidateTokenColorCache } from "./utils/themeColors";
import { ModuleRegistry } from "./core/ModuleRegistry";
import { FormatterModule } from "./modules/FormatterModule";
import { DiagnosticsModule } from "./modules/DiagnosticsModule";
import { ProviderModule } from "./modules/ProviderModule";

let moduleRegistry: ModuleRegistry | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    try {
        bootstrapContainer(context.extensionPath);
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
        getContainer().register(Tokens.DatabaseModule, dbModule, [
            Tokens.ConnectionManager,
            Tokens.QueryExecutor,
            Tokens.SafeQueryGuard,
            Tokens.SchemaProvider,
            Tokens.SchemaCache,
        ]);
        registry.register(dbModule);

        // Register views-layer command handlers BEFORE activating the
        // database module so that tree-provider / query-result / table-designer
        // commands are available when DatabaseModule.initialize() fires
        // connection-state events (which reach the tree via
        // `hive-formatter.refreshTreeProvider`).
        registerViewsCommands(context);

        await registry.activateAll(context);

        context.subscriptions.push(getConfigManager());
        context.subscriptions.push(getDocumentAstCache());
        context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration((e) => {
                if (e.affectsConfiguration("workbench.colorTheme")) {
                    invalidateTokenColorCache();
                }
            }),
        );
    } catch (e) {
        console.error("[SQL All in One] activate() ERROR:", e);
        getErrorHandler().handle(e, "Extension activation", ErrorLevel.FATAL, ErrorCategory.CRITICAL);
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
    return Promise.all([registry ? registry.deactivateAll() : Promise.resolve(), getContainer().disposeAll()]).then(() => undefined);
}
