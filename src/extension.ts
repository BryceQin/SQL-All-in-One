import * as vscode from "vscode"
import { SqlFormattingProvider } from "./providers/SqlFormattingProvider"
import { sqlDialects, isSqlDocument, getSqlLanguageIds } from "./core/sqlDialects"
import { formatSelectionCommand } from "./commands/formatSelectionCommand"
import { toggleComment, toggleAdvancedComment } from "./commands/commentCommands"
import { convertMysqlToHiveCommand, convertHiveToMysqlCommand } from "./commands/converterCommands"
import { openConfigEditorCommand } from "./commands/configEditorCommand"
import { initI18n } from "./i18n"
import { getConfigManager } from "./core/configManager"
import { resetParserEngine } from "./parser/SqlParserEngine"
import { getDocumentAstCache } from "./parser/DocumentAstCache"
import { Lazy, lazy } from "./utils/lazy"
import { getErrorHandler, ErrorLevel, ErrorCategory } from "./core/errorHandler"
import { getPerformanceMonitor } from "./core/performanceMonitor"

const lazyProviders: Record<string, Lazy<any>> = {
  diagnosticsProvider: lazy(() => {
    const { SqlDiagnosticsProvider } = require("./providers/SqlDiagnosticsProvider")
    return new SqlDiagnosticsProvider()
  }),
  statusBarProvider: lazy(() => {
    const { StatusBarProvider } = require("./providers/StatusBarProvider")
    return new StatusBarProvider()
  }),
  parameterHighlighter: lazy(() => {
    const { SqlParameterHighlighter } = require("./providers/SqlParameterHightlighter")
    return new SqlParameterHighlighter()
  }),
  completionProvider: lazy(() => {
    const { SqlCompletionProvider } = require("./completion")
    return new SqlCompletionProvider('')
  }),
  codeActionProvider: lazy(() => {
    const { SqlCodeActionProvider } = require("./providers/SqlCodeActionProvider")
    return new SqlCodeActionProvider()
  }),
  foldingRangeProvider: lazy(() => {
    const { SqlFoldingRangeProvider } = require("./providers/SqlFoldingRangeProvider")
    return new SqlFoldingRangeProvider()
  }),
  outlineProvider: lazy(() => {
    const { SqlOutlineProvider } = require("./providers/SqlOutlineProvider")
    return new SqlOutlineProvider()
  }),
  hoverProvider: lazy(() => {
    const { SqlHoverProvider } = require("./providers/SqlHoverProvider")
    return new SqlHoverProvider()
  }),
  astNavigator: lazy(() => {
    const { AstNavigator } = require("./navigation/AstNavigator")
    return new AstNavigator()
  }),
  definitionProvider: lazy(() => {
    const { SqlDefinitionProvider } = require("./navigation/SqlDefinitionProvider")
    const navigator = lazyProviders.astNavigator.get()
    return new SqlDefinitionProvider(navigator)
  }),
  referenceProvider: lazy(() => {
    const { SqlReferenceProvider } = require("./navigation/SqlReferenceProvider")
    const navigator = lazyProviders.astNavigator.get()
    return new SqlReferenceProvider(navigator)
  }),
  renameProvider: lazy(() => {
    const { SqlRenameProvider } = require("./navigation/SqlRenameProvider")
    const navigator = lazyProviders.astNavigator.get()
    return new SqlRenameProvider(navigator)
  }),
}

const errorHandler = getErrorHandler()
const perfMonitor = getPerformanceMonitor()

function safeRegister(label: string, fn: () => void): void {
  errorHandler.try(fn, label, {
    level: ErrorLevel.ERROR,
    category: ErrorCategory.CRITICAL,
  })
}

function registerCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("hive-formatter.format-selection", formatSelectionCommand),
    vscode.commands.registerCommand("hive-formatter.toggleComment", toggleComment),
    vscode.commands.registerCommand("hive-formatter.toggleAdvancedComment", toggleAdvancedComment),
    vscode.commands.registerCommand("hive-formatter.mysql-to-hive", convertMysqlToHiveCommand),
    vscode.commands.registerCommand("hive-formatter.hive-to-mysql", convertHiveToMysqlCommand),
    vscode.commands.registerCommand("hive-formatter.open-config-editor", () =>
      openConfigEditorCommand(context.extensionUri)
    ),
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
  const dp = lazyProviders.diagnosticsProvider.get()
  if (!dp) return

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

  const codeActionProvider = lazyProviders.codeActionProvider.get()
  const foldingRangeProvider = lazyProviders.foldingRangeProvider.get()
  const outlineProvider = lazyProviders.outlineProvider.get()
  const hoverProvider = lazyProviders.hoverProvider.get()
  const definitionProvider = lazyProviders.definitionProvider.get()
  const referenceProvider = lazyProviders.referenceProvider.get()
  const renameProvider = lazyProviders.renameProvider.get()

  for (const lang of sqlLanguages) {
    const selector = { language: lang }

    context.subscriptions.push(
      vscode.languages.registerCodeActionsProvider(
        selector,
        codeActionProvider,
        { providedCodeActionKinds: (codeActionProvider as any).constructor.providedCodeActionKinds },
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

    if (definitionProvider) {
      context.subscriptions.push(
        vscode.languages.registerDefinitionProvider(selector, definitionProvider)
      )
    }

    if (referenceProvider) {
      context.subscriptions.push(
        vscode.languages.registerReferenceProvider(selector, referenceProvider)
      )
    }

    if (renameProvider) {
      context.subscriptions.push(
        vscode.languages.registerRenameProvider(selector, renameProvider)
      )
    }
  }
}

function registerCompletion(context: vscode.ExtensionContext): void {
  const completionProvider = lazyProviders.completionProvider.get()
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
  const parameterHighlighter = lazyProviders.parameterHighlighter.get()
  if (!parameterHighlighter) return

  const { SqlParameterReplaceCommand } = require("./providers/SqlParameterHightlighter")
  SqlParameterReplaceCommand.register(context)
  context.subscriptions.push(parameterHighlighter)
}

export function activate(context: vscode.ExtensionContext): void {
  perfMonitor.measure('Extension.activate', () => {
    console.log('Hive Formatter: activating...')

    try {
      safeRegister('initialize i18n', () => initI18n())

      safeRegister('register commands', () => registerCommands(context))
      safeRegister('register formatting providers', () => registerFormattingProviders(context))

      setTimeout(() => {
        safeRegister('register diagnostics', () => registerDiagnostics(context))
        safeRegister('register providers', () => registerProviders(context))
        safeRegister('register completion', () => registerCompletion(context))
        safeRegister('register parameter highlighter', () => registerParameterHighlighter(context))

        const navigator = lazyProviders.astNavigator.get()
        if (navigator) {
          context.subscriptions.push(
            vscode.workspace.onDidChangeTextDocument(e => {
              if (isSqlDocument(e.document)) {
                navigator.invalidate(e.document)
              }
            }),
            vscode.workspace.onDidCloseTextDocument(doc => {
              navigator.invalidate(doc)
            })
          )
        }

        if (lazyProviders.statusBarProvider.isInitialized || vscode.workspace.textDocuments.some(isSqlDocument)) {
          const statusBar = lazyProviders.statusBarProvider.get()
          if (statusBar) {
            context.subscriptions.push(statusBar)
          }
        }
      }, 100)

      context.subscriptions.push(getConfigManager())
      context.subscriptions.push(getDocumentAstCache())

      console.log('Hive Formatter: activation complete')
    } catch (e) {
      errorHandler.handle(e, 'Extension activation', ErrorLevel.FATAL, ErrorCategory.CRITICAL)
    }
  })
}

export function deactivate(): void {
  if (lazyProviders.diagnosticsProvider.isInitialized) {
    const dp = lazyProviders.diagnosticsProvider.get()
    if (dp) {
      dp.dispose()
    }
  }
  resetParserEngine()
}
