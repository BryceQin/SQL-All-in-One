import * as vscode from 'vscode';
import type { Activatable } from '../core/Activatable';
import { sqlDialects } from '../core/sqlDialects';
import { SqlFormattingProvider } from '../providers/SqlFormattingProvider';
import { formatSelectionCommand } from '../commands/formatSelectionCommand';
import { toggleComment, toggleAdvancedComment } from '../commands/commentCommands';
import { convertMysqlToHiveCommand, convertHiveToMysqlCommand } from '../commands/converterCommands';
import { openConfigEditorCommand } from '../commands/configEditorCommand';
import { getErrorHandler } from '../core/errorHandler';

export class FormatterModule implements Activatable {
  activate(context: vscode.ExtensionContext): void {
    // Register commands
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

    // Register formatting providers.
    // A single shared SqlFormattingProvider instance serves all SQL languages:
    // the dialect is resolved from each document's languageId at format time,
    // and the underlying AstFormatter cache is keyed per (dialect, options).
    const formattingProvider = new SqlFormattingProvider();
    context.subscriptions.push(
        ...Object.entries(sqlDialects).map(([vscodeLang]) =>
            vscode.languages.registerDocumentFormattingEditProvider(vscodeLang, formattingProvider),
        ),
    );
  }
}
