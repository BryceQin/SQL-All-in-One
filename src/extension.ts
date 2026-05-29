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
import { getPerformanceMonitor, createPerformanceMonitor } from './core/performanceMonitor';
import { getContainer, Tokens } from './core/diContainer';
import { createParserEngine } from './parser/SqlParserEngine';
import { createRuleRegistry } from './linter/RuleRegistry';
import { SqlCodeActionProvider } from './providers/SqlCodeActionProvider';
import { SqlDiagnosticsProvider } from './providers/SqlDiagnosticsProvider';
import { StatusBarProvider } from './providers/StatusBarProvider';
import { SqlParameterHighlighter, SqlParameterReplaceCommand } from './providers/SqlParameterHightlighter';
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

interface ExtensionModule {
  name: string;
  register: (context: vscode.ExtensionContext) => void | Promise<void>;
}

async function safeRegisterAsync(
  label: string,
  fn: () => void | Promise<void>
): Promise<void> {
  try {
    await fn();
  } catch (e) {
    getErrorHandler().handle(e, label, ErrorLevel.ERROR, ErrorCategory.CRITICAL);
  }
}

function registerCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('sql-all-in-one.format-selection', formatSelectionCommand),
    vscode.commands.registerCommand('sql-all-in-one.toggleComment', toggleComment),
    vscode.commands.registerCommand('sql-all-in-one.toggleAdvancedComment', toggleAdvancedComment),
    vscode.commands.registerCommand('sql-all-in-one.mysql-to-hive', convertMysqlToHiveCommand),
    vscode.commands.registerCommand('sql-all-in-one.hive-to-mysql', convertHiveToMysqlCommand),
    vscode.commands.registerCommand('sql-all-in-one.open-config-editor', () => openConfigEditorCommand(context.extensionUri)),
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
  const dp = container.get<SqlDiagnosticsProvider>(Tokens.SqlDiagnosticsProvider);
  if (!dp) return;

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (isSqlDocument(event.document)) {
        dp.debouncedProvideDiagnostics(event.document);
      }
    }),
    vscode.workspace.onDidOpenTextDocument((document) => {
      if (isSqlDocument(document)) dp.provideDiagnostics(document);
    }),
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (isSqlDocument(document)) dp.provideDiagnostics(document);
    }),
    dp,
  );

  vscode.workspace.textDocuments.forEach((document) => {
    if (isSqlDocument(document)) dp.provideDiagnostics(document);
  });
}

function registerProviders(context: vscode.ExtensionContext): void {
  const container = getContainer();
  const sqlLanguages = getSqlLanguageIds();

  const codeActionProvider = container.get<SqlCodeActionProvider>(Tokens.CodeActionProvider);
  const foldingRangeProvider = container.get<SqlFoldingRangeProvider>(Tokens.FoldingRangeProvider);
  const outlineProvider = container.get<SqlOutlineProvider>(Tokens.OutlineProvider);
  const hoverProvider = container.get<SqlHoverProvider>(Tokens.HoverProvider);
  const definitionProvider = container.get<SqlDefinitionProvider>(Tokens.DefinitionProvider);
  const referenceProvider = container.get<SqlReferenceProvider>(Tokens.ReferenceProvider);
  const renameProvider = container.get<SqlRenameProvider>(Tokens.RenameProvider);

  for (const lang of sqlLanguages) {
    const selector = { language: lang };

    context.subscriptions.push(
      vscode.languages.registerCodeActionsProvider(selector, codeActionProvider, {
        providedCodeActionKinds: SqlCodeActionProvider.providedCodeActionKinds,
      }),
    );

    context.subscriptions.push(vscode.languages.registerFoldingRangeProvider(selector, foldingRangeProvider));
    context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider(selector, outlineProvider));
    context.subscriptions.push(vscode.languages.registerHoverProvider(selector, hoverProvider));

    if (definitionProvider) {
      context.subscriptions.push(vscode.languages.registerDefinitionProvider(selector, definitionProvider));
    }

    if (referenceProvider) {
      context.subscriptions.push(vscode.languages.registerReferenceProvider(selector, referenceProvider));
    }

    if (renameProvider) {
      context.subscriptions.push(vscode.languages.registerRenameProvider(selector, renameProvider));
    }
  }
}

