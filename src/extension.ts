import * as vscode from "vscode"
import { SqlFormattingProvider } from "./providers/SqlFormattingProvider"
import { sqlDialects } from "./core/sqlDialects"
import { formatSelectionCommand } from "./commands/formatSelectionCommand"
import { toggleComment, toggleAdvancedComment } from "./commands/commentCommands"
import { convertMysqlToHiveCommand, convertHiveToMysqlCommand } from "./commands/converterCommands"
import { SqlDiagnosticsProvider } from "./providers/SqlDiagnosticsProvider"
import { openConfigEditorCommand } from "./commands/configEditorCommand"
import { StatusBarProvider } from "./providers/StatusBarProvider"
import { SqlCodeActionProvider } from "./providers/SqlCodeActionProvider"
import { SqlFoldingRangeProvider } from "./providers/SqlFoldingRangeProvider"
import { SqlOutlineProvider } from "./providers/SqlOutlineProvider"
import { SqlParameterHighlighter, SqlParameterReplaceCommand } from "./providers/SqlParameterHightlighter"
import { SqlCompletionProvider, } from "./completion"

let diagnosticsProvider: SqlDiagnosticsProvider
let statusBarProvider: StatusBarProvider
let parameterHighlighter: SqlParameterHighlighter

export function activate(context: vscode.ExtensionContext) {
    console.log('Hive Formatter: activating...')

    try {
        diagnosticsProvider = new SqlDiagnosticsProvider()
    } catch (e) {
        console.error('Hive Formatter: failed to create SqlDiagnosticsProvider', e)
    }
    try {
        statusBarProvider = new StatusBarProvider()
    } catch (e) {
        console.error('Hive Formatter: failed to create StatusBarProvider', e)
    }
    try {
        parameterHighlighter = new SqlParameterHighlighter()
    } catch (e) {
        console.error('Hive Formatter: failed to create SqlParameterHighlighter', e)
    }

    let completionProvider: SqlCompletionProvider | undefined
    try {
        completionProvider = new SqlCompletionProvider(context.extensionUri.fsPath)
    } catch (e) {
        console.error('Hive Formatter: failed to create SqlCompletionProvider', e)
    }

    const triggerChars = [...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.']

    context.subscriptions.push(
        vscode.commands.registerCommand(
            "hive-formatter.format-selection",
            formatSelectionCommand,
        ),
        vscode.commands.registerCommand(
            "hive-formatter.toggleComment",
            toggleComment,
        ),
        vscode.commands.registerCommand(
            "hive-formatter.toggleAdvancedComment",
            toggleAdvancedComment,
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
    )

    if (diagnosticsProvider) {
        const dp = diagnosticsProvider
        context.subscriptions.push(
            vscode.workspace.onDidChangeTextDocument((event) => {
                const document = event.document
                if (isSqlDocument(document)) {
                    dp.provideDiagnostics(document)
                }
            }),
            vscode.workspace.onDidOpenTextDocument((document) => {
                if (isSqlDocument(document)) {
                    dp.provideDiagnostics(document)
                }
            }),
            vscode.workspace.onDidSaveTextDocument((document) => {
                if (isSqlDocument(document)) {
                    dp.provideDiagnostics(document)
                }
            }),
            dp,
        )
    }

    try {
        const sqlLanguages = Object.keys(sqlDialects)
        context.subscriptions.push(
            ...sqlLanguages.map(lang =>
                vscode.languages.registerCodeActionsProvider(
                    { language: lang },
                    new SqlCodeActionProvider(),
                    { providedCodeActionKinds: SqlCodeActionProvider.providedCodeActionKinds }
                )
            ),
        )
    } catch (e) {
        console.error('Hive Formatter: failed to register CodeActionProvider', e)
    }

    try {
        const sqlLanguages = Object.keys(sqlDialects)
        context.subscriptions.push(
            ...sqlLanguages.map(lang =>
                vscode.languages.registerFoldingRangeProvider(
                    { language: lang },
                    new SqlFoldingRangeProvider()
                )
            ),
        )
    } catch (e) {
        console.error('Hive Formatter: failed to register FoldingRangeProvider', e)
    }

    try {
        const sqlLanguages = Object.keys(sqlDialects)
        context.subscriptions.push(
            ...sqlLanguages.map(lang =>
                vscode.languages.registerDocumentSymbolProvider(
                    { language: lang },
                    new SqlOutlineProvider()
                )
            ),
        )
    } catch (e) {
        console.error('Hive Formatter: failed to register OutlineProvider', e)
    }

    try {
        SqlParameterReplaceCommand.register(context)
    } catch (e) {
        console.error('Hive Formatter: failed to register SqlParameterReplaceCommand', e)
    }

    if (completionProvider) {
        try {
            const sqlLanguages = Object.keys(sqlDialects)
            context.subscriptions.push(
                ...sqlLanguages.map(lang =>
                    vscode.languages.registerCompletionItemProvider(
                        { language: lang },
                        completionProvider, ...triggerChars
                    )
                )
            )
        } catch (e) {
            console.error('Hive Formatter: failed to register CompletionProvider', e)
        }
    }

    if (statusBarProvider) {
        context.subscriptions.push(statusBarProvider)
    }
    if (parameterHighlighter) {
        context.subscriptions.push(parameterHighlighter)
    }

    if (diagnosticsProvider) {
        const dp = diagnosticsProvider
        vscode.workspace.textDocuments.forEach((document) => {
            if (isSqlDocument(document)) {
                dp.provideDiagnostics(document)
            }
        })
    }

    console.log('Hive Formatter: activation complete')
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
