import * as vscode from "vscode"
import { SqlFormattingProvider } from "./providers/SqlFormattingProvider"
import { sqlDialects, isSqlDocument, getSqlLanguageIds } from "./core/sqlDialects"
import { formatSelectionCommand } from "./commands/formatSelectionCommand"
import { toggleComment, toggleAdvancedComment } from "./commands/commentCommands"
import { convertMysqlToHiveCommand, convertHiveToMysqlCommand } from "./commands/converterCommands"
import { openConfigEditorCommand } from "./commands/configEditorCommand"
import { initI18n } from "./i18n"
import { getConfigManager, createConfigManager } from "./core/configManager"
import { getDocumentAstCache } from "./parser/DocumentAstCache"
import { Lazy, lazy } from "./utils/lazy"
import { getErrorHandler, ErrorLevel, ErrorCategory } from "./core/errorHandler"
import { getPerformanceMonitor } from "./core/performanceMonitor"
import { getContainer, Tokens } from "./core/diContainer"
import { createParserEngine, resetParserEngine } from "./parser/SqlParserEngine"
import { createRuleRegistry, resetRuleRegistry } from "./linter/RuleRegistry"
import { SqlCodeActionProvider } from "./providers/SqlCodeActionProvider"
import { SqlDiagnosticsProvider } from "./providers/SqlDiagnosticsProvider"
import { StatusBarProvider } from "./providers/StatusBarProvider"
import { SqlParameterHighlighter, SqlParameterReplaceCommand } from "./providers/SqlParameterHightlighter"
import { SqlCompletionProvider } from "./completion"
import { SqlFoldingRangeProvider } from "./providers/SqlFoldingRangeProvider"
import { SqlOutlineProvider } from "./providers/SqlOutlineProvider"
import { SqlHoverProvider } from "./providers/SqlHoverProvider"
import { AstNavigator } from "./navigation/AstNavigator"
import { SqlDefinitionProvider } from "./navigation/SqlDefinitionProvider"
import { SqlReferenceProvider } from "./navigation/SqlReferenceProvider"
import { SqlRenameProvider } from "./navigation/SqlRenameProvider"
import { DatabaseModule } from "./database/DatabaseModule"
import { ConnectionManager } from "./database/connection/ConnectionManager"
import { ConnectionStore } from "./database/connection/ConnectionStore"
import { SchemaCache } from "./database/schema/SchemaCache"
import { SchemaProvider } from "./database/schema/SchemaProvider"
import { QueryExecutor } from "./database/query/QueryExecutor"
import { SafeQueryGuard } from "./database/query/SafeQueryGuard"
import { QueryHistory } from "./database/history/QueryHistory"
import { SqlStatementDetector } from "./database/query/SqlStatementDetector"

interface ExtensionModule {
  name: string
  register: (context: vscode.ExtensionContext) => void | Promise<void>
}

interface ProviderMap {
  diagnosticsProvider: Lazy<SqlDiagnosticsProvider>
  statusBarProvider: Lazy<StatusBarProvider>
  parameterHighlighter: Lazy<SqlParameterHighlighter>
  completionProvider: Lazy<SqlCompletionProvider>
  codeActionProvider: Lazy<SqlCodeActionProvider>
  foldingRangeProvider: Lazy<SqlFoldingRangeProvider>
  outlineProvider: Lazy<SqlOutlineProvider>
  hoverProvider: Lazy<SqlHoverProvider>
  astNavigator: Lazy<AstNavigator>
  definitionProvider: Lazy<SqlDefinitionProvider>
  referenceProvider: Lazy<SqlReferenceProvider>
  renameProvider: Lazy<SqlRenameProvider>
}

let lazyProviders: ProviderMap | null = null

function createLazyProviders(extensionPath: string): ProviderMap {
  const providers: ProviderMap = {
    diagnosticsProvider: lazy(() => new SqlDiagnosticsProvider()),
    statusBarProvider: lazy(() => new StatusBarProvider()),
    parameterHighlighter: lazy(() => new SqlParameterHighlighter()),
    completionProvider: lazy(() => new SqlCompletionProvider(extensionPath)),
    codeActionProvider: lazy(() => new SqlCodeActionProvider()),
    foldingRangeProvider: lazy(() => new SqlFoldingRangeProvider()),
    outlineProvider: lazy(() => new SqlOutlineProvider()),
    hoverProvider: lazy(() => new SqlHoverProvider()),
    astNavigator: lazy(() => new AstNavigator()),
    definitionProvider: lazy(() => {
      const nav = providers.astNavigator.get()
      return new SqlDefinitionProvider(nav)
    }),
    referenceProvider: lazy(() => {
      const nav = providers.astNavigator.get()
      return new SqlReferenceProvider(nav)
    }),
    renameProvider: lazy(() => {
      const nav = providers.astNavigator.get()
      return new SqlRenameProvider(nav)
    }),
  }
  return providers
}

const errorHandler = getErrorHandler()
const perfMonitor = getPerformanceMonitor()

function _safeRegister(label: string, fn: () => void): void {
  errorHandler.try(fn, label, {
    level: ErrorLevel.ERROR,
    category: ErrorCategory.CRITICAL,
  })
}

