import * as vscode from 'vscode';
import { getConnectionManager } from '../connection/ConnectionManager';
import { getConnectionStore } from '../connection/ConnectionStore';
import { DatabaseTreeProvider } from '../../views/databaseExplorer/DatabaseTreeProvider';
import { ConnectionTreeNode } from '../../views/databaseExplorer/treeNodes';
import { openConfigEditorCommand } from '../../commands/configEditorCommand';

export function registerConnectionCommands(
    context: vscode.ExtensionContext,
    treeProvider: DatabaseTreeProvider
): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = [];

    disposables.push(
        vscode.commands.registerCommand('sql-all-in-one.addConnection', async () => {
            openConfigEditorCommand(context.extensionUri, {
                initialTab: 'database',
                autoAddConnection: true
            });
        })
    );

    disposables.push(
        vscode.commands.registerCommand('sql-all-in-one.editConnection', async (node?: ConnectionTreeNode) => {
            if (!node) {
                const manager = getConnectionManager();
                const connections = manager.getAllConnections();
                if (connections.length === 0) {
                    vscode.window.showInformationMessage('No connections available');
                    return;
                }
                const picked = await vscode.window.showQuickPick(
                    connections.map(c => ({ label: c.name, id: c.id })),
                    { placeHolder: 'Select a connection to edit' }
                );
                if (!picked) {
                    return;
                }
            }

            openConfigEditorCommand(context.extensionUri, {
                initialTab: 'database'
            });
        })
    );

    disposables.push(
        vscode.commands.registerCommand('sql-all-in-one.removeConnection', async (node?: ConnectionTreeNode) => {
            const manager = getConnectionManager();
            let connectionId: string | undefined;
            let connectionName: string | undefined;

            if (node) {
                connectionId = node.connectionId;
                connectionName = node.connectionName;
            } else {
                const connections = manager.getAllConnections();
                if (connections.length === 0) {
                    vscode.window.showInformationMessage('No connections available');
                    return;
                }
                const picked = await vscode.window.showQuickPick(
                    connections.map(c => ({ label: c.name, id: c.id })),
                    { placeHolder: 'Select a connection to remove' }
                );
                if (!picked) {
                    return;
                }
                connectionId = picked.id;
                connectionName = picked.label;
            }

            const confirmed = await vscode.window.showWarningMessage(
                `Are you sure you want to remove connection "${connectionName}"?`,
                { modal: true },
                'Remove'
            );
            if (confirmed !== 'Remove') {
                return;
            }

            try {
                await manager.removeConnection(connectionId);
                treeProvider.refresh();
                vscode.window.showInformationMessage(`Connection "${connectionName}" removed`);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to remove connection: ${error}`);
            }
        })
    );

    disposables.push(
        vscode.commands.registerCommand('sql-all-in-one.connect', async (node?: ConnectionTreeNode) => {
            if (node) {
                try {
                    await getConnectionManager().connect(node.connectionId);
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
                    await getConnectionManager().disconnect(node.connectionId);
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
        vscode.commands.registerCommand('sql-all-in-one.testConnection', async (node?: ConnectionTreeNode) => {
            const manager = getConnectionManager();
            let connectionId: string | undefined;

            if (node) {
                connectionId = node.connectionId;
            } else {
                const connections = manager.getAllConnections();
                if (connections.length === 0) {
                    vscode.window.showInformationMessage('No connections available');
                    return;
                }
                const picked = await vscode.window.showQuickPick(
                    connections.map(c => ({ label: c.name, id: c.id })),
                    { placeHolder: 'Select a connection to test' }
                );
                if (!picked) {
                    return;
                }
                connectionId = picked.id;
            }

            try {
                const result = await manager.testConnection(connectionId);
                if (result.success) {
                    const parts: string[] = ['Connection successful'];
                    if (result.serverVersion) {
                        parts.push(`Server version: ${result.serverVersion}`);
                    }
                    if (result.latency !== undefined) {
                        parts.push(`Latency: ${result.latency}ms`);
                    }
                    vscode.window.showInformationMessage(parts.join(' | '));
                } else {
                    vscode.window.showErrorMessage(`Connection failed: ${result.error || 'Unknown error'}`);
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Test connection failed: ${error}`);
            }
        })
    );

    disposables.push(
        vscode.commands.registerCommand('sql-all-in-one.exportConnections', async () => {
            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file('connections.json'),
                filters: { 'JSON': ['json'] }
            });
            if (!uri) return;
            try {
                const store = getConnectionStore();
                const includePasswords = await vscode.window.showQuickPick(
                    ['Without passwords (recommended)', 'With passwords'],
                    { placeHolder: 'Export options' }
                );
                if (!includePasswords) return;
                await store.exportConnections(
                    uri.fsPath,
                    includePasswords === 'With passwords'
                );
                vscode.window.showInformationMessage(`Connections exported to ${uri.fsPath}`);
            } catch (error) {
                vscode.window.showErrorMessage(`Export failed: ${error}`);
            }
        })
    );

    disposables.push(
        vscode.commands.registerCommand('sql-all-in-one.importConnections', async () => {
            const uris = await vscode.window.showOpenDialog({
                filters: { 'JSON': ['json'] },
                canSelectMany: false
            });
            if (!uris || uris.length === 0) return;
            try {
                const store = getConnectionStore();
                const result = await store.importConnections(uris[0].fsPath);
                vscode.window.showInformationMessage(
                    `Imported ${result.added} connections (${result.skipped} skipped)`
                );
                treeProvider.refresh();
            } catch (error) {
                vscode.window.showErrorMessage(`Import failed: ${error}`);
            }
        })
    );

    return disposables;
}
