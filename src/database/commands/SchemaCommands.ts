import * as vscode from 'vscode';
import { getConnectionManager } from '../connection/ConnectionManager';
import { ConnectionConfig } from '../connection/ConnectionConfig';
import { DatabaseModule } from '../DatabaseModule';
import {
    ConnectionTreeNode,
    TableTreeNode,
    ViewTreeNode,
    ColumnTreeNode,
    DatabaseTreeNode,
    FavoriteTreeNode,
    FunctionTreeNode,
    ProcedureTreeNode,
    TriggerTreeNode
} from '../../views/databaseExplorer/treeNodes';
import { getSchemaCache } from '../schema/SchemaCache';
import { TableDesignerPanel } from '../../views/tableDesigner/TableDesignerPanel';
import { QueryResultPanel } from '../../views/queryResult/QueryResultPanel';
import type { IDatabaseAdapter, QueryError } from '../adapters/IDatabaseAdapter';
import { t } from '../../i18n/index';
import { getConfigManager } from '../../core/configManager';
import { setupQueryResultPanelCallbacks } from './queryResultCallbacks';


export function registerSchemaCommands(
    context: vscode.ExtensionContext,
    dbModule: DatabaseModule
): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = [];
    const treeProvider = dbModule.getTreeProvider();

    disposables.push(
        vscode.commands.registerCommand('hive-formatter.refreshSchema', async () => {
            const activeConn = getConnectionManager().getActiveConnection();
            if (activeConn) {
                getSchemaCache().invalidate(activeConn.id);
            }
            treeProvider?.refresh();
        })
    );

    disposables.push(
        vscode.commands.registerCommand('hive-formatter.viewTableData', async (node?: TableTreeNode | ViewTreeNode) => {
            try {
                if (!node) {
                    vscode.window.showErrorMessage(t('database.noTableNodeSelected'));
                    return;
                }

                const connectionManager = getConnectionManager();
                const adapter = connectionManager.getAdapter(node.connectionId);
                if (!adapter) {
                    vscode.window.showWarningMessage(t('database.noAdapterForTable'));
                    return;
                }

                const name = node instanceof TableTreeNode ? node.tableName : node.viewName;
                const quotedName = adapter.quoteIdentifier(node.databaseName) + '.' + adapter.quoteIdentifier(name);
                const maxRows = getConfigManager().get<number>('query.maxRows', 1000);
                const sql = `SELECT * FROM ${quotedName} LIMIT ${maxRows};`;

                let queryResultPanel = QueryResultPanel.getCurrentInstance();
                if (!queryResultPanel || queryResultPanel.isDisposed) {
                    queryResultPanel = QueryResultPanel.createOrShow(context.extensionUri, context);
                    setupQueryResultPanelCallbacks(queryResultPanel, dbModule, node.connectionId, node.databaseName);
                } else {
                    queryResultPanel.showLoading(sql);
                }

                try {
                    const dbListAdapter = getConnectionManager().getAdapter(node.connectionId);
                    if (dbListAdapter) {
                        const dbs = await dbListAdapter.listDatabases();
                        queryResultPanel?.sendDatabaseList(dbs.map(d => d.name), node.databaseName);
                    }
                } catch (_e) { /* ignore */ }

                queryResultPanel.onExecutePanelSql = async (panelSql: string): Promise<void> => {
                    try {
                        const currentPanel = QueryResultPanel.getCurrentInstance();
                        if (!currentPanel || currentPanel.isDisposed) return;
                        const panelConn = getConnectionManager().getAllConnections().find(c => c.id === node.connectionId);
                        const panelAdapter = getConnectionManager().getAdapter(node.connectionId);
                        if (!panelAdapter) {
                            currentPanel.showError({ code: 'NO_CONNECTION', message: t('database.noActiveAdapter'), sql: panelSql });
                            return;
                        }
                        currentPanel.showLoading(panelSql);
                        const queryExecutor = dbModule.getQueryExecutor();
                        const outputChannel = dbModule.getOutputChannel();
                        if (!queryExecutor) {
                            currentPanel.showError({ code: 'NO_EXECUTOR', message: t('database.noActiveAdapter'), sql: panelSql });
                            return;
                        }
                        const panelResult = await queryExecutor.execute(panelAdapter, panelSql, { database: node.databaseName }, node.connectionId);
                        if (currentPanel.isDisposed) return;
                        if (panelResult.status === 'error') {
                            outputChannel?.appendLine(`❌ Error: ${panelResult.error?.message || t('database.unknownError')}`);
                            outputChannel?.appendLine(`   SQL: ${panelSql}`);
                            currentPanel.showError(panelResult.error as QueryError);
                        } else {
                            outputChannel?.appendLine(`✅ ${t('database.queryExecutedSuccessfully', String(panelResult.executionTime), String(panelResult.rowCount))}`);
                            outputChannel?.appendLine(`   SQL: ${panelSql}`);
                            currentPanel.showResult(panelResult, panelConn?.name, panelConn?.color, name);
                        }
                    } catch (error) {
                        const currentPanel = QueryResultPanel.getCurrentInstance();
                        if (!currentPanel || currentPanel.isDisposed) return;
                        currentPanel.showError({ code: 'EXEC_ERROR', message: String(error), sql: panelSql });
                    }
                };

                if (queryResultPanel && !queryResultPanel.isDisposed) {
                    queryResultPanel.setSqlAndExecute(sql);
                }
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                const outputChannel = dbModule.getOutputChannel();
                vscode.window.showErrorMessage(t('database.failedToViewTableData', msg));
                outputChannel?.appendLine(`❌ viewTableData error: ${msg}`);
            }
        })
    );

    function createViewDDLCommand<TNode extends { connectionId: string; databaseName: string }>(
        commandId: string,
        getNodeName: (node: TNode) => string,
        getDDL: (adapter: IDatabaseAdapter, database: string, name: string) => Promise<string>
    ): vscode.Disposable {
        return vscode.commands.registerCommand(commandId, async (node?: TNode) => {
            if (!node) return;
            const adapter = getConnectionManager().getAdapter(node.connectionId);
            if (!adapter) return;
            try {
                const ddl = await getDDL(adapter, node.databaseName, getNodeName(node));
                const document = await vscode.workspace.openTextDocument({
                    content: ddl,
                    language: 'sql'
                });
                await vscode.window.showTextDocument(document);
            } catch (error) {
                vscode.window.showErrorMessage(t('database.failedToGetDdl', String(error)));
            }
        });
    }

    disposables.push(
        createViewDDLCommand<TableTreeNode>('hive-formatter.viewTableDDL', n => n.tableName, (a, db, name) => a.getTableDDL(db, name)),
        createViewDDLCommand<ViewTreeNode>('hive-formatter.viewViewDDL', n => n.viewName, (a, db, name) => a.getViewDDL(db, name)),
        createViewDDLCommand<FunctionTreeNode>('hive-formatter.viewFunctionDDL', n => n.functionName, (a, db, name) => a.getFunctionDDL(db, name)),
        createViewDDLCommand<ProcedureTreeNode>('hive-formatter.viewProcedureDDL', n => n.procedureName, (a, db, name) => a.getProcedureDDL(db, name)),
        createViewDDLCommand<TriggerTreeNode>('hive-formatter.viewTriggerDDL', n => n.triggerName, (a, db, name) => a.getTriggerDDL(db, name)),
    );

    disposables.push(
        vscode.commands.registerCommand('hive-formatter.newQuery', async (node?: DatabaseTreeNode | ConnectionTreeNode) => {
            let database = '';
            let connectionId = '';
            if (node instanceof DatabaseTreeNode) {
                database = node.databaseName;
                connectionId = node.connectionId;
            } else if (node instanceof ConnectionTreeNode) {
                connectionId = node.connectionId;
                const activeConn = getConnectionManager().getActiveConnection();
                database = activeConn?.database || '';
            }

            const connectionManager = getConnectionManager();
            const activeConn = connectionManager.getActiveConnection();
            if (!connectionId && activeConn) {
                connectionId = activeConn.id;
            }
            if (!database && activeConn) {
                database = activeConn.database || '';
            }

            const newQueryAdapter = connectionId ? connectionManager.getAdapter(connectionId) : undefined;
            const q = newQueryAdapter ? newQueryAdapter.quoteIdentifier.bind(newQueryAdapter) : ((id: string): string => '`' + id.replace(/`/g, '``') + '`');
            const content = database ? `USE ${q(database)};\n\n` : '';

            let queryResultPanel = QueryResultPanel.getCurrentInstance();
            if (!queryResultPanel || queryResultPanel.isDisposed) {
                queryResultPanel = QueryResultPanel.createOrShow(context.extensionUri, context);
                setupQueryResultPanelCallbacks(queryResultPanel, dbModule, connectionId, database);
            }

            try {
                const dbListAdapter = connectionId ? connectionManager.getAdapter(connectionId) : undefined;
                if (dbListAdapter) {
                    const dbs = await dbListAdapter.listDatabases();
                    queryResultPanel?.sendDatabaseList(dbs.map(d => d.name), database);
                }
            } catch (_e) { /* ignore: database list is best-effort */ console.debug('[SQL All in One] Failed to list databases for table designer:', _e) }

            if (queryResultPanel && !queryResultPanel.isDisposed) {
                queryResultPanel.setSql(content);
            }
        })
    );

    disposables.push(
        vscode.commands.registerCommand('hive-formatter.copyColumnName', async (node?: ColumnTreeNode) => {
            if (node) {
                await vscode.env.clipboard.writeText(node.columnInfo.name);
                vscode.window.showInformationMessage(t('database.columnCopied'));
            }
        })
    );

    disposables.push(
        vscode.commands.registerCommand('hive-formatter.addToFavorites', async (node?: TableTreeNode | ViewTreeNode) => {
            if (node) {
                const conn = getConnectionManager().getAllConnections().find(
                    (c) => c.id === node.connectionId
                );
                if (conn) {
                    const name = node instanceof TableTreeNode ? node.tableName : node.viewName;
                    const type = node instanceof TableTreeNode ? 'table' : 'view';
                    await treeProvider?.addFavorite(
                        node.connectionId,
                        conn.name,
                        node.databaseName,
                        type,
                        name
                    );
                    vscode.window.showInformationMessage(t('database.addedToFavorites'));
                }
            }
        })
    );

    disposables.push(
        vscode.commands.registerCommand('hive-formatter.removeFromFavorites', async (node?: FavoriteTreeNode) => {
            if (node) {
                await treeProvider?.removeFavorite(
                    node.connectionId,
                    node.databaseName,
                    node.objectType,
                    node.objectName
                );
                vscode.window.showInformationMessage(t('database.removedFromFavorites'));
            }
        })
    );

    disposables.push(
        vscode.commands.registerCommand('hive-formatter.revealInExplorer', async (node?: FavoriteTreeNode) => {
            if (node) {
                vscode.window.showInformationMessage(
                    t('explorer.revealInfo', node.objectType, node.objectName, node.connectionName, node.databaseName)
                );
            }
        })
    );

    disposables.push(
        vscode.commands.registerCommand('hive-formatter.setDefaultDatabase', async (node?: DatabaseTreeNode) => {
            if (node) {
                const manager = getConnectionManager();
                const currentConfig = manager.getAllConnections().find(c => c.id === node.connectionId);
                if (!currentConfig) {
                    vscode.window.showErrorMessage(t('database.connectionNotFound'));
                    return;
                }

                const updatedConfig: ConnectionConfig = {
                    ...currentConfig,
                    database: node.databaseName
                };

                try {
                    await manager.updateConnection(node.connectionId, updatedConfig);
                    treeProvider?.refresh();
                    vscode.window.showInformationMessage(t('database.defaultDatabaseSet', node.databaseName));
                } catch (error) {
                    vscode.window.showErrorMessage(t('database.failedToSetDefaultDatabase', String(error)));
                }
            }
        })
    );

    disposables.push(
        vscode.commands.registerCommand('hive-formatter.designTable', async (node?: DatabaseTreeNode | ConnectionTreeNode) => {
            const connectionManager = getConnectionManager();
            const activeConn = connectionManager.getActiveConnection();
            if (!activeConn) {
                vscode.window.showWarningMessage(t('database.noActiveConnection'));
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
                        vscode.window.showWarningMessage(t('database.noDatabaseAdapter'));
                        return;
                    }
                    const databases = await adapter.listDatabases();
                    const picked = await vscode.window.showQuickPick(
                        databases.map(d => d.name),
                        { placeHolder: t('database.selectDatabase') }
                    );
                    if (!picked) return;
                    database = picked;
                } catch {
                    vscode.window.showWarningMessage(t('database.failedToListDatabases'));
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
        vscode.commands.registerCommand('hive-formatter.editTable', async (node?: TableTreeNode) => {
            if (!node) {
                vscode.window.showWarningMessage(t('database.selectTableToEdit'));
                return;
            }

            const connectionManager = getConnectionManager();
            const adapter = connectionManager.getAdapter(node.connectionId);
            if (!adapter) {
                vscode.window.showWarningMessage(t('database.noAdapterForTable'));
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
        vscode.commands.registerCommand('hive-formatter.explainQuery', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage(t('database.noActiveEditor'));
                return;
            }

            const connectionManager = getConnectionManager();
            const activeConn = connectionManager.getActiveConnection();
            if (!activeConn) {
                vscode.window.showWarningMessage(t('database.noActiveConnection'));
                return;
            }

            const adapter = connectionManager.getAdapter(activeConn.id);
            if (!adapter) {
                vscode.window.showWarningMessage(t('database.noActiveAdapter'));
                return;
            }

            const capabilities = adapter.getDialectCapabilities();
            if (!capabilities.supportsExplain) {
                vscode.window.showWarningMessage(t('database.currentDbNoExplain'));
                return;
            }

            const statementDetector = dbModule.getStatementDetector();
            if (!statementDetector) {
                vscode.window.showWarningMessage(t('database.noActiveAdapter'));
                return;
            }
            const statement = statementDetector.detectSelectionOrCurrent(
                editor.document,
                editor.selection
            );

            if (!statement.sql) {
                vscode.window.showWarningMessage(t('database.noSqlFound'));
                return;
            }

            const { ExplainPlanPanel } = await import('../../views/explainPlan/ExplainPlanPanel.js');
            const panel = ExplainPlanPanel.createOrShow(context.extensionUri, context);
            await panel.showExplainPlan(statement.sql, false);
        })
    );

    disposables.push(
        vscode.commands.registerCommand('hive-formatter.importData', async () => {
            const connectionManager = getConnectionManager();
            const activeConn = connectionManager.getActiveConnection();
            if (!activeConn) {
                vscode.window.showWarningMessage(t('database.noActiveConnection'));
                return;
            }

            const { DataTransferDialog } = await import('../../views/dataTransfer/DataTransferDialog.js');
            DataTransferDialog.createOrShow(context.extensionUri, context);
        })
    );

    return disposables;
}
