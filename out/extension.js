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
const SqlDiagnosticsProvider_1 = require("./providers/SqlDiagnosticsProvider");
const configEditorCommand_1 = require("./commands/configEditorCommand");
const StatusBarProvider_1 = require("./providers/StatusBarProvider");
const SqlCodeActionProvider_1 = require("./providers/SqlCodeActionProvider");
const SqlFoldingRangeProvider_1 = require("./providers/SqlFoldingRangeProvider");
const SqlOutlineProvider_1 = require("./providers/SqlOutlineProvider");
const SqlParameterHightlighter_1 = require("./providers/SqlParameterHightlighter");
const completion_1 = require("./completion");
const SqlHoverProvider_1 = require("./providers/SqlHoverProvider");
const i18n_1 = require("./i18n");
const configManager_1 = require("./core/configManager");
const SqlParserEngine_1 = require("./parser/SqlParserEngine");
const DocumentAstCache_1 = require("./parser/DocumentAstCache");
let diagnosticsProvider;
let statusBarProvider;
let parameterHighlighter;
function safeRegister(label, fn) {
    try {
        fn();
    }
    catch (e) {
        console.error(`Hive Formatter: failed to ${label}`, e);
    }
}
function registerCommands(context) {
    context.subscriptions.push(vscode.commands.registerCommand("hive-formatter.format-selection", formatSelectionCommand_1.formatSelectionCommand), vscode.commands.registerCommand("hive-formatter.toggleComment", commentCommands_1.toggleComment), vscode.commands.registerCommand("hive-formatter.toggleAdvancedComment", commentCommands_1.toggleAdvancedComment), vscode.commands.registerCommand("hive-formatter.mysql-to-hive", converterCommands_1.convertMysqlToHiveCommand), vscode.commands.registerCommand("hive-formatter.hive-to-mysql", converterCommands_1.convertHiveToMysqlCommand), vscode.commands.registerCommand("hive-formatter.open-config-editor", () => (0, configEditorCommand_1.openConfigEditorCommand)(context.extensionUri)));
}
function registerFormattingProviders(context) {
    context.subscriptions.push(...Object.entries(sqlDialects_1.sqlDialects).map(([vscodeLang, sqlDialectName]) => vscode.languages.registerDocumentFormattingEditProvider(vscodeLang, new SqlFormattingProvider_1.SqlFormattingProvider(sqlDialectName))));
}
function registerDiagnostics(context) {
    if (!diagnosticsProvider)
        return;
    const dp = diagnosticsProvider;
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
    const sqlLanguages = (0, sqlDialects_1.getSqlLanguageIds)();
    // Singleton stateless providers
    const codeActionProvider = new SqlCodeActionProvider_1.SqlCodeActionProvider();
    const foldingRangeProvider = new SqlFoldingRangeProvider_1.SqlFoldingRangeProvider();
    const outlineProvider = new SqlOutlineProvider_1.SqlOutlineProvider();
    const hoverProvider = new SqlHoverProvider_1.SqlHoverProvider();
    for (const lang of sqlLanguages) {
        const selector = { language: lang };
        context.subscriptions.push(vscode.languages.registerCodeActionsProvider(selector, codeActionProvider, { providedCodeActionKinds: SqlCodeActionProvider_1.SqlCodeActionProvider.providedCodeActionKinds }));
        context.subscriptions.push(vscode.languages.registerFoldingRangeProvider(selector, foldingRangeProvider));
        context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider(selector, outlineProvider));
        context.subscriptions.push(vscode.languages.registerHoverProvider(selector, hoverProvider));
    }
}
function registerCompletion(context, completionProvider) {
    if (!completionProvider)
        return;
    const sqlLanguages = (0, sqlDialects_1.getSqlLanguageIds)();
    const triggerChars = [...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.'];
    for (const lang of sqlLanguages) {
        context.subscriptions.push(vscode.languages.registerCompletionItemProvider({ language: lang }, completionProvider, ...triggerChars));
    }
    context.subscriptions.push(completionProvider);
}
function registerParameterHighlighter(context) {
    if (!parameterHighlighter)
        return;
    SqlParameterHightlighter_1.SqlParameterReplaceCommand.register(context);
    context.subscriptions.push(parameterHighlighter);
}
function activate(context) {
    try {
        safeRegister('initialize i18n', () => (0, i18n_1.initI18n)());
        console.log('Hive Formatter: activating...');
        safeRegister('create SqlDiagnosticsProvider', () => {
            diagnosticsProvider = new SqlDiagnosticsProvider_1.SqlDiagnosticsProvider();
        });
        safeRegister('create StatusBarProvider', () => {
            statusBarProvider = new StatusBarProvider_1.StatusBarProvider();
        });
        safeRegister('create SqlParameterHighlighter', () => {
            parameterHighlighter = new SqlParameterHightlighter_1.SqlParameterHighlighter();
        });
        let completionProvider;
        safeRegister('create SqlCompletionProvider', () => {
            completionProvider = new completion_1.SqlCompletionProvider(context.extensionUri.fsPath);
        });
        safeRegister('register commands', () => registerCommands(context));
        safeRegister('register formatting providers', () => registerFormattingProviders(context));
        safeRegister('register diagnostics', () => registerDiagnostics(context));
        safeRegister('register providers', () => registerProviders(context));
        safeRegister('register parameter highlighter', () => registerParameterHighlighter(context));
        safeRegister('register completion', () => registerCompletion(context, completionProvider));
        if (statusBarProvider)
            context.subscriptions.push(statusBarProvider);
        context.subscriptions.push((0, configManager_1.getConfigManager)());
        context.subscriptions.push((0, DocumentAstCache_1.getDocumentAstCache)());
        console.log('Hive Formatter: activation complete');
    }
    catch (e) {
        console.error('Hive Formatter: activation failed', e);
        vscode.window.showErrorMessage('Hive Formatter failed to activate. Check the developer console for details.');
    }
}
function deactivate() {
    if (diagnosticsProvider) {
        diagnosticsProvider.dispose();
    }
    (0, SqlParserEngine_1.resetParserEngine)();
}
//# sourceMappingURL=extension.js.map