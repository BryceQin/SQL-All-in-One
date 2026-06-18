import * as vscode from 'vscode';
import type { Activatable } from '../core/Activatable';
import { getSqlLanguageIds, isSqlDocument } from '../core/sqlDialects';
import { getContainer, Tokens } from '../core/diContainer';
import { SqlCodeActionProvider } from '../providers/SqlCodeActionProvider';
import { SqlFoldingRangeProvider } from '../providers/SqlFoldingRangeProvider';
import { SqlOutlineProvider } from '../providers/SqlOutlineProvider';
import { SqlHoverProvider } from '../providers/SqlHoverProvider';
import { SqlCompletionProvider } from '../completion';
import { SqlParameterHighlighter, SqlParameterReplaceCommand } from '../providers/SqlParameterHighlighter';
import { StatusBarProvider } from '../providers/StatusBarProvider';
import { AstNavigator } from '../navigation/AstNavigator';
import { SqlDefinitionProvider } from '../navigation/SqlDefinitionProvider';
import { SqlReferenceProvider } from '../navigation/SqlReferenceProvider';
import { SqlRenameProvider } from '../navigation/SqlRenameProvider';

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

export class ProviderModule implements Activatable {
  activate(context: vscode.ExtensionContext): void {
    // Defer provider registration to avoid blocking activation (matches original behavior)
    queueMicrotask(() => {
      this.registerAll(context);
    });
  }

  private registerAll(context: vscode.ExtensionContext): void {
    const container = getContainer();
    const sqlLanguages = getSqlLanguageIds();

    // Register providers (code actions, folding, outline, hover, definition, reference, rename)
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

    // Register completion
    const triggerChars: string[] = ['.', ' ', '('];
    const getCompletionProvider = createLazyProvider<SqlCompletionProvider>(container, Tokens.CompletionProvider, context);

    const lazyCompletionProvider: vscode.CompletionItemProvider = {
      provideCompletionItems: (doc, pos, token, _ctx) =>
        getCompletionProvider()?.provideCompletionItems(doc, pos, token),
    };

    for (const lang of sqlLanguages) {
      context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider({ language: lang }, lazyCompletionProvider, ...triggerChars),
      );
    }

    // Register parameter highlighter
    const getHighlighter = createLazyProvider<SqlParameterHighlighter>(container, Tokens.ParameterHighlighter, context);
    context.subscriptions.push(SqlParameterReplaceCommand.register(context));
    // Eagerly instantiate to register decoration decorators
    getHighlighter();

    // Register AST navigator events
    const getNavigator = createLazyProvider<AstNavigator>(container, Tokens.AstNavigator, context);
    context.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument(e => {
        if (isSqlDocument(e.document)) getNavigator()?.invalidate(e.document);
      }),
      vscode.workspace.onDidCloseTextDocument(doc => getNavigator()?.invalidate(doc)),
    );

    // Register status bar
    const getStatusBar = createLazyProvider<StatusBarProvider>(container, Tokens.StatusBarProvider, context);
    // Eagerly instantiate to show status bar item
    getStatusBar();
  }
}
