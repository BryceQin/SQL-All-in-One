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
let diagnosticsProvider;
let statusBarProvider;
let parameterHighlighter;
function activate(context) {
    console.log('Hive Formatter: activating...');
    try {
        diagnosticsProvider = new SqlDiagnosticsProvider_1.SqlDiagnosticsProvider();
    }
    catch (e) {
        console.error('Hive Formatter: failed to create SqlDiagnosticsProvider', e);
    }
    try {
        statusBarProvider = new StatusBarProvider_1.StatusBarProvider();
    }
    catch (e) {
        console.error('Hive Formatter: failed to create StatusBarProvider', e);
    }
    try {
        parameterHighlighter = new SqlParameterHightlighter_1.SqlParameterHighlighter();
    }
    catch (e) {
        console.error('Hive Formatter: failed to create SqlParameterHighlighter', e);
    }
    let completionProvider;
    try {
        completionProvider = new completion_1.SqlCompletionProvider(context.extensionUri.fsPath);
    }
    catch (e) {
        console.error('Hive Formatter: failed to create SqlCompletionProvider', e);
    }
    const triggerChars = [...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.'];
    context.subscriptions.push(vscode.commands.registerCommand("hive-formatter.format-selection", formatSelectionCommand_1.formatSelectionCommand), vscode.commands.registerCommand("hive-formatter.toggleComment", commentCommands_1.toggleComment), vscode.commands.registerCommand("hive-formatter.toggleAdvancedComment", commentCommands_1.toggleAdvancedComment), vscode.commands.registerCommand("hive-formatter.mysql-to-hive", converterCommands_1.convertMysqlToHiveCommand), vscode.commands.registerCommand("hive-formatter.hive-to-mysql", converterCommands_1.convertHiveToMysqlCommand), vscode.commands.registerCommand("hive-formatter.open-config-editor", () => (0, configEditorCommand_1.openConfigEditorCommand)(context.extensionUri)), ...registerFormattingProviderForEachDialect());
    if (diagnosticsProvider) {
        const dp = diagnosticsProvider;
        context.subscriptions.push(vscode.workspace.onDidChangeTextDocument((event) => {
            const document = event.document;
            if (isSqlDocument(document)) {
                dp.provideDiagnostics(document);
            }
        }), vscode.workspace.onDidOpenTextDocument((document) => {
            if (isSqlDocument(document)) {
                dp.provideDiagnostics(document);
            }
        }), vscode.workspace.onDidSaveTextDocument((document) => {
            if (isSqlDocument(document)) {
                dp.provideDiagnostics(document);
            }
        }), dp);
    }
    try {
        const sqlLanguages = Object.keys(sqlDialects_1.sqlDialects);
        context.subscriptions.push(...sqlLanguages.map(lang => vscode.languages.registerCodeActionsProvider({ language: lang }, new SqlCodeActionProvider_1.SqlCodeActionProvider(), { providedCodeActionKinds: SqlCodeActionProvider_1.SqlCodeActionProvider.providedCodeActionKinds })));
    }
    catch (e) {
        console.error('Hive Formatter: failed to register CodeActionProvider', e);
    }
    try {
        const sqlLanguages = Object.keys(sqlDialects_1.sqlDialects);
        context.subscriptions.push(...sqlLanguages.map(lang => vscode.languages.registerFoldingRangeProvider({ language: lang }, new SqlFoldingRangeProvider_1.SqlFoldingRangeProvider())));
    }
    catch (e) {
        console.error('Hive Formatter: failed to register FoldingRangeProvider', e);
    }
    try {
        const sqlLanguages = Object.keys(sqlDialects_1.sqlDialects);
        context.subscriptions.push(...sqlLanguages.map(lang => vscode.languages.registerDocumentSymbolProvider({ language: lang }, new SqlOutlineProvider_1.SqlOutlineProvider())));
    }
    catch (e) {
        console.error('Hive Formatter: failed to register OutlineProvider', e);
    }
    try {
        SqlParameterHightlighter_1.SqlParameterReplaceCommand.register(context);
    }
    catch (e) {
        console.error('Hive Formatter: failed to register SqlParameterReplaceCommand', e);
    }
    if (completionProvider) {
        try {
            const sqlLanguages = Object.keys(sqlDialects_1.sqlDialects);
            context.subscriptions.push(...sqlLanguages.map(lang => vscode.languages.registerCompletionItemProvider({ language: lang }, completionProvider, ...triggerChars)));
        }
        catch (e) {
            console.error('Hive Formatter: failed to register CompletionProvider', e);
        }
    }
    if (statusBarProvider) {
        context.subscriptions.push(statusBarProvider);
    }
    if (parameterHighlighter) {
        context.subscriptions.push(parameterHighlighter);
    }
    if (diagnosticsProvider) {
        const dp = diagnosticsProvider;
        vscode.workspace.textDocuments.forEach((document) => {
            if (isSqlDocument(document)) {
                dp.provideDiagnostics(document);
            }
        });
    }
    console.log('Hive Formatter: activation complete');
}
function isSqlDocument(document) {
    const sqlLanguages = Object.keys(sqlDialects_1.sqlDialects);
    return sqlLanguages.includes(document.languageId);
}
function registerFormattingProviderForEachDialect() {
    return Object.entries(sqlDialects_1.sqlDialects).map(([vscodeLang, sqlDialectName]) => vscode.languages.registerDocumentFormattingEditProvider(vscodeLang, new SqlFormattingProvider_1.SqlFormattingProvider(sqlDialectName)));
}
function deactivate() {
    if (diagnosticsProvider) {
        diagnosticsProvider.dispose();
    }
    if (statusBarProvider) {
        statusBarProvider.dispose();
    }
    if (parameterHighlighter) {
        parameterHighlighter.dispose();
    }
}
//# sourceMappingURL=extension.js.map