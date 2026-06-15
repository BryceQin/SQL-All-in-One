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
const SqlParameterHighlighter_1 = require("./providers/SqlParameterHighlighter");
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
const ParameterHoverResolver_1 = require("./hover/ParameterHoverResolver");
const sqlFormatter_1 = require("./formatter/sqlFormatter");
const lintRules_1 = require("./linter/lintRules");
function createLazyProvider(container, token, context) {
    let instance;
    return () => {
        if (!instance) {
            instance = container.get(token);
            if (instance)
                context.subscriptions.push(instance);
        }
        return instance;
    };
}
function registerCommands(context) {
    context.subscriptions.push(vscode.commands.registerCommand('hive-formatter.format-selection', formatSelectionCommand_1.formatSelectionCommand), vscode.commands.registerCommand('hive-formatter.toggleComment', commentCommands_1.toggleComment), vscode.commands.registerCommand('hive-formatter.toggleAdvancedComment', commentCommands_1.toggleAdvancedComment), vscode.commands.registerCommand('hive-formatter.mysql-to-hive', converterCommands_1.convertMysqlToHiveCommand), vscode.commands.registerCommand('hive-formatter.hive-to-mysql', converterCommands_1.convertHiveToMysqlCommand), vscode.commands.registerCommand('hive-formatter.open-config-editor', () => (0, configEditorCommand_1.openConfigEditorCommand)(context.extensionUri)), vscode.commands.registerCommand('hive-formatter.showErrorLog', () => {
        (0, errorHandler_1.getErrorHandler)().showOutputChannel();
    }));
}
function registerFormattingProviders(context) {
    context.subscriptions.push(...Object.entries(sqlDialects_1.sqlDialects).map(([vscodeLang, sqlDialectName]) => vscode.languages.registerDocumentFormattingEditProvider(vscodeLang, new SqlFormattingProvider_1.SqlFormattingProvider(sqlDialectName))));
}
function registerDiagnostics(context) {
    const container = (0, diContainer_1.getContainer)();
    const getDp = createLazyProvider(container, diContainer_1.Tokens.SqlDiagnosticsProvider, context);
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument((event) => {
        if ((0, sqlDialects_1.isSqlDocument)(event.document)) {
            getDp()?.debouncedProvideDiagnostics(event.document);
        }
    }), vscode.workspace.onDidOpenTextDocument((document) => {
        if ((0, sqlDialects_1.isSqlDocument)(document))
            getDp()?.provideDiagnostics(document);
    }), vscode.workspace.onDidSaveTextDocument((document) => {
        if ((0, sqlDialects_1.isSqlDocument)(document))
            getDp()?.provideDiagnostics(document);
    }));
    const openSqlDocs = vscode.workspace.textDocuments.filter(sqlDialects_1.isSqlDocument);
    if (openSqlDocs.length > 0) {
        queueMicrotask(() => openSqlDocs.forEach(doc => getDp()?.provideDiagnostics(doc)));
    }
}
function registerProviders(context) {
    const container = (0, diContainer_1.getContainer)();
    const sqlLanguages = (0, sqlDialects_1.getSqlLanguageIds)();
    const lazyCodeAction = createLazyProvider(container, diContainer_1.Tokens.CodeActionProvider, context);
    const lazyFoldingRange = createLazyProvider(container, diContainer_1.Tokens.FoldingRangeProvider, context);
    const lazyOutline = createLazyProvider(container, diContainer_1.Tokens.OutlineProvider, context);
    const lazyHover = createLazyProvider(container, diContainer_1.Tokens.HoverProvider, context);
    const lazyDefinition = createLazyProvider(container, diContainer_1.Tokens.DefinitionProvider, context);
    const lazyReference = createLazyProvider(container, diContainer_1.Tokens.ReferenceProvider, context);
    const lazyRename = createLazyProvider(container, diContainer_1.Tokens.RenameProvider, context);
    for (const lang of sqlLanguages) {
        const selector = { language: lang };
        context.subscriptions.push(vscode.languages.registerCodeActionsProvider(selector, {
            provideCodeActions: (...args) => lazyCodeAction().provideCodeActions(...args),
        }, {
            providedCodeActionKinds: SqlCodeActionProvider_1.SqlCodeActionProvider.providedCodeActionKinds,
        }));
        context.subscriptions.push(vscode.languages.registerFoldingRangeProvider(selector, {
            provideFoldingRanges: (...args) => lazyFoldingRange().provideFoldingRanges(...args),
        }));
        context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider(selector, {
            provideDocumentSymbols: (...args) => lazyOutline().provideDocumentSymbols(...args),
        }));
        context.subscriptions.push(vscode.languages.registerHoverProvider(selector, {
            provideHover: (...args) => lazyHover().provideHover(...args),
        }));
        context.subscriptions.push(vscode.languages.registerDefinitionProvider(selector, {
            provideDefinition: (...args) => lazyDefinition().provideDefinition(...args),
        }));
        context.subscriptions.push(vscode.languages.registerReferenceProvider(selector, {
            provideReferences: (...args) => lazyReference().provideReferences(...args),
        }));
        context.subscriptions.push(vscode.languages.registerRenameProvider(selector, {
            provideRenameEdits: (...args) => lazyRename().provideRenameEdits(...args),
            prepareRename: (...args) => lazyRename().prepareRename(...args),
        }));
    }
}
function registerCompletion(context) {
    const container = (0, diContainer_1.getContainer)();
    const sqlLanguages = (0, sqlDialects_1.getSqlLanguageIds)();
    const triggerChars = ['.', ' ', '('];
    const getProvider = createLazyProvider(container, diContainer_1.Tokens.CompletionProvider, context);
    const lazyProvider = {
        provideCompletionItems: (doc, pos, token, _ctx) => getProvider()?.provideCompletionItems(doc, pos, token),
    };
    for (const lang of sqlLanguages) {
        context.subscriptions.push(vscode.languages.registerCompletionItemProvider({ language: lang }, lazyProvider, ...triggerChars));
    }
}
function registerParameterHighlighter(context) {
    const container = (0, diContainer_1.getContainer)();
    const getHighlighter = createLazyProvider(container, diContainer_1.Tokens.ParameterHighlighter, context);
    context.subscriptions.push(SqlParameterHighlighter_1.SqlParameterReplaceCommand.register(context));
    // Eagerly instantiate to register decoration decorators
    getHighlighter();
}
function registerAstNavigatorEvents(context) {
    const container = (0, diContainer_1.getContainer)();
    const getNavigator = createLazyProvider(container, diContainer_1.Tokens.AstNavigator, context);
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(e => {
        if ((0, sqlDialects_1.isSqlDocument)(e.document))
            getNavigator()?.invalidate(e.document);
    }), vscode.workspace.onDidCloseTextDocument(doc => getNavigator()?.invalidate(doc)));
}
function registerStatusBar(context) {
    const container = (0, diContainer_1.getContainer)();
    const getStatusBar = createLazyProvider(container, diContainer_1.Tokens.StatusBarProvider, context);
    // Eagerly instantiate to show status bar item
    getStatusBar();
}
function registerServicesToContainer(extensionPath) {
    const container = (0, diContainer_1.getContainer)();
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
    container.registerSingleton(diContainer_1.Tokens.QueryExecutor, () => new QueryExecutor_1.QueryExecutor());
    container.registerSingleton(diContainer_1.Tokens.SafeQueryGuard, () => new SafeQueryGuard_1.SafeQueryGuard());
    container.registerSingleton(diContainer_1.Tokens.QueryHistory, () => new QueryHistory_1.QueryHistory());
    container.registerSingleton(diContainer_1.Tokens.SqlStatementDetector, () => new SqlStatementDetector_1.SqlStatementDetector());
    container.registerSingleton(diContainer_1.Tokens.SqlDiagnosticsProvider, () => new SqlDiagnosticsProvider_1.SqlDiagnosticsProvider());
    container.registerSingleton(diContainer_1.Tokens.StatusBarProvider, () => new StatusBarProvider_1.StatusBarProvider());
    container.registerSingleton(diContainer_1.Tokens.ParameterHighlighter, () => new SqlParameterHighlighter_1.SqlParameterHighlighter());
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
async function activate(context) {
    console.log('[SQL All in One] v2.15.12 activate() START');
    registerServicesToContainer(context.extensionPath);
    console.log('[SQL All in One] registerServicesToContainer done');
    try {
        (0, i18n_1.initI18n)();
        registerCommands(context);
        registerFormattingProviders(context);
        registerDiagnostics(context);
        console.log('[SQL All in One] core registration done');
        queueMicrotask(() => {
            registerProviders(context);
            registerCompletion(context);
            registerParameterHighlighter(context);
            registerAstNavigatorEvents(context);
            registerStatusBar(context);
        });
        const dbModule = new DatabaseModule_1.DatabaseModule(context);
        dbModule.registerCommands();
        console.log('[SQL All in One] db commands registered');
        dbModule.initialize().then(() => {
            console.log('[SQL All in One] db initialize DONE');
        }).catch(e => {
            console.error('[SQL All in One] Database initialization failed:', e);
            (0, errorHandler_1.getErrorHandler)().handle(e, 'Database initialization', errorHandler_1.ErrorLevel.ERROR, errorHandler_1.ErrorCategory.CRITICAL);
        });
        context.subscriptions.push({
            dispose: () => {
                dbModule.dispose().catch(e => {
                    console.error('Failed to dispose DatabaseModule:', e);
                });
            }
        });
        context.subscriptions.push((0, configManager_1.getConfigManager)());
        context.subscriptions.push((0, DocumentAstCache_1.getDocumentAstCache)());
        console.log('[SQL All in One] activate() END');
    }
    catch (e) {
        console.error('[SQL All in One] activate() ERROR:', e);
        (0, errorHandler_1.getErrorHandler)().handle(e, 'Extension activation', errorHandler_1.ErrorLevel.FATAL, errorHandler_1.ErrorCategory.CRITICAL);
    }
}
function deactivate() {
    (0, ParameterHoverResolver_1.clearParameterScanCache)();
    (0, sqlFormatter_1.clearFormatterCache)();
    (0, lintRules_1.invalidateRuleDefinitions)();
    return Promise.resolve((0, diContainer_1.getContainer)().disposeAll());
}
//# sourceMappingURL=extension.js.map