import * as vscode from 'vscode';
import { getConnectionManager } from '../connection/ConnectionManager';
import { getConnectionStore } from '../connection/ConnectionStore';
import { DatabaseModule } from '../DatabaseModule';
import { ConnectionTreeNode } from '../../views/databaseExplorer/treeNodes';
import { openConfigEditorCommand } from '../../commands/configEditorCommand';
import { t } from '../../i18n/index';

const connectionOutputChannel = vscode.window.createOutputChannel('SQL All in One - Connection');

function showConnectionError(shortMessage: string, fullError: string): void {
    if (shortMessage === fullError || fullError.length <= 80) {
        vscode.window.showErrorMessage(shortMessage);
        return;
    }
    vscode.window.showErrorMessage(shortMessage, t('database.showDetails')).then(choice => {
        if (choice === t('database.showDetails')) {
            connectionOutputChannel.clear();
            connectionOutputChannel.appendLine(fullError);
            connectionOutputChannel.show(true);
        }
    });
}

export function registerConnectionCommands(
    context: vscode.ExtensionContext,
    dbModule: DatabaseModule
): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = [];

    disposables.push(
        vscode.commands.registerCommand('hive-formatter.addConnection', async () => {
            openConfigEditorCommand(context.extensionUri, {
                initialTab: 'database',
                autoAddConnection: true
            });
        })
    );

    disposables.push(
        vscode.commands.registerCommand('hive-formatter.editConnection', async (node?: ConnectionTreeNode) => {
            let connectionId: string | undefined;

            if (node) {
                connectionId = node.connectionId;
            } else {
                const manager = getConnectionManager();
                const connections = manager.getAllConnections();
                if (connections.length === 0) {
                    vscode.window.showInformationMessage(t('database.noConnectionsAvailable'));
                    return;
                }
                const picked = await vscode.window.showQuickPick(
                    connections.map(c => ({ label: c.name, id: c.id })),
                    { placeHolder: t('database.selectConnectionToEdit') }
                );
                if (!picked) {
                    return;
                }
                connectionId = picked.id;
            }

            openConfigEditorCommand(context.extensionUri, {
                initialTab: 'database',
                connectionId
            });
        })
    );

    disposables.push(
        vscode.commands.registerCommand('hive-formatter.removeConnection', async (node?: ConnectionTreeNode) => {
            const manager = getConnectionManager();
            let connectionId: string | undefined;
            let connectionName: string | undefined;

            if (node) {
                connectionId = node.connectionId;
                connectionName = node.connectionName;
            } else {
                const connections = manager.getAllConnections();
                if (connections.length === 0) {
                    vscode.window.showInformationMessage(t('database.noConnectionsAvailable'));
                    return;
                }
                const picked = await vscode.window.showQuickPick(
                    connections.map(c => ({ label: c.name, id: c.id })),
                    { placeHolder: t('database.selectConnectionToRemove') }
                );
                if (!picked) {
                    return;
                }
                connectionId = picked.id;
                connectionName = picked.label;
            }

            const confirmed = await vscode.window.showWarningMessage(
                t('database.confirmRemoveConnection', connectionName!),
                { modal: true },
                t('database.remove')
            );
            if (confirmed !== t('database.remove')) {
                return;
            }

            try {
                await manager.removeConnection(connectionId);
                dbModule.getTreeProvider()?.refresh();
                vscode.window.showInformationMessage(t('database.connectionRemoved', connectionName!));
            } catch (error) {
                vscode.window.showErrorMessage(t('database.failedToRemoveConnection', String(error)));
            }
        })
    );

    disposables.push(
        vscode.commands.registerCommand('hive-formatter.connect', async (node?: ConnectionTreeNode) => {
            if (node) {
                try {
                    await getConnectionManager().connect(node.connectionId);
                    vscode.window.showInformationMessage(t('database.connected', node.connectionName));
                    dbModule.getTreeProvider()?.refresh();
                } catch (error) {
                    const fullError = error instanceof Error ? error.message : String(error);
                    const shortMessage = fullError.length > 80
                        ? fullError.substring(0, 80) + '...'
                        : fullError;
                    showConnectionError(t('database.connectFailed', shortMessage), fullError);
                }
            } else {
                vscode.window.showInformationMessage(t('database.selectConnection'));
            }
        })
    );

    disposables.push(
        vscode.commands.registerCommand('hive-formatter.disconnect', async (node?: ConnectionTreeNode) => {
            if (node) {
                try {
                    await getConnectionManager().disconnect(node.connectionId);
                    vscode.window.showInformationMessage(t('database.disconnected', node.connectionName));
                    dbModule.getTreeProvider()?.refresh();
                } catch (error) {
                    vscode.window.showErrorMessage(t('database.disconnectFailed', String(error)));
                }
            } else {
                vscode.window.showInformationMessage(t('database.selectConnection'));
            }
        })
    );

    disposables.push(
        vscode.commands.registerCommand('hive-formatter.testConnection', async (node?: ConnectionTreeNode) => {
            const manager = getConnectionManager();
            let connectionId: string | undefined;

            if (node) {
                connectionId = node.connectionId;
            } else {
                const connections = manager.getAllConnections();
                if (connections.length === 0) {
                    vscode.window.showInformationMessage(t('database.noConnectionsAvailable'));
                    return;
                }
                const picked = await vscode.window.showQuickPick(
                    connections.map(c => ({ label: c.name, id: c.id })),
                    { placeHolder: t('database.selectConnectionToTest') }
                );
                if (!picked) {
                    return;
                }
                connectionId = picked.id;
            }

            try {
                const result = await manager.testConnection(connectionId);
                if (result.success) {
                    const parts: string[] = [t('configEditor.conn.testSuccess')];
                    if (result.serverVersion) {
                        parts.push(t('database.serverVersion', result.serverVersion));
                    }
                    if (result.latency !== undefined) {
                        parts.push(t('database.latency', String(result.latency)));
                    }
                    vscode.window.showInformationMessage(parts.join(' | '));
                } else {
                    const fullError = result.error || 'Unknown error';
                    const shortMessage = fullError.length > 80
                        ? fullError.substring(0, 80) + '...'
                        : fullError;
                    showConnectionError(t('database.connectionFailedShort', shortMessage), fullError);
                }
            } catch (error) {
                const fullError = error instanceof Error ? error.message : String(error);
                const shortMessage = fullError.length > 80
                    ? fullError.substring(0, 80) + '...'
                    : fullError;
                showConnectionError(t('database.testConnectionFailed', shortMessage), fullError);
            }
        })
    );

    disposables.push(
        vscode.commands.registerCommand('hive-formatter.exportConnections', async () => {
            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file('connections.json'),
                filters: { 'JSON': ['json'] }
            });
            if (!uri) return;
            try {
                const store = getConnectionStore();
                const includePasswords = await vscode.window.showQuickPick(
                    [t('database.withoutPasswords'), t('database.withPasswords')],
                    { placeHolder: t('database.exportOptions') }
                );
                if (!includePasswords) return;
                await store.exportConnections(
                    uri.fsPath,
                    includePasswords === t('database.withPasswords')
                );
                vscode.window.showInformationMessage(t('database.connectionsExported', uri.fsPath));
            } catch (error) {
                vscode.window.showErrorMessage(t('database.exportFailed', String(error)));
            }
        })
    );

    disposables.push(
        vscode.commands.registerCommand('hive-formatter.importConnections', async () => {
            const uris = await vscode.window.showOpenDialog({
                filters: { 'JSON': ['json'] },
                canSelectMany: false
            });
            if (!uris || uris.length === 0) return;
            try {
                const store = getConnectionStore();
                const result = await store.importConnections(uris[0].fsPath);
                vscode.window.showInformationMessage(
                    t('database.importedConnections', String(result.added), String(result.skipped))
                );
                dbModule.getTreeProvider()?.refresh();
            } catch (error) {
                vscode.window.showErrorMessage(t('database.importFailed', String(error)));
            }
        })
    );

    return disposables;
}
