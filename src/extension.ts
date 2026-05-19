import * as vscode from "vscode"
import { SqlFormattingProvider } from "./providers/SqlFormattingProvider"
import { sqlDialects } from "./core/sqlDialects"
import { formatSelectionCommand } from "./commands/formatSelectionCommand"
import { convertMysqlToHiveCommand, convertHiveToMysqlCommand } from "./commands/converterCommands"
import { SqlDiagnosticsProvider } from "./providers/SqlDiagnosticsProvider"
import { openConfigEditorCommand } from "./commands/configEditorCommand"
import { StatusBarProvider } from "./providers/StatusBarProvider"
import { SqlCodeActionProvider } from "./providers/SqlCodeActionProvider"
import { SqlFoldingRangeProvider } from "./providers/SqlFoldingRangeProvider"
import { SqlOutlineProvider } from "./providers/SqlOutlineProvider"
import { SqlParameterHighlighter, SqlParameterReplaceCommand } from "./providers/SqlParameterHightlighter"
import { SqlCompletionProvider } from "./completion"

let diagnosticsProvider: SqlDiagnosticsProvider
let statusBarProvider: StatusBarProvider
let parameterHighlighter: SqlParameterHighlighter

export function activate(context: vscode.ExtensionContext) {
    console.log('Congratulations, your extension "hive-formatter" is now active!')

    diagnosticsProvider = new SqlDiagnosticsProvider()
    statusBarProvider = new StatusBarProvider()
    parameterHighlighter = new SqlParameterHighlighter()
    const completionProvider = new SqlCompletionProvider(context.extensionUri.fsPath)
    const triggerChars = [...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.']

    context.subscriptions.push(
        vscode.commands.registerCommand(
            "hive-formatter.format-selection",
            formatSelectionCommand,
        ),
        vscode.commands.registerCommand(
            "hive-formatter.mysql-to-hive",
            convertMysqlToHiveCommand,
        ),
        vscode.commands.registerCommand(
            "hive-formatter.hive-to-mysql",
            convertHiveToMysqlCommand,
        ),
        vscode.commands.registerCommand(
            "hive-formatter.open-config-editor",
            () => openConfigEditorCommand(context.extensionUri),
        ),
        ...registerFormattingProviderForEachDialect(),
        vscode.workspace.onDidChangeTextDocument((event) => {
            const document = event.document
            if (isSqlDocument(document)) {
                diagnosticsProvider.provideDiagnostics(document)
            }
        }),
        vscode.workspace.onDidOpenTextDocument((document) => {
            if (isSqlDocument(document)) {
                diagnosticsProvider.provideDiagnostics(document)
            }
        }),
        vscode.workspace.onDidSaveTextDocument((document) => {
            if (isSqlDocument(document)) {
                diagnosticsProvider.provideDiagnostics(document)
            }
        }),
        vscode.languages.registerCodeActionsProvider(
            { scheme: 'file', language: 'sql' },
            new SqlCodeActionProvider(),
            { providedCodeActionKinds: SqlCodeActionProvider.providedCodeActionKinds }
        ),
        vscode.languages.registerCodeActionsProvider(
            { scheme: 'file', language: 'hive' },
            new SqlCodeActionProvider(),
            { providedCodeActionKinds: SqlCodeActionProvider.providedCodeActionKinds }
        ),
        // 注册代码折叠提供者
        vscode.languages.registerFoldingRangeProvider(
            { scheme: 'file', language: 'sql' },
            new SqlFoldingRangeProvider()
        ),
        vscode.languages.registerFoldingRangeProvider(
            { scheme: 'file', language: 'hive' },
            new SqlFoldingRangeProvider()
        ),
        // 注册大纲视图提供者
        vscode.languages.registerDocumentSymbolProvider(
            { scheme: 'file', language: 'sql' },
            new SqlOutlineProvider()
        ),
        vscode.languages.registerDocumentSymbolProvider(
            { scheme: 'file', language: 'hive' },
            new SqlOutlineProvider()
        ),
        // 注册参数替换命令
        SqlParameterReplaceCommand.register(context),
        // 注册智能补全
        vscode.languages.registerCompletionItemProvider(
            { scheme: 'file', language: 'sql' },
            completionProvider, ...triggerChars
        ),
        vscode.languages.registerCompletionItemProvider(
            { scheme: 'file', language: 'hive' },
            completionProvider, ...triggerChars
        ),
        diagnosticsProvider,
        statusBarProvider,
        parameterHighlighter,
    )

    vscode.workspace.textDocuments.forEach((document) => {
        if (isSqlDocument(document)) {
            diagnosticsProvider.provideDiagnostics(document)
        }
    })
}

function isSqlDocument(document: vscode.TextDocument): boolean {
    const sqlLanguages = Object.keys(sqlDialects)
    return sqlLanguages.includes(document.languageId)
}

function registerFormattingProviderForEachDialect() {
    return Object.entries(sqlDialects).map(([vscodeLang, sqlDialectName]) =>
        vscode.languages.registerDocumentFormattingEditProvider(
            vscodeLang,
            new SqlFormattingProvider(sqlDialectName),
        ),
    )
}

export function deactivate() {
    if (diagnosticsProvider) {
        diagnosticsProvider.dispose()
    }
    if (statusBarProvider) {
        statusBarProvider.dispose()
    }
    if (parameterHighlighter) {
        parameterHighlighter.dispose()
    }
}
