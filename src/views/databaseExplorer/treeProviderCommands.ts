import * as vscode from 'vscode';
import { DatabaseTreeProvider } from './DatabaseTreeProvider';

/**
 * Module-level handle to the singleton DatabaseTreeProvider + TreeView created
 * by {@link registerTreeProviderCommands}. The database layer reaches the tree
 * via vscode commands (`refreshTreeProvider`, `addTreeFavorite`,
 * `removeTreeFavorite`) rather than importing this module directly, so we
 * expose the instance through these commands.
 */
let treeProvider: DatabaseTreeProvider | undefined;
let treeView: vscode.TreeView<unknown> | undefined;

/**
 * @returns the active DatabaseTreeProvider, or undefined if the views-layer
 *          tree has not been initialized yet.
 */
export function getDatabaseTreeProvider(): DatabaseTreeProvider | undefined {
    return treeProvider;
}

/**
 * Register the views-layer commands that own the DatabaseTreeProvider
 * lifecycle and expose refresh / favorite operations to the database layer.
 *
 * - `hive-formatter.createTreeProvider` — instantiate the provider + TreeView.
 *   Idempotent: if a provider already exists, re-uses it. Called during
 *   activation (Task 8.4 wires this into the extension activation flow).
 * - `hive-formatter.refreshTreeProvider` — re-fire the provider's
 *   onDidChangeTreeData so the tree re-queries its children.
 * - `hive-formatter.addTreeFavorite` — add a (connection, database, object)
 *   triple to the favorites list persisted by the provider.
 * - `hive-formatter.removeTreeFavorite` — remove a favorite by the same key.
 */
export function registerTreeProviderCommands(context: vscode.ExtensionContext): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = [];

    disposables.push(
        vscode.commands.registerCommand('hive-formatter.createTreeProvider', () => {
            if (treeProvider) {
                return treeProvider;
            }
            treeProvider = new DatabaseTreeProvider(context);
            treeView = vscode.window.createTreeView('hive-formatter.databaseExplorer', {
                treeDataProvider: treeProvider,
                showCollapseAll: true,
                canSelectMany: false,
            });
            context.subscriptions.push(treeView);
            context.subscriptions.push({ dispose: () => treeProvider?.dispose() });

            // Double-click (or single-click per the view's configuration) on a
            // tree item is handled by the `command` field the provider attaches
            // to each TreeItem (see DatabaseTreeProvider.getCommandForNode).
            // No separate click handler is needed here.
            return treeProvider;
        }),
    );

    disposables.push(
        vscode.commands.registerCommand('hive-formatter.refreshTreeProvider', () => {
            treeProvider?.refresh();
        }),
    );

    disposables.push(
        vscode.commands.registerCommand(
            'hive-formatter.addTreeFavorite',
            async (
                connectionId: string,
                connectionName: string,
                database: string,
                objectType: 'table' | 'view',
                objectName: string,
            ) => {
                if (!treeProvider) return;
                await treeProvider.addFavorite(
                    connectionId,
                    connectionName,
                    database,
                    objectType,
                    objectName,
                );
            },
        ),
    );

    disposables.push(
        vscode.commands.registerCommand(
            'hive-formatter.removeTreeFavorite',
            async (
                connectionId: string,
                database: string,
                objectType: 'table' | 'view',
                objectName: string,
            ) => {
                if (!treeProvider) return;
                await treeProvider.removeFavorite(
                    connectionId,
                    database,
                    objectType,
                    objectName,
                );
            },
        ),
    );

    return disposables;
}
