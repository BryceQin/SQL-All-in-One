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
    console.log('Congratulations, your extension "hive-formatter" is now active!');
    diagnosticsProvider = new SqlDiagnosticsProvider_1.SqlDiagnosticsProvider();
    statusBarProvider = new StatusBarProvider_1.StatusBarProvider();
    parameterHighlighter = new SqlParameterHightlighter_1.SqlParameterHighlighter();
    const completionProvider = new completion_1.SqlCompletionProvider(context.extensionUri.fsPath);
    const triggerChars = [...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.'];
    context.subscriptions.push(vscode.commands.registerCommand("hive-formatter.format-selection", formatSelectionCommand_1.formatSelectionCommand), vscode.commands.registerCommand("hive-formatter.mysql-to-hive", converterCommands_1.convertMysqlToHiveCommand), vscode.commands.registerCommand("hive-formatter.hive-to-mysql", converterCommands_1.convertHiveToMysqlCommand), vscode.commands.registerCommand("hive-formatter.open-config-editor", () => (0, configEditorCommand_1.openConfigEditorCommand)(context.extensionUri)), ...registerFormattingProviderForEachDialect(), vscode.workspace.onDidChangeTextDocument((event) => {
        const document = event.document;
        if (isSqlDocument(document)) {
            diagnosticsProvider.provideDiagnostics(document);
        }
    }), vscode.workspace.onDidOpenTextDocument((document) => {
        if (isSqlDocument(document)) {
            diagnosticsProvider.provideDiagnostics(document);
        }
    }), vscode.workspace.onDidSaveTextDocument((document) => {
        if (isSqlDocument(document)) {
            diagnosticsProvider.provideDiagnostics(document);
        }
    }), vscode.languages.registerCodeActionsProvider({ scheme: 'file', language: 'sql' }, new SqlCodeActionProvider_1.SqlCodeActionProvider(), { providedCodeActionKinds: SqlCodeActionProvider_1.SqlCodeActionProvider.providedCodeActionKinds }), vscode.languages.registerCodeActionsProvider({ scheme: 'file', language: 'hive' }, new SqlCodeActionProvider_1.SqlCodeActionProvider(), { providedCodeActionKinds: SqlCodeActionProvider_1.SqlCodeActionProvider.providedCodeActionKinds }), 
    // 注册代码折叠提供者
    vscode.languages.registerFoldingRangeProvider({ scheme: 'file', language: 'sql' }, new SqlFoldingRangeProvider_1.SqlFoldingRangeProvider()), vscode.languages.registerFoldingRangeProvider({ scheme: 'file', language: 'hive' }, new SqlFoldingRangeProvider_1.SqlFoldingRangeProvider()), 
    // 注册大纲视图提供者
    vscode.languages.registerDocumentSymbolProvider({ scheme: 'file', language: 'sql' }, new SqlOutlineProvider_1.SqlOutlineProvider()), vscode.languages.registerDocumentSymbolProvider({ scheme: 'file', language: 'hive' }, new SqlOutlineProvider_1.SqlOutlineProvider()), 
    // 注册参数替换命令
    SqlParameterHightlighter_1.SqlParameterReplaceCommand.register(context), 
    // 注册智能补全
    vscode.languages.registerCompletionItemProvider({ scheme: 'file', language: 'sql' }, completionProvider, ...triggerChars), vscode.languages.registerCompletionItemProvider({ scheme: 'file', language: 'hive' }, completionProvider, ...triggerChars), diagnosticsProvider, statusBarProvider, parameterHighlighter);
    vscode.workspace.textDocuments.forEach((document) => {
        if (isSqlDocument(document)) {
            diagnosticsProvider.provideDiagnostics(document);
        }
    });
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