import * as vscode from 'vscode';
import { SqlFormattingProvider } from './providers/SqlFormattingProvider';
import { sqlDialects, isSqlDocument, getSqlLanguageIds } from './core/sqlDialects';
import { formatSelectionCommand } from './commands/formatSelectionCommand';
import { toggleComment, toggleAdvancedComment } from './commands/commentCommands';
import { convertMysqlToHiveCommand, convertHiveToMysqlCommand } from './commands/converterCommands';
import { openConfigEditorCommand } from './commands/configEditorCommand';
import { initI18n } from './i18n';
import { getConfigManager, createConfigManager } from './core/configManager';
import { getDocumentAstCache, createDocumentAstCache } from './parser/DocumentAstCache';
import { getErrorHandler, createErrorHandler, ErrorLevel, ErrorCategory } from './core/errorHandler';
import { createPerformanceMonitor } from './core/performanceMonitor';
import { getContainer, Tokens } from './core/diContainer';
import { createParserEngine } from './parser/SqlParserEngine';
import { createRuleRegistry } from './linter/RuleRegistry';
import { SqlCodeActionProvider } from './providers/SqlCodeActionProvider';
import { SqlDiagnosticsProvider } from './providers/SqlDiagnosticsProvider';
import { StatusBarProvider } from './providers/StatusBarProvider';
import { SqlParameterHighlighter, SqlParameterReplaceCommand } from './providers/SqlParameterHighlighter';
import { SqlCompletionProvider } from './completion';
import { SqlFoldingRangeProvider } from './providers/SqlFoldingRangeProvider';
import { SqlOutlineProvider } from './providers/SqlOutlineProvider';
import { SqlHoverProvider } from './providers/SqlHoverProvider';
import { AstNavigator } from './navigation/AstNavigator';
import { SqlDefinitionProvider } from './navigation/SqlDefinitionProvider';
import { SqlReferenceProvider } from './navigation/SqlReferenceProvider';
import { SqlRenameProvider } from './navigation/SqlRenameProvider';
import { DatabaseModule } from './database/DatabaseModule';
import { createConnectionManager } from './database/connection/ConnectionManager';
import { createConnectionStore } from './database/connection/ConnectionStore';
import { createSchemaProvider } from './database/schema/SchemaProvider';
import { createSchemaCache } from './database/schema/SchemaCache';
import { QueryExecutor } from './database/query/QueryExecutor';
import { SafeQueryGuard } from './database/query/SafeQueryGuard';
import { QueryHistory } from './database/history/QueryHistory';
import { SqlStatementDetector } from './database/query/SqlStatementDetector';
import { clearParameterScanCache } from './hover/ParameterHoverResolver';
import { clearFormatterCache } from './formatter/sqlFormatter';
import { invalidateRuleDefinitions } from './linter/lintRules';

function createLazyProvider<T>(container: ReturnType<typeof getContainer>, token: string, context: vscode.ExtensionContext): () => T {
    let instance: T | undefined;
    return () => {
        if (!instance) {
            instance = container.get<T>(token);
            if (instance) context.subscriptions.push(instance as unknown as vscode.Disposable);
        }
        return instance;
    };
}

function registerCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('hive-formatter.format-selection', formatSelectionCommand),
    vscode.commands.registerCommand('hive-formatter.toggleComment', toggleComment),
    vscode.commands.registerCommand('hive-formatter.toggleAdvancedComment', toggleAdvancedComment),
    vscode.commands.registerCommand('hive-formatter.mysql-to-hive', convertMysqlToHiveCommand),
    vscode.commands.registerCommand('hive-formatter.hive-to-mysql', convertHiveToMysqlCommand),
    vscode.commands.registerCommand('hive-formatter.open-config-editor', () => openConfigEditorCommand(context.extensionUri)),
    vscode.commands.registerCommand('hive-formatter.showErrorLog', () => {
      getErrorHandler().showOutputChannel();
    }),
  );
}

function registerFormattingProviders(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    ...Object.entries(sqlDialects).map(([vscodeLang, sqlDialectName]) =>
      vscode.languages.registerDocumentFormattingEditProvider(vscodeLang, new SqlFormattingProvider(sqlDialectName)),
    ),
  );
}

function registerDiagnostics(context: vscode.ExtensionContext): void {
  const container = getContainer();
  const getDp = createLazyProvider<SqlDiagnosticsProvider>(container, Tokens.SqlDiagnosticsProvider, context);

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (isSqlDocument(event.document)) {
        getDp()?.debouncedProvideDiagnostics(event.document);
      }
    }),
    vscode.workspace.onDidOpenTextDocument((document) => {
      if (isSqlDocument(document)) getDp()?.provideDiagnostics(document);
    }),
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (isSqlDocument(document)) getDp()?.provideDiagnostics(document);
    }),
  );

  const openSqlDocs = vscode.workspace.textDocuments.filter(isSqlDocument);
  if (openSqlDocs.length > 0) {
    queueMicrotask(() => openSqlDocs.forEach(doc => getDp()?.provideDiagnostics(doc)));
  }
}

function registerProviders(context: vscode.ExtensionContext): void {
  const container = getContainer();
  const sqlLanguages = getSqlLanguageIds();

  const lazyCodeAction = createLazyProvider<SqlCodeActionProvider>(container, Tokens.CodeActionProvider, context);
  const lazyFoldingRange = createLazyProvider<SqlFoldingRangeProvider>(container, Tokens.FoldingRangeProvider, context);
  const lazyOutline = createLazyProvider<SqlOutlineProvider>(container, Tokens.OutlineProvider, context);
  const lazyHover = createLazyProvider<SqlHoverProvider>(container, Tokens.HoverProvider, context);
  const lazyDefinition = createLazyProvider<SqlDefinitionProvider>(container, Tokens.DefinitionProvider, context);
  const lazyReference = createLazyProvider<SqlReferenceProvider>(container, Tokens.ReferenceProvider, context);
  const lazyRename = createLazyProvider<SqlRenameProvider>(container, Tokens.RenameProvider, context);

  for (const lang of sqlLanguages) {
    const selector = { language: lang };

    context.subscriptions.push(
      vscode.languages.registerCodeActionsProvider(selector, {
        provideCodeActions: (...args) => lazyCodeAction().provideCodeActions(...args),
      }, {
        providedCodeActionKinds: SqlCodeActionProvider.providedCodeActionKinds,
      }),
    );

    context.subscriptions.push(
      vscode.languages.registerFoldingRangeProvider(selector, {
        provideFoldingRanges: (...args) => lazyFoldingRange().provideFoldingRanges(...args),
      }),
    );

    context.subscriptions.push(
      vscode.languages.registerDocumentSymbolProvider(selector, {
        provideDocumentSymbols: (...args) => lazyOutline().provideDocumentSymbols(...args),
      }),
    );

    context.subscriptions.push(
      vscode.languages.registerHoverProvider(selector, {
        provideHover: (...args) => lazyHover().provideHover(...args),
      }),
    );

    context.subscriptions.push(
      vscode.languages.registerDefinitionProvider(selector, {
        provideDefinition: (...args) => lazyDefinition().provideDefinition(...args),
      }),
    );

    context.subscriptions.push(
      vscode.languages.registerReferenceProvider(selector, {
        provideReferences: (...args) => lazyReference().provideReferences(...args),
      }),
    );

    context.subscriptions.push(
      vscode.languages.registerRenameProvider(selector, {
        provideRenameEdits: (...args) => lazyRename().provideRenameEdits(...args),
        prepareRename: (...args) => lazyRename().prepareRename(...args),
      }),
    );
  }
}

function registerCompletion(context: vscode.ExtensionContext): void {
  const container = getContainer();
  const sqlLanguages = getSqlLanguageIds();
  const triggerChars: string[] = ['.', ' ', '('];

  const getProvider = createLazyProvider<SqlCompletionProvider>(container, Tokens.CompletionProvider, context);

  const lazyProvider: vscode.CompletionItemProvider = {
    provideCompletionItems: (doc, pos, token, _ctx) =>
      getProvider()?.provideCompletionItems(doc, pos, token),
  };

  for (const lang of sqlLanguages) {
    context.subscriptions.push(
      vscode.languages.registerCompletionItemProvider({ language: lang }, lazyProvider, ...triggerChars),
    );
  }
}

function registerParameterHighlighter(context: vscode.ExtensionContext): void {
  const container = getContainer();
  const getHighlighter = createLazyProvider<SqlParameterHighlighter>(container, Tokens.ParameterHighlighter, context);

  context.subscriptions.push(SqlParameterReplaceCommand.register(context));
  // Eagerly instantiate to register decoration decorators
  getHighlighter();
}

function registerAstNavigatorEvents(context: vscode.ExtensionContext): void {
  const container = getContainer();
  const getNavigator = createLazyProvider<AstNavigator>(container, Tokens.AstNavigator, context);

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(e => {
      if (isSqlDocument(e.document)) getNavigator()?.invalidate(e.document);
    }),
    vscode.workspace.onDidCloseTextDocument(doc => getNavigator()?.invalidate(doc)),
  );
}

function registerStatusBar(context: vscode.ExtensionContext): void {
  const container = getContainer();
  const getStatusBar = createLazyProvider<StatusBarProvider>(container, Tokens.StatusBarProvider, context);
  // Eagerly instantiate to show status bar item
  getStatusBar();
}

function registerServicesToContainer(extensionPath: string): void {
  const container = getContainer();

  container.registerSingleton(Tokens.ConfigManager, createConfigManager);
  container.registerSingleton(Tokens.ParserEngine, createParserEngine);
  container.registerSingleton(Tokens.RuleRegistry, createRuleRegistry);
  container.registerSingleton(Tokens.ErrorHandler, createErrorHandler);
  container.registerSingleton(Tokens.PerformanceMonitor, createPerformanceMonitor);
  container.registerSingleton(Tokens.DocumentAstCache, createDocumentAstCache);
  container.registerSingleton(Tokens.ConnectionManager, createConnectionManager);
  container.registerSingleton(Tokens.ConnectionStore, createConnectionStore);
  container.registerSingleton(Tokens.SchemaProvider, createSchemaProvider);
  container.registerSingleton(Tokens.SchemaCache, createSchemaCache);

  container.registerSingleton(Tokens.QueryExecutor, () => new QueryExecutor());
  container.registerSingleton(Tokens.SafeQueryGuard, () => new SafeQueryGuard());
  container.registerSingleton(Tokens.QueryHistory, () => new QueryHistory());
  container.registerSingleton(Tokens.SqlStatementDetector, () => new SqlStatementDetector());

  container.registerSingleton(Tokens.SqlDiagnosticsProvider, () => new SqlDiagnosticsProvider());
  container.registerSingleton(Tokens.StatusBarProvider, () => new StatusBarProvider());
  container.registerSingleton(Tokens.ParameterHighlighter, () => new SqlParameterHighlighter());
  container.registerSingleton(Tokens.CompletionProvider, () => new SqlCompletionProvider(extensionPath));
  container.registerSingleton(Tokens.CodeActionProvider, () => new SqlCodeActionProvider());
  container.registerSingleton(Tokens.FoldingRangeProvider, () => new SqlFoldingRangeProvider());
  container.registerSingleton(Tokens.OutlineProvider, () => new SqlOutlineProvider());
  container.registerSingleton(Tokens.HoverProvider, () => new SqlHoverProvider());
  container.registerSingleton(Tokens.AstNavigator, () => new AstNavigator());
  container.registerSingleton(Tokens.DefinitionProvider, () => {
    const nav = container.get<AstNavigator>(Tokens.AstNavigator);
    return new SqlDefinitionProvider(nav);
  });
  container.registerSingleton(Tokens.ReferenceProvider, () => {
    const nav = container.get<AstNavigator>(Tokens.AstNavigator);
    return new SqlReferenceProvider(nav);
  });
  container.registerSingleton(Tokens.RenameProvider, () => {
    const nav = container.get<AstNavigator>(Tokens.AstNavigator);
    return new SqlRenameProvider(nav);
  });
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    registerServicesToContainer(context.extensionPath);

    try {
        initI18n();
        registerCommands(context);
        registerFormattingProviders(context);
        registerDiagnostics(context);

        queueMicrotask(() => {
            registerProviders(context);
            registerCompletion(context);
            registerParameterHighlighter(context);
            registerAstNavigatorEvents(context);
            registerStatusBar(context);
        });

        const dbModule = new DatabaseModule(context);
        try {
            await dbModule.initialize();
        } catch (e) {
            console.error('[SQL All in One] Database initialization failed:', e);
            getErrorHandler().handle(e, 'Database initialization', ErrorLevel.ERROR, ErrorCategory.CRITICAL);
        }
        context.subscriptions.push({
            dispose: () => {
                dbModule.dispose().catch(e => {
                    console.error('Failed to dispose DatabaseModule:', e);
                });
            }
        });

        context.subscriptions.push(getConfigManager());
        context.subscriptions.push(getDocumentAstCache());
    } catch (e) {
        getErrorHandler().handle(e, 'Extension activation', ErrorLevel.FATAL, ErrorCategory.CRITICAL);
    }
}

export function deactivate(): Thenable<void> {
  clearParameterScanCache();
  clearFormatterCache();
  invalidateRuleDefinitions();
  return Promise.resolve(getContainer().disposeAll());
}
