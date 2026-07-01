import * as vscode from 'vscode';
import { TableDesignerPanel } from './TableDesignerPanel';

/**
 * Register the views-layer handler for `hive-formatter.openTableDesigner`.
 *
 * The database layer (SchemaCommands.ts) resolves the target database / table
 * from the tree node and delegates panel creation to this command. The
 * payload shape is `{ database: string; tableName?: string }`:
 *   - `tableName` absent  → create-mode (openForCreate)
 *   - `tableName` present → edit-mode   (openForEdit)
 */
export function registerTableDesignerCommands(context: vscode.ExtensionContext): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = [];

    disposables.push(
        vscode.commands.registerCommand(
            'hive-formatter.openTableDesigner',
            async (payload: { database: string; tableName?: string }) => {
                if (!payload || !payload.database) {
                    vscode.window.showErrorMessage('openTableDesigner: missing database');
                    return;
                }
                const panel = TableDesignerPanel.createOrShow(context.extensionUri, context);
                if (payload.tableName) {
                    await panel.openForEdit(payload.database, payload.tableName);
                } else {
                    await panel.openForCreate(payload.database);
                }
            },
        ),
    );

    return disposables;
}
