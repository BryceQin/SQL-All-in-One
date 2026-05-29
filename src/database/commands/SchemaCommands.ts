import * as vscode from 'vscode';
import { getConnectionManager } from '../connection/ConnectionManager';
import { DatabaseTreeProvider } from '../../views/databaseExplorer/DatabaseTreeProvider';
import {
    ConnectionTreeNode,
    TableTreeNode,
    ViewTreeNode,
    ColumnTreeNode,
    DatabaseTreeNode,
    FavoriteTreeNode
} from '../../views/databaseExplorer/treeNodes';
import { SqlStatementDetector } from '../query/SqlStatementDetector';
import { getSchemaCache } from '../schema/SchemaCache';
import { TableDesignerPanel } from '../../views/tableDesigner/TableDesignerPanel';


export function registerSchemaCommands(
    context: vscode.ExtensionContext,
    treeProvider: DatabaseTreeProvider,
    statementDetector: SqlStatementDetector
): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = [];

    disposables.push(
        vscode.commands.registerCommand('sql-all-in-one.refreshSchema', async () => {
            const activeConn = getConnectionManager().getActiveConnection();
            if (activeConn) {
                getSchemaCache().invalidate(activeConn.id);
            }
            treeProvider.refresh();
        })
    );

    disposables.push(
        vscode.commands.registerCommand('sql-all-in-one.viewTableData', async (node?: TableTreeNode | ViewTreeNode) => {
            if (node) {
                const name = node instanceof TableTreeNode ? node.tableName : node.viewName;
                vscode.window.showInformationMessage(`View data for ${name} coming soon`);
            }
        })
    );

    disposables.push(
        vscode.commands.registerCommand('sql-all-in-one.viewTableDDL', async (node?: TableTreeNode) => {
            if (node) {
                const adapter = getConnectionManager().getAdapter(node.connectionId);
                if (adapter) {
                    try {
                        const ddl = await adapter.getTableDDL(node.databaseName, node.tableName);
                        const document = await vscode.workspace.openTextDocument({
                            content: ddl,
                            language: 'sql'
                        });
                        await vscode.window.showTextDocument(document);
                    } catch (error) {
                        vscode.window.showErrorMessage(`Failed to get DDL: ${error}`);
                    }
                }
            }
        })
    );

    disposables.push(
        vscode.commands.registerCommand('sql-all-in-one.newQuery', async (node?: DatabaseTreeNode | ConnectionTreeNode) => {
            let database = '';
            if (node instanceof DatabaseTreeNode) {
                database = node.databaseName;
            }
            const content = database ? `USE \`${database}\`;\n\n` : '';
            const document = await vscode.workspace.openTextDocument({
                content,
                language: 'sql'
            });
            await vscode.window.showTextDocument(document);
        })
    );

    disposables.push(
        vscode.commands.registerCommand('sql-all-in-one.copyColumnName', async (node?: ColumnTreeNode) => {
            if (node) {
                await vscode.env.clipboard.writeText(node.columnInfo.name);
                vscode.window.showInformationMessage('Column name copied to clipboard');
            }
        })
    );

    disposables.push(
        vscode.commands.registerCommand('sql-all-in-one.addToFavorites', async (node?: TableTreeNode | ViewTreeNode) => {
            if (node) {
                const conn = getConnectionManager().getAllConnections().find(
                    (c) => c.id === node.connectionId
                );
                if (conn) {
                    const name = node instanceof TableTreeNode ? node.tableName : node.viewName;
                    const type = node instanceof TableTreeNode ? 'table' : 'view';
                    await treeProvider.addFavorite(
                        node.connectionId,
                        conn.name,
                        node.databaseName,
                        type,
                        name
                    );
                    vscode.window.showInformationMessage('Added to favorites');
                }
            }
        })
    );

    disposables.push(
        vscode.commands.registerCommand('sql-all-in-one.removeFromFavorites', async (node?: FavoriteTreeNode) => {
            if (node) {
                await treeProvider.removeFavorite(
                    node.connectionId,
                    node.databaseName,
                    node.objectType,
                    node.objectName
                );
                vscode.window.showInformationMessage('Removed from favorites');
            }
        })
    );

    disposables.push(
        vscode.commands.registerCommand('sql-all-in-one.revealInExplorer', async (node?: FavoriteTreeNode) => {
            if (node) {
                vscode.window.showInformationMessage('Reveal in explorer coming soon');
            }
        })
    );

    disposables.push(
        vscode.commands.registerCommand('sql-all-in-one.setDefaultDatabase', async (node?: DatabaseTreeNode) => {
            if (node) {
                vscode.window.showInformationMessage('Set as default database coming soon');
            }
        })
    );

    disposables.push(
        vscode.commands.registerCommand('sql-all-in-one.designTable', async (node?: DatabaseTreeNode | ConnectionTreeNode) => {
            const connectionManager = getConnectionManager();
            const activeConn = connectionManager.getActiveConnection();
            if (!activeConn) {
                vscode.window.showWarningMessage('No active connection. Please connect to a database first.');
                return;
            }

            let database = '';
            if (node instanceof DatabaseTreeNode) {
                database = node.databaseName;
            } else if (node instanceof ConnectionTreeNode) {
                database = activeConn.database || '';
            } else {
                database = activeConn.database || '';
            }

            if (!database) {
                try {
                    const adapter = connectionManager.getAdapter(activeConn.id);
                    if (!adapter) {
                        vscode.window.showWarningMessage('No database adapter available');
                        return;
                    }
                    const databases = await adapter.listDatabases();
                    const picked = await vscode.window.showQuickPick(
                        databases.map(d => d.name),
                        { placeHolder: 'Select a database' }
                    );
                    if (!picked) return;
                    database = picked;
                } catch {
                    vscode.window.showWarningMessage('Failed to list databases');
                    return;
                }
            }

            const tableDesignerPanel = TableDesignerPanel.createOrShow(
                context.extensionUri,
                context
            );
            await tableDesignerPanel.openForCreate(database);
        })
    );

    disposables.push(
        vscode.commands.registerCommand('sql-all-in-one.editTable', async (node?: TableTreeNode) => {
            if (!node) {
                vscode.window.showWarningMessage('Select a table to edit');
                return;
            }

            const connectionManager = getConnectionManager();
            const adapter = connectionManager.getAdapter(node.connectionId);
            if (!adapter) {
                vscode.window.showWarningMessage('No active connection for the selected table');
                return;
            }

            const tableDesignerPanel = TableDesignerPanel.createOrShow(
                context.extensionUri,
                context
            );
            await tableDesignerPanel.openForEdit(node.databaseName, node.tableName);
        })
    );

    disposables.push(
        vscode.commands.registerCommand('sql-all-in-one.explainQuery', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('No active editor');
                return;
            }

            const connectionManager = getConnectionManager();
            const activeConn = connectionManager.getActiveConnection();
            if (!activeConn) {
                vscode.window.showWarningMessage('No active connection. Please connect to a database first.');
                return;
            }

            const adapter = connectionManager.getAdapter(activeConn.id);
            if (!adapter) {
                vscode.window.showWarningMessage('No active database adapter');
                return;
            }

            const capabilities = adapter.getDialectCapabilities();
            if (!capabilities.supportsExplain) {
                vscode.window.showWarningMessage('Current database does not support EXPLAIN');
                return;
            }

            const statement = statementDetector.detectSelectionOrCurrent(
                editor.document,
                editor.selection
            );

            if (!statement.sql) {
                vscode.window.showWarningMessage('No SQL statement found');
                return;
            }

            const { ExplainPlanPanel } = await import('../../views/explainPlan/ExplainPlanPanel.js');
            const panel = ExplainPlanPanel.createOrShow(context.extensionUri, context);
            await panel.showExplainPlan(statement.sql, false);
        })
    );

    disposables.push(
        vscode.commands.registerCommand('sql-all-in-one.importData', async () => {
            const connectionManager = getConnectionManager();
            const activeConn = connectionManager.getActiveConnection();
            if (!activeConn) {
                vscode.window.showWarningMessage('No active connection. Please connect to a database first.');
                return;
            }

            const { DataTransferDialog } = await import('../../views/dataTransfer/DataTransferDialog.js');
            DataTransferDialog.createOrShow(context.extensionUri, context);
        })
    );

    return disposables;
}