async function safeRegisterAsync(label: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn()
  } catch (e) {
    errorHandler.handle(e, label, ErrorLevel.ERROR, ErrorCategory.CRITICAL)
  }
}

function registerCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("sql-all-in-one.format-selection", formatSelectionCommand),
    vscode.commands.registerCommand("sql-all-in-one.toggleComment", toggleComment),
    vscode.commands.registerCommand("sql-all-in-one.toggleAdvancedComment", toggleAdvancedComment),
    vscode.commands.registerCommand("sql-all-in-one.mysql-to-hive", convertMysqlToHiveCommand),
    vscode.commands.registerCommand("sql-all-in-one.hive-to-mysql", convertHiveToMysqlCommand),
    vscode.commands.registerCommand("sql-all-in-one.open-config-editor", () =>
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
  if (!lazyProviders) return
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
  if (!lazyProviders) return
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
  if (!lazyProviders) return
  const completionProvider = lazyProviders.completionProvider.get()
  if (!completionProvider) return

  const sqlLanguages = getSqlLanguageIds()
  const triggerChars: string[] = ['.', ' ', '(']

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
  if (!lazyProviders) return
  const parameterHighlighter = lazyProviders.parameterHighlighter.get()
  if (!parameterHighlighter) return

  SqlParameterReplaceCommand.register(context)
  context.subscriptions.push(parameterHighlighter)
}

function registerServicesToContainer(): void {
  const container = getContainer()

  container.registerFactory(Tokens.ConfigManager, createConfigManager)
  container.registerFactory(Tokens.ParserEngine, createParserEngine)
  container.registerFactory(Tokens.RuleRegistry, createRuleRegistry)
  container.registerFactory(Tokens.ErrorHandler, () => getErrorHandler())
  container.registerFactory(Tokens.PerformanceMonitor, () => getPerformanceMonitor())
  container.registerFactory(Tokens.DocumentAstCache, () => getDocumentAstCache())
  container.registerFactory(Tokens.ConnectionManager, () => ConnectionManager.getInstance())
  container.registerFactory(Tokens.ConnectionStore, () => ConnectionStore.getInstance())
  container.registerFactory(Tokens.SchemaProvider, () => SchemaProvider.getInstance())
  container.registerFactory(Tokens.SchemaCache, () => SchemaCache.getInstance())
  container.registerFactory(Tokens.QueryExecutor, () => new QueryExecutor())
  container.registerFactory(Tokens.SafeQueryGuard, () => new SafeQueryGuard())
  container.registerFactory(Tokens.QueryHistory, () => new QueryHistory())
  container.registerFactory(Tokens.SqlStatementDetector, () => new SqlStatementDetector())
}

function createModules(): ExtensionModule[] {
  return [
    { name: 'services', register: () => registerServicesToContainer() },
    { name: 'i18n', register: () => initI18n() },
    { name: 'commands', register: (ctx) => registerCommands(ctx) },
    { name: 'formatting', register: (ctx) => registerFormattingProviders(ctx) },
    { name: 'diagnostics', register: (ctx) => registerDiagnostics(ctx) },
    { name: 'providers', register: (ctx) => registerProviders(ctx) },
    { name: 'completion', register: (ctx) => registerCompletion(ctx) },
    { name: 'parameterHighlighter', register: (ctx) => registerParameterHighlighter(ctx) },
    { name: 'astNavigatorEvents', register: (ctx) => {
      if (!lazyProviders) return
      const navigator = lazyProviders.astNavigator.get()
      if (navigator) {
        ctx.subscriptions.push(
          vscode.workspace.onDidChangeTextDocument(e => {
            if (isSqlDocument(e.document)) navigator.invalidate(e.document)
          }),
          vscode.workspace.onDidCloseTextDocument(doc => navigator.invalidate(doc))
        )
      }
    }},
    { name: 'statusBar', register: (ctx) => {
      if (!lazyProviders) return
      if (lazyProviders.statusBarProvider.isInitialized || vscode.workspace.textDocuments.some(isSqlDocument)) {
        const statusBar = lazyProviders.statusBarProvider.get()
        if (statusBar) ctx.subscriptions.push(statusBar)
      }
    }},
    { name: 'database', register: async (ctx) => {
      const dbModule = new DatabaseModule(ctx)
      await dbModule.initialize()
      ctx.subscriptions.push({
        dispose: async () => await dbModule.dispose()
      })
    }},
  ]
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  lazyProviders = createLazyProviders(context.extensionPath)

  await perfMonitor.measureAsync('Extension.activate', async () => {
    console.log('SQL All in One: activating...')

    try {
      const modules = createModules()
      for (const mod of modules) {
        await safeRegisterAsync('register ' + mod.name, () => mod.register(context))
      }

      context.subscriptions.push(getConfigManager())
      context.subscriptions.push(getDocumentAstCache())

      console.log('SQL All in One: activation complete')
    } catch (e) {
      errorHandler.handle(e, 'Extension activation', ErrorLevel.FATAL, ErrorCategory.CRITICAL)
    }
  })
}

export function deactivate(): void {
  getContainer().disposeAll()
  lazyProviders = null
  resetParserEngine()
  resetRuleRegistry()
  SchemaCache.resetInstance()
  SchemaProvider.resetInstance()
  ConnectionManager.resetInstance()
  ConnectionStore.resetInstance()
}
