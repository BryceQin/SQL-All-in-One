"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const SqlFormattingProvider_1 = require("./providers/SqlFormattingProvider");
const sqlDialects_1 = require("./core/sqlDialects");
const formatSelectionCommand_1 = require("./commands/formatSelectionCommand");
const commentCommands_1 = require("./commands/commentCommands");
const converterCommands_1 = require("./commands/converterCommands");
const configEditorCommand_1 = require("./commands/configEditorCommand");
const i18n_1 = require("./i18n");
const configManager_1 = require("./core/configManager");
const DocumentAstCache_1 = require("./parser/DocumentAstCache");
const errorHandler_1 = require("./core/errorHandler");
const performanceMonitor_1 = require("./core/performanceMonitor");
const diContainer_1 = require("./core/diContainer");
const SqlParserEngine_1 = require("./parser/SqlParserEngine");
const RuleRegistry_1 = require("./linter/RuleRegistry");
const SqlCodeActionProvider_1 = require("./providers/SqlCodeActionProvider");
const SqlDiagnosticsProvider_1 = require("./providers/SqlDiagnosticsProvider");
const StatusBarProvider_1 = require("./providers/StatusBarProvider");
const SqlParameterHightlighter_1 = require("./providers/SqlParameterHightlighter");
const completion_1 = require("./completion");
const SqlFoldingRangeProvider_1 = require("./providers/SqlFoldingRangeProvider");
const SqlOutlineProvider_1 = require("./providers/SqlOutlineProvider");
const SqlHoverProvider_1 = require("./providers/SqlHoverProvider");
const AstNavigator_1 = require("./navigation/AstNavigator");
const SqlDefinitionProvider_1 = require("./navigation/SqlDefinitionProvider");
const SqlReferenceProvider_1 = require("./navigation/SqlReferenceProvider");
const SqlRenameProvider_1 = require("./navigation/SqlRenameProvider");
const DatabaseModule_1 = require("./database/DatabaseModule");
const ConnectionManager_1 = require("./database/connection/ConnectionManager");
const ConnectionStore_1 = require("./database/connection/ConnectionStore");
const SchemaProvider_1 = require("./database/schema/SchemaProvider");
const SchemaCache_1 = require("./database/schema/SchemaCache");
const QueryExecutor_1 = require("./database/query/QueryExecutor");
const SafeQueryGuard_1 = require("./database/query/SafeQueryGuard");
const QueryHistory_1 = require("./database/history/QueryHistory");
const SqlStatementDetector_1 = require("./database/query/SqlStatementDetector");
async function safeRegisterAsync(label, fn) {
    try {
        await fn();
    }
    catch (e) {
        (0, errorHandler_1.getErrorHandler)().handle(e, label, errorHandler_1.ErrorLevel.ERROR, errorHandler_1.ErrorCategory.CRITICAL);
    }
}
function registerCommands(context) {
    context.subscriptions.push(vscode.commands.registerCommand('sql-all-in-one.format-selection', formatSelectionCommand_1.formatSelectionCommand), vscode.commands.registerCommand('sql-all-in-one.toggleComment', commentCommands_1.toggleComment), vscode.commands.registerCommand('sql-all-in-one.toggleAdvancedComment', commentCommands_1.toggleAdvancedComment), vscode.commands.registerCommand('sql-all-in-one.mysql-to-hive', converterCommands_1.convertMysqlToHiveCommand), vscode.commands.registerCommand('sql-all-in-one.hive-to-mysql', converterCommands_1.convertHiveToMysqlCommand), vscode.commands.registerCommand('sql-all-in-one.open-config-editor', () => (0, configEditorCommand_1.openConfigEditorCommand)(context.extensionUri)), vscode.commands.registerCommand('sql-all-in-one.showErrorLog', () => {
        (0, errorHandler_1.getErrorHandler)().showOutputChannel();
    }));
}
function registerFormattingProviders(context) {
    context.subscriptions.push(...Object.entries(sqlDialects_1.sqlDialects).map(([vscodeLang, sqlDialectName]) => vscode.languages.registerDocumentFormattingEditProvider(vscodeLang, new SqlFormattingProvider_1.SqlFormattingProvider(sqlDialectName))));
}
function registerDiagnostics(context) {
    const container = (0, diContainer_1.getContainer)();
    const dp = container.get(diContainer_1.Tokens.SqlDiagnosticsProvider);
    if (!dp)
        return;
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument((event) => {
        if ((0, sqlDialects_1.isSqlDocument)(event.document)) {
            dp.debouncedProvideDiagnostics(event.document);
        }
    }), vscode.workspace.onDidOpenTextDocument((document) => {
        if ((0, sqlDialects_1.isSqlDocument)(document))
            dp.provideDiagnostics(document);
    }), vscode.workspace.onDidSaveTextDocument((document) => {
        if ((0, sqlDialects_1.isSqlDocument)(document))
            dp.provideDiagnostics(document);
    }), dp);
    vscode.workspace.textDocuments.forEach((document) => {
        if ((0, sqlDialects_1.isSqlDocument)(document))
            dp.provideDiagnostics(document);
    });
}
function registerProviders(context) {
    const container = (0, diContainer_1.getContainer)();
    const sqlLanguages = (0, sqlDialects_1.getSqlLanguageIds)();
    const codeActionProvider = container.get(diContainer_1.Tokens.CodeActionProvider);
    const foldingRangeProvider = container.get(diContainer_1.Tokens.FoldingRangeProvider);
    const outlineProvider = container.get(diContainer_1.Tokens.OutlineProvider);
    const hoverProvider = container.get(diContainer_1.Tokens.HoverProvider);
    const definitionProvider = container.get(diContainer_1.Tokens.DefinitionProvider);
    const referenceProvider = container.get(diContainer_1.Tokens.ReferenceProvider);
    const renameProvider = container.get(diContainer_1.Tokens.RenameProvider);
    for (const lang of sqlLanguages) {
        const selector = { language: lang };
        context.subscriptions.push(vscode.languages.registerCodeActionsProvider(selector, codeActionProvider, {
            providedCodeActionKinds: SqlCodeActionProvider_1.SqlCodeActionProvider.providedCodeActionKinds,
        }));
        context.subscriptions.push(vscode.languages.registerFoldingRangeProvider(selector, foldingRangeProvider));
        context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider(selector, outlineProvider));
        context.subscriptions.push(vscode.languages.registerHoverProvider(selector, hoverProvider));
        if (definitionProvider) {
            context.subscriptions.push(vscode.languages.registerDefinitionProvider(selector, definitionProvider));
        }
        if (referenceProvider) {
            context.subscriptions.push(vscode.languages.registerReferenceProvider(selector, referenceProvider));
        }
        if (renameProvider) {
            context.subscriptions.push(vscode.languages.registerRenameProvider(selector, renameProvider));
        }
    }
}
function registerCompletion(context) {
    const container = (0, diContainer_1.getContainer)();
    const completionProvider = container.get(diContainer_1.Tokens.CompletionProvider);
    if (!completionProvider)
        return;
    const sqlLanguages = (0, sqlDialects_1.getSqlLanguageIds)();
    const triggerChars = ['.', ' ', '('];
    for (const lang of sqlLanguages) {
        context.subscriptions.push(vscode.languages.registerCompletionItemProvider({ language: lang }, completionProvider, ...triggerChars));
    }
    context.subscriptions.push(completionProvider);
}
function registerParameterHighlighter(context) {
    const container = (0, diContainer_1.getContainer)();
    const parameterHighlighter = container.get(diContainer_1.Tokens.ParameterHighlighter);
    if (!parameterHighlighter)
        return;
    SqlParameterHightlighter_1.SqlParameterReplaceCommand.register(context);
    context.subscriptions.push(parameterHighlighter);
}
function registerServicesToContainer(extensionPath) {
    const container = (0, diContainer_1.getContainer)();
    // Core services
    container.registerSingleton(diContainer_1.Tokens.ConfigManager, configManager_1.createConfigManager);
    container.registerSingleton(diContainer_1.Tokens.ParserEngine, SqlParserEngine_1.createParserEngine);
    container.registerSingleton(diContainer_1.Tokens.RuleRegistry, RuleRegistry_1.createRuleRegistry);
    container.registerSingleton(diContainer_1.Tokens.ErrorHandler, errorHandler_1.createErrorHandler);
    container.registerSingleton(diContainer_1.Tokens.PerformanceMonitor, performanceMonitor_1.createPerformanceMonitor);
    container.registerSingleton(diContainer_1.Tokens.DocumentAstCache, DocumentAstCache_1.createDocumentAstCache);
    container.registerSingleton(diContainer_1.Tokens.ConnectionManager, ConnectionManager_1.createConnectionManager);
    container.registerSingleton(diContainer_1.Tokens.ConnectionStore, ConnectionStore_1.createConnectionStore);
    container.registerSingleton(diContainer_1.Tokens.SchemaProvider, SchemaProvider_1.createSchemaProvider);
    container.registerSingleton(diContainer_1.Tokens.SchemaCache, SchemaCache_1.createSchemaCache);
    // Database services
    container.registerSingleton(diContainer_1.Tokens.QueryExecutor, () => new QueryExecutor_1.QueryExecutor());
    container.registerSingleton(diContainer_1.Tokens.SafeQueryGuard, () => new SafeQueryGuard_1.SafeQueryGuard());
    container.registerSingleton(diContainer_1.Tokens.QueryHistory, () => new QueryHistory_1.QueryHistory());
    container.registerSingleton(diContainer_1.Tokens.SqlStatementDetector, () => new SqlStatementDetector_1.SqlStatementDetector());
    // Providers
    container.registerSingleton(diContainer_1.Tokens.SqlDiagnosticsProvider, () => new SqlDiagnosticsProvider_1.SqlDiagnosticsProvider());
    container.registerSingleton(diContainer_1.Tokens.StatusBarProvider, () => new StatusBarProvider_1.StatusBarProvider());
    container.registerSingleton(diContainer_1.Tokens.ParameterHighlighter, () => new SqlParameterHightlighter_1.SqlParameterHighlighter());
    container.registerSingleton(diContainer_1.Tokens.CompletionProvider, () => new completion_1.SqlCompletionProvider(extensionPath));
    container.registerSingleton(diContainer_1.Tokens.CodeActionProvider, () => new SqlCodeActionProvider_1.SqlCodeActionProvider());
    container.registerSingleton(diContainer_1.Tokens.FoldingRangeProvider, () => new SqlFoldingRangeProvider_1.SqlFoldingRangeProvider());
    container.registerSingleton(diContainer_1.Tokens.OutlineProvider, () => new SqlOutlineProvider_1.SqlOutlineProvider());
    container.registerSingleton(diContainer_1.Tokens.HoverProvider, () => new SqlHoverProvider_1.SqlHoverProvider());
    container.registerSingleton(diContainer_1.Tokens.AstNavigator, () => new AstNavigator_1.AstNavigator());
    container.registerSingleton(diContainer_1.Tokens.DefinitionProvider, () => {
        const nav = container.get(diContainer_1.Tokens.AstNavigator);
        return new SqlDefinitionProvider_1.SqlDefinitionProvider(nav);
    });
    container.registerSingleton(diContainer_1.Tokens.ReferenceProvider, () => {
        const nav = container.get(diContainer_1.Tokens.AstNavigator);
        return new SqlReferenceProvider_1.SqlReferenceProvider(nav);
    });
    container.registerSingleton(diContainer_1.Tokens.RenameProvider, () => {
        const nav = container.get(diContainer_1.Tokens.AstNavigator);
        return new SqlRenameProvider_1.SqlRenameProvider(nav);
    });
}
function createModules() {
    return [
        { name: 'i18n', register: () => (0, i18n_1.initI18n)() },
        { name: 'commands', register: (ctx) => registerCommands(ctx) },
        { name: 'formatting', register: (ctx) => registerFormattingProviders(ctx) },
        { name: 'diagnostics', register: (ctx) => registerDiagnostics(ctx) },
        { name: 'providers', register: (ctx) => registerProviders(ctx) },
        { name: 'completion', register: (ctx) => registerCompletion(ctx) },
        { name: 'parameterHighlighter', register: (ctx) => registerParameterHighlighter(ctx) },
        { name: 'astNavigatorEvents', register: (ctx) => {
                const container = (0, diContainer_1.getContainer)();
                const navigator = container.get(diContainer_1.Tokens.AstNavigator);
                if (navigator) {
                    ctx.subscriptions.push(vscode.workspace.onDidChangeTextDocument(e => {
                        if ((0, sqlDialects_1.isSqlDocument)(e.document))
                            navigator.invalidate(e.document);
                    }), vscode.workspace.onDidCloseTextDocument(doc => navigator.invalidate(doc)));
                }
            } },
        { name: 'statusBar', register: (ctx) => {
                const container = (0, diContainer_1.getContainer)();
                if (vscode.workspace.textDocuments.some(sqlDialects_1.isSqlDocument)) {
                    const statusBar = container.get(diContainer_1.Tokens.StatusBarProvider);
                    if (statusBar)
                        ctx.subscriptions.push(statusBar);
                }
            } },
        { name: 'database', register: async (ctx) => {
                const dbModule = new DatabaseModule_1.DatabaseModule(ctx);
                await dbModule.initialize();
                ctx.subscriptions.push({
                    dispose: async () => await dbModule.dispose(),
                });
            } },
    ];
}
async function activate(context) {
    // 首先注册所有服务到 DI 容器
    registerServicesToContainer(context.extensionPath);
    await (0, performanceMonitor_1.getPerformanceMonitor)().measureAsync('Extension.activate', async () => {
        console.log('SQL All in One: activating...');
        try {
            const modules = createModules();
            for (const mod of modules) {
                await safeRegisterAsync('register ' + mod.name, () => mod.register(context));
            }
            context.subscriptions.push((0, configManager_1.getConfigManager)());
            context.subscriptions.push((0, DocumentAstCache_1.getDocumentAstCache)());
            console.log('SQL All in One: activation complete');
        }
        catch (e) {
            (0, errorHandler_1.getErrorHandler)().handle(e, 'Extension activation', errorHandler_1.ErrorLevel.FATAL, errorHandler_1.ErrorCategory.CRITICAL);
        }
    });
}
function deactivate() {
    (0, diContainer_1.getContainer)().disposeAll();
}
//# sourceMappingURL=extension.js.map