import * as vscode from "vscode"
import { SqlFormattingProvider } from "./providers/SqlFormattingProvider"
import { sqlDialects, isSqlDocument, getSqlLanguageIds } from "./core/sqlDialects"
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
import { SqlCompletionProvider } from "./completion"
import { SqlHoverProvider } from "./providers/SqlHoverProvider"
import { initI18n } from "./i18n"
import { getConfigManager } from "./core/configManager"
import { resetParserEngine } from "./parser/SqlParserEngine"
import { getDocumentAstCache } from "./parser/DocumentAstCache"

let diagnosticsProvider: SqlDiagnosticsProvider
let statusBarProvider: StatusBarProvider
let parameterHighlighter: SqlParameterHighlighter

function safeRegister(label: string, fn: () => void): void {
    try {
        fn()
    } catch (e) {
        console.error(`Hive Formatter: failed to ${label}`, e)
    }
}

function registerCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand("hive-formatter.format-selection", formatSelectionCommand),
        vscode.commands.registerCommand("hive-formatter.toggleComment", toggleComment),
        vscode.commands.registerCommand("hive-formatter.toggleAdvancedComment", toggleAdvancedComment),
        vscode.commands.registerCommand("hive-formatter.mysql-to-hive", convertMysqlToHiveCommand),
        vscode.commands.registerCommand("hive-formatter.hive-to-mysql", convertHiveToMysqlCommand),
        vscode.commands.registerCommand("hive-formatter.open-config-editor", () => openConfigEditorCommand(context.extensionUri)),
    )
}

function registerFormattingProviders(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        ...Object.entries(sqlDialects).map(([vscodeLang, sqlDialectName]) =>
            vscode.languages.registerDocumentFormattingEditProvider(
                vscodeLang,
                new SqlFormattingProvider(sqlDialectName),
            ),
        ),
    )
}

function registerDiagnostics(context: vscode.ExtensionContext): void {
    if (!diagnosticsProvider) return
    const dp = diagnosticsProvider

    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument((event) => {
            if (isSqlDocument(event.document)) {
                dp.debouncedProvideDiagnostics(event.document)
            }
        }),
        vscode.workspace.onDidOpenTextDocument((document) => {
            if (isSqlDocument(document)) dp.provideDiagnostics(document)
        }),
        vscode.workspace.onDidSaveTextDocument((document) => {
            if (isSqlDocument(document)) dp.provideDiagnostics(document)
        }),
        dp,
    )

    vscode.workspace.textDocuments.forEach((document) => {
        if (isSqlDocument(document)) dp.provideDiagnostics(document)
    })
}

function registerProviders(context: vscode.ExtensionContext): void {
    const sqlLanguages = getSqlLanguageIds()

    // Singleton stateless providers
    const codeActionProvider = new SqlCodeActionProvider()
    const foldingRangeProvider = new SqlFoldingRangeProvider()
    const outlineProvider = new SqlOutlineProvider()
    const hoverProvider = new SqlHoverProvider()

    for (const lang of sqlLanguages) {
        const selector = { language: lang }

        context.subscriptions.push(
            vscode.languages.registerCodeActionsProvider(
                selector,
                codeActionProvider,
                { providedCodeActionKinds: SqlCodeActionProvider.providedCodeActionKinds },
            ),
        )

        context.subscriptions.push(
            vscode.languages.registerFoldingRangeProvider(selector, foldingRangeProvider),
        )

        context.subscriptions.push(
            vscode.languages.registerDocumentSymbolProvider(selector, outlineProvider),
        )

        context.subscriptions.push(
            vscode.languages.registerHoverProvider(selector, hoverProvider),
        )
    }
}

function registerCompletion(context: vscode.ExtensionContext, completionProvider: SqlCompletionProvider | undefined): void {
    if (!completionProvider) return
    const sqlLanguages = getSqlLanguageIds()
    const triggerChars = [...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.']

    for (const lang of sqlLanguages) {
        context.subscriptions.push(
            vscode.languages.registerCompletionItemProvider(
                { language: lang },
                completionProvider,
                ...triggerChars,
            ),
        )
    }

    context.subscriptions.push(completionProvider)
}

function registerParameterHighlighter(context: vscode.ExtensionContext): void {
    if (!parameterHighlighter) return
    SqlParameterReplaceCommand.register(context)
    context.subscriptions.push(parameterHighlighter)
}

export function activate(context: vscode.ExtensionContext) {
    try {
        safeRegister('initialize i18n', () => initI18n())
        console.log('Hive Formatter: activating...')

        safeRegister('create SqlDiagnosticsProvider', () => {
            diagnosticsProvider = new SqlDiagnosticsProvider()
        })
        safeRegister('create StatusBarProvider', () => {
            statusBarProvider = new StatusBarProvider()
        })
        safeRegister('create SqlParameterHighlighter', () => {
            parameterHighlighter = new SqlParameterHighlighter()
        })

        let completionProvider: SqlCompletionProvider | undefined
        safeRegister('create SqlCompletionProvider', () => {
            completionProvider = new SqlCompletionProvider(context.extensionUri.fsPath)
        })

        safeRegister('register commands', () => registerCommands(context))
        safeRegister('register formatting providers', () => registerFormattingProviders(context))
        safeRegister('register diagnostics', () => registerDiagnostics(context))
        safeRegister('register providers', () => registerProviders(context))
        safeRegister('register parameter highlighter', () => registerParameterHighlighter(context))
        safeRegister('register completion', () => registerCompletion(context, completionProvider))

        if (statusBarProvider) context.subscriptions.push(statusBarProvider)

        context.subscriptions.push(getConfigManager())
        context.subscriptions.push(getDocumentAstCache())

        console.log('Hive Formatter: activation complete')
    } catch (e) {
        console.error('Hive Formatter: activation failed', e)
        vscode.window.showErrorMessage('Hive Formatter failed to activate. Check the developer console for details.')
    }
}

export function deactivate() {
    if (diagnosticsProvider) {
        diagnosticsProvider.dispose()
    }
    resetParserEngine()
}