function registerCompletion(context: vscode.ExtensionContext): void {
  const container = getContainer();
  const completionProvider = container.get<SqlCompletionProvider>(Tokens.CompletionProvider);
  if (!completionProvider) return;

  const sqlLanguages = getSqlLanguageIds();
  const triggerChars: string[] = ['.', ' ', '('];

  for (const lang of sqlLanguages) {
    context.subscriptions.push(
      vscode.languages.registerCompletionItemProvider({ language: lang }, completionProvider, ...triggerChars),
    );
  }

  context.subscriptions.push(completionProvider);
}

function registerParameterHighlighter(context: vscode.ExtensionContext): void {
  const container = getContainer();
  const parameterHighlighter = container.get<SqlParameterHighlighter>(Tokens.ParameterHighlighter);
  if (!parameterHighlighter) return;

  SqlParameterReplaceCommand.register(context);
  context.subscriptions.push(parameterHighlighter);
}

function registerServicesToContainer(extensionPath: string): void {
  const container = getContainer();

  // Core services
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

  // Database services
  container.registerSingleton(Tokens.QueryExecutor, () => new QueryExecutor());
  container.registerSingleton(Tokens.SafeQueryGuard, () => new SafeQueryGuard());
  container.registerSingleton(Tokens.QueryHistory, () => new QueryHistory());
  container.registerSingleton(Tokens.SqlStatementDetector, () => new SqlStatementDetector());

  // Providers
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

function createModules(): ExtensionModule[] {
  return [
    { name: 'i18n', register: () => initI18n() },
    { name: 'commands', register: (ctx) => registerCommands(ctx) },
    { name: 'formatting', register: (ctx) => registerFormattingProviders(ctx) },
    { name: 'diagnostics', register: (ctx) => registerDiagnostics(ctx) },
    { name: 'providers', register: (ctx) => registerProviders(ctx) },
    { name: 'completion', register: (ctx) => registerCompletion(ctx) },
    { name: 'parameterHighlighter', register: (ctx) => registerParameterHighlighter(ctx) },
    { name: 'astNavigatorEvents', register: (ctx) => {
      const container = getContainer();
      const navigator = container.get<AstNavigator>(Tokens.AstNavigator);
      if (navigator) {
        ctx.subscriptions.push(
          vscode.workspace.onDidChangeTextDocument(e => {
            if (isSqlDocument(e.document)) navigator.invalidate(e.document);
          }),
          vscode.workspace.onDidCloseTextDocument(doc => navigator.invalidate(doc)),
        );
      }
    }},
    { name: 'statusBar', register: (ctx) => {
      const container = getContainer();
      if (vscode.workspace.textDocuments.some(isSqlDocument)) {
        const statusBar = container.get<StatusBarProvider>(Tokens.StatusBarProvider);
        if (statusBar) ctx.subscriptions.push(statusBar);
      }
    }},
    { name: 'database', register: async (ctx) => {
      const dbModule = new DatabaseModule(ctx);
      await dbModule.initialize();
      ctx.subscriptions.push({
        dispose: async () => await dbModule.dispose(),
      });
    }},
  ];
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // 首先注册所有服务到 DI 容器
  registerServicesToContainer(context.extensionPath);

  await getPerformanceMonitor().measureAsync('Extension.activate', async () => {
    console.log('SQL All in One: activating...');

    try {
      const modules = createModules();
      for (const mod of modules) {
        await safeRegisterAsync('register ' + mod.name, () => mod.register(context));
      }

      context.subscriptions.push(getConfigManager());
      context.subscriptions.push(getDocumentAstCache());

      console.log('SQL All in One: activation complete');
    } catch (e) {
      getErrorHandler().handle(e, 'Extension activation', ErrorLevel.FATAL, ErrorCategory.CRITICAL);
    }
  });
}

export function deactivate(): void {
  getContainer().disposeAll();
}
