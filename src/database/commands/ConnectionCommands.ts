import * as vscode from 'vscode';
import { ConnectionManager } from '../connection/ConnectionManager';
import { DatabaseTreeProvider } from '../../views/databaseExplorer/DatabaseTreeProvider';
import { ConnectionTreeNode } from '../../views/databaseExplorer/treeNodes';

export function registerConnectionCommands(
    _context: vscode.ExtensionContext,
    treeProvider: DatabaseTreeProvider
): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = [];

    disposables.push(
        vscode.commands.registerCommand('sql-all-in-one.addConnection', async () => {
            vscode.window.showInformationMessage('Add connection dialog coming soon');
        })
    );

    disposables.push(
        vscode.commands.registerCommand('sql-all-in-one.editConnection', async () => {
            vscode.window.showInformationMessage('Edit connection dialog coming soon');
        })
    );

    disposables.push(
        vscode.commands.registerCommand('sql-all-in-one.removeConnection', async () => {
            vscode.window.showInformationMessage('Remove connection dialog coming soon');
        })
    );

    disposables.push(
        vscode.commands.registerCommand('sql-all-in-one.connect', async (node?: ConnectionTreeNode) => {
            if (node) {
                try {
                    await ConnectionManager.getInstance().connect(node.connectionId);
                    vscode.window.showInformationMessage(`Connected to ${node.connectionName}`);
                    treeProvider.refresh();
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to connect: ${error}`);
                }
            } else {
                vscode.window.showInformationMessage('Select a connection first');
            }
        })
    );

    disposables.push(
        vscode.commands.registerCommand('sql-all-in-one.disconnect', async (node?: ConnectionTreeNode) => {
            if (node) {
                try {
                    await ConnectionManager.getInstance().disconnect(node.connectionId);
                    vscode.window.showInformationMessage(`Disconnected from ${node.connectionName}`);
                    treeProvider.refresh();
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to disconnect: ${error}`);
                }
            } else {
                vscode.window.showInformationMessage('Select a connection first');
            }
        })
    );

    disposables.push(
        vscode.commands.registerCommand('sql-all-in-one.testConnection', async () => {
            vscode.window.showInformationMessage('Test connection dialog coming soon');
        })
    );

    return disposables;
}
