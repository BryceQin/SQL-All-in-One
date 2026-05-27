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
const lazy_1 = require("./utils/lazy");
const errorHandler_1 = require("./core/errorHandler");
const performanceMonitor_1 = require("./core/performanceMonitor");
const diContainer_1 = require("./core/diContainer");
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
let lazyProviders = null;
function createLazyProviders(extensionPath) {
    const providers = {
        diagnosticsProvider: (0, lazy_1.lazy)(() => new SqlDiagnosticsProvider_1.SqlDiagnosticsProvider()),
        statusBarProvider: (0, lazy_1.lazy)(() => new StatusBarProvider_1.StatusBarProvider()),
        parameterHighlighter: (0, lazy_1.lazy)(() => new SqlParameterHightlighter_1.SqlParameterHighlighter()),
        completionProvider: (0, lazy_1.lazy)(() => new completion_1.SqlCompletionProvider(extensionPath)),
        codeActionProvider: (0, lazy_1.lazy)(() => new SqlCodeActionProvider_1.SqlCodeActionProvider()),
        foldingRangeProvider: (0, lazy_1.lazy)(() => new SqlFoldingRangeProvider_1.SqlFoldingRangeProvider()),
        outlineProvider: (0, lazy_1.lazy)(() => new SqlOutlineProvider_1.SqlOutlineProvider()),
        hoverProvider: (0, lazy_1.lazy)(() => new SqlHoverProvider_1.SqlHoverProvider()),
        astNavigator: (0, lazy_1.lazy)(() => new AstNavigator_1.AstNavigator()),
        definitionProvider: (0, lazy_1.lazy)(() => {
            const nav = providers.astNavigator.get();
            return new SqlDefinitionProvider_1.SqlDefinitionProvider(nav);
        }),
        referenceProvider: (0, lazy_1.lazy)(() => {
            const nav = providers.astNavigator.get();
            return new SqlReferenceProvider_1.SqlReferenceProvider(nav);
        }),
        renameProvider: (0, lazy_1.lazy)(() => {
            const nav = providers.astNavigator.get();
            return new SqlRenameProvider_1.SqlRenameProvider(nav);
        }),
    };
    return providers;
}
const errorHandler = (0, errorHandler_1.getErrorHandler)();
const perfMonitor = (0, performanceMonitor_1.getPerformanceMonitor)();
function safeRegister(label, fn) {
    errorHandler.try(fn, label, {
        level: errorHandler_1.ErrorLevel.ERROR,
        category: errorHandler_1.ErrorCategory.CRITICAL,
    });
}
function registerCommands(context) {
    context.subscriptions.push(vscode.commands.registerCommand("sql-all-in-one.format-selection", formatSelectionCommand_1.formatSelectionCommand), vscode.commands.registerCommand("sql-all-in-one.toggleComment", commentCommands_1.toggleComment), vscode.commands.registerCommand("sql-all-in-one.toggleAdvancedComment", commentCommands_1.toggleAdvancedComment), vscode.commands.registerCommand("sql-all-in-one.mysql-to-hive", converterCommands_1.convertMysqlToHiveCommand), vscode.commands.registerCommand("sql-all-in-one.hive-to-mysql", converterCommands_1.convertHiveToMysqlCommand), vscode.commands.registerCommand("sql-all-in-one.open-config-editor", () => (0, configEditorCommand_1.openConfigEditorCommand)(context.extensionUri)));
}
function registerFormattingProviders(context) {
    context.subscriptions.push(...Object.entries(sqlDialects_1.sqlDialects).map(([vscodeLang, sqlDialectName]) => vscode.languages.registerDocumentFormattingEditProvider(vscodeLang, new SqlFormattingProvider_1.SqlFormattingProvider(sqlDialectName))));
}
function registerDiagnostics(context) {
    if (!lazyProviders)
        return;
    const dp = lazyProviders.diagnosticsProvider.get();
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
    if (!lazyProviders)
        return;
    const sqlLanguages = (0, sqlDialects_1.getSqlLanguageIds)();
    const codeActionProvider = lazyProviders.codeActionProvider.get();
    const foldingRangeProvider = lazyProviders.foldingRangeProvider.get();
    const outlineProvider = lazyProviders.outlineProvider.get();
    const hoverProvider = lazyProviders.hoverProvider.get();
    const definitionProvider = lazyProviders.definitionProvider.get();
    const referenceProvider = lazyProviders.referenceProvider.get();
    const renameProvider = lazyProviders.renameProvider.get();
    for (const lang of sqlLanguages) {
        const selector = { language: lang };
        context.subscriptions.push(vscode.languages.registerCodeActionsProvider(selector, codeActionProvider, { providedCodeActionKinds: SqlCodeActionProvider_1.SqlCodeActionProvider.providedCodeActionKinds }));
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
    if (!lazyProviders)
        return;
    const completionProvider = lazyProviders.completionProvider.get();
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
    if (!lazyProviders)
        return;
    const parameterHighlighter = lazyProviders.parameterHighlighter.get();
    if (!parameterHighlighter)
        return;
    SqlParameterHightlighter_1.SqlParameterReplaceCommand.register(context);
    context.subscriptions.push(parameterHighlighter);
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
                if (!lazyProviders)
                    return;
                const navigator = lazyProviders.astNavigator.get();
                if (navigator) {
                    ctx.subscriptions.push(vscode.workspace.onDidChangeTextDocument(e => {
                        if ((0, sqlDialects_1.isSqlDocument)(e.document))
                            navigator.invalidate(e.document);
                    }), vscode.workspace.onDidCloseTextDocument(doc => navigator.invalidate(doc)));
                }
            } },
        { name: 'statusBar', register: (ctx) => {
                if (!lazyProviders)
                    return;
                if (lazyProviders.statusBarProvider.isInitialized || vscode.workspace.textDocuments.some(sqlDialects_1.isSqlDocument)) {
                    const statusBar = lazyProviders.statusBarProvider.get();
                    if (statusBar)
                        ctx.subscriptions.push(statusBar);
                }
            } },
    ];
}
function activate(context) {
    lazyProviders = createLazyProviders(context.extensionPath);
    perfMonitor.measure('Extension.activate', () => {
        console.log('SQL All in One: activating...');
        try {
            const modules = createModules();
            for (const mod of modules) {
                safeRegister('register ' + mod.name, () => mod.register(context));
            }
            context.subscriptions.push((0, configManager_1.getConfigManager)());
            context.subscriptions.push((0, DocumentAstCache_1.getDocumentAstCache)());
            console.log('SQL All in One: activation complete');
        }
        catch (e) {
            errorHandler.handle(e, 'Extension activation', errorHandler_1.ErrorLevel.FATAL, errorHandler_1.ErrorCategory.CRITICAL);
        }
    });
}
function deactivate() {
    (0, diContainer_1.getContainer)().disposeAll();
    lazyProviders = null;
}
//# sourceMappingURL=extension.js.map