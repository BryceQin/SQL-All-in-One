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

function registerCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('sql-all-in-one.format-selection', formatSelectionCommand),
    vscode.commands.registerCommand('sql-all-in-one.toggleComment', toggleComment),
    vscode.commands.registerCommand('sql-all-in-one.toggleAdvancedComment', toggleAdvancedComment),
    vscode.commands.registerCommand('sql-all-in-one.mysql-to-hive', convertMysqlToHiveCommand),
    vscode.commands.registerCommand('sql-all-in-one.hive-to-mysql', convertHiveToMysqlCommand),
    vscode.commands.registerCommand('sql-all-in-one.open-config-editor', () => openConfigEditorCommand(context.extensionUri)),
    vscode.commands.registerCommand('sql-all-in-one.showErrorLog', () => {
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
  let dp: SqlDiagnosticsProvider | undefined;
  const getDp = () => {
    if (!dp) {
      dp = container.get<SqlDiagnosticsProvider>(Tokens.SqlDiagnosticsProvider);
      if (dp) context.subscriptions.push(dp);
    }
    return dp;
  };

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

  let codeActionProvider: SqlCodeActionProvider | undefined;
  let foldingRangeProvider: SqlFoldingRangeProvider | undefined;
  let outlineProvider: SqlOutlineProvider | undefined;
  let hoverProvider: SqlHoverProvider | undefined;
  let definitionProvider: SqlDefinitionProvider | undefined;
  let referenceProvider: SqlReferenceProvider | undefined;
  let renameProvider: SqlRenameProvider | undefined;

  const lazyCodeAction = () => codeActionProvider ??= container.get<SqlCodeActionProvider>(Tokens.CodeActionProvider);
  const lazyFoldingRange = () => foldingRangeProvider ??= container.get<SqlFoldingRangeProvider>(Tokens.FoldingRangeProvider);
  const lazyOutline = () => outlineProvider ??= container.get<SqlOutlineProvider>(Tokens.OutlineProvider);
  const lazyHover = () => hoverProvider ??= container.get<SqlHoverProvider>(Tokens.HoverProvider);
  const lazyDefinition = () => definitionProvider ??= container.get<SqlDefinitionProvider>(Tokens.DefinitionProvider);
  const lazyReference = () => referenceProvider ??= container.get<SqlReferenceProvider>(Tokens.ReferenceProvider);
  const lazyRename = () => renameProvider ??= container.get<SqlRenameProvider>(Tokens.RenameProvider);

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

  let provider: SqlCompletionProvider | undefined;
  const getProvider = () => {
    if (!provider) {
      provider = container.get<SqlCompletionProvider>(Tokens.CompletionProvider);
      if (provider) context.subscriptions.push(provider);
    }
    return provider;
  };

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
  let highlighter: SqlParameterHighlighter | undefined;
  const getHighlighter = () => {
    if (!highlighter) {
      highlighter = container.get<SqlParameterHighlighter>(Tokens.ParameterHighlighter);
      if (highlighter) context.subscriptions.push(highlighter);
    }
    return highlighter;
  };

  context.subscriptions.push(SqlParameterReplaceCommand.register(context));
  getHighlighter();
}

function registerAstNavigatorEvents(context: vscode.ExtensionContext): void {
  const container = getContainer();
  let navigator: AstNavigator | undefined;
  const getNavigator = () => navigator ??= container.get<AstNavigator>(Tokens.AstNavigator);

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(e => {
      if (isSqlDocument(e.document)) getNavigator()?.invalidate(e.document);
    }),
    vscode.workspace.onDidCloseTextDocument(doc => getNavigator()?.invalidate(doc)),
  );
}

function registerStatusBar(context: vscode.ExtensionContext): void {
  if (!vscode.workspace.textDocuments.some(isSqlDocument)) return;

  const container = getContainer();
  let statusBar: StatusBarProvider | undefined;
  const getStatusBar = () => {
    if (!statusBar) {
      statusBar = container.get<StatusBarProvider>(Tokens.StatusBarProvider);
      if (statusBar) context.subscriptions.push(statusBar);
    }
    return statusBar;
  };
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
        registerProviders(context);
        registerCompletion(context);
        registerParameterHighlighter(context);
        registerAstNavigatorEvents(context);
        registerStatusBar(context);

        const dbModule = new DatabaseModule(context);
        dbModule.initialize().catch(e => {
            getErrorHandler().handle(e, 'Database initialization', ErrorLevel.ERROR, ErrorCategory.CRITICAL);
        });
        context.subscriptions.push({ dispose: async () => { await dbModule.dispose(); } });

        context.subscriptions.push(getConfigManager());
        context.subscriptions.push(getDocumentAstCache());
    } catch (e) {
        getErrorHandler().handle(e, 'Extension activation', ErrorLevel.FATAL, ErrorCategory.CRITICAL);
    }
}

export function deactivate(): Thenable<void> {
  return Promise.resolve(getContainer().disposeAll());
}
