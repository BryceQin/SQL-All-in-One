import * as vscode from 'vscode';
import { getConnectionManager } from '../connection/ConnectionManager';
import { DatabaseTreeProvider } from '../../views/databaseExplorer/DatabaseTreeProvider';
import { ConnectionTreeNode } from '../../views/databaseExplorer/treeNodes';
import { ConnectionDialog } from '../../views/connectionDialog/ConnectionDialog';

export function registerConnectionCommands(
    context: vscode.ExtensionContext,
    treeProvider: DatabaseTreeProvider
): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = [];

    disposables.push(
        vscode.commands.registerCommand('sql-all-in-one.addConnection', async () => {
            await ConnectionDialog.show(
                context.extensionUri,
                {
                    mode: 'create',
                    treeProvider
                }
            );
        })
    );

    disposables.push(
        vscode.commands.registerCommand('sql-all-in-one.editConnection', async (node?: ConnectionTreeNode) => {
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
                    { placeHolder: 'Select a connection to edit' }
                );
                if (!picked) {
                    return;
                }
                connectionId = picked.id;
            }

            await ConnectionDialog.show(
                context.extensionUri,
                {
                    mode: 'edit',
                    connectionId,
                    treeProvider
                }
            );
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

    return disposables;
}
