import * as vscode from 'vscode';
import { getConnectionManager } from '../connection/ConnectionManager';
import { ConnectionConfig } from '../connection/ConnectionConfig';
import { DatabaseModule } from '../DatabaseModule';
import type { ITreeNode } from '../../shared/treeNodeTypes';
import { getSchemaCache } from '../schema/SchemaCache';
import type { QueryError } from '../adapters/IDatabaseAdapter';
import type { DatabaseAdapter } from '../adapters/AdapterFactory';
import { t } from '../../i18n/index';
import { getConfigManager } from '../../core/configManager';
import { setupQueryResultPanelCallbacks } from './queryResultCallbacks';

/**
 * Reads a string field from a tree node without importing concrete
 * `*TreeNode` classes from the views layer. The database layer must
 * stay decoupled from `views/databaseExplorer/treeNodes`.
 */
function getNodeField(node: ITreeNode, field: string): string {
    return (node as unknown as Record<string, unknown>)[field] as string;
}

// Lazy resolvers for view-layer panel constructors. The views layer value-
// imports database-layer services (ConnectionManager, SchemaCache, ...), so
// eagerly importing the panel modules here would form a
// `database -> views -> database` runtime cycle. The bundled output is
// CommonJS, so `require()` is synchronous.
let _QueryResultPanelCtor: typeof import('../../views/queryResult/QueryResultPanel').QueryResultPanel | undefined;
function getQueryResultPanelCtor(): typeof import('../../views/queryResult/QueryResultPanel').QueryResultPanel {
    if (!_QueryResultPanelCtor) {
        // Lazy require to break the `database -> views -> database` runtime cycle.
        // The bundled output is CommonJS, so `require()` is synchronous.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const mod = require('../../views/queryResult/QueryResultPanel') as typeof import('../../views/queryResult/QueryResultPanel');
        _QueryResultPanelCtor = mod.QueryResultPanel;
    }
    return _QueryResultPanelCtor;
}

let _TableDesignerPanelCtor: typeof import('../../views/tableDesigner/TableDesignerPanel').TableDesignerPanel | undefined;
function getTableDesignerPanelCtor(): typeof import('../../views/tableDesigner/TableDesignerPanel').TableDesignerPanel {
    if (!_TableDesignerPanelCtor) {
        // Lazy require to break the `database -> views -> database` runtime cycle.
        // The bundled output is CommonJS, so `require()` is synchronous.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const mod = require('../../views/tableDesigner/TableDesignerPanel') as typeof import('../../views/tableDesigner/TableDesignerPanel');
        _TableDesignerPanelCtor = mod.TableDesignerPanel;
    }
    return _TableDesignerPanelCtor;
}


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
        vscode.commands.registerCommand('hive-formatter.viewTableData', async (node?: ITreeNode) => {
            try {
                if (!node) {
                    vscode.window.showErrorMessage(t('database.noTableNodeSelected'));
                    return;
                }

                const connectionId = getNodeField(node, 'connectionId');
                const databaseName = getNodeField(node, 'databaseName');
                const name = node.type === 'table' ? getNodeField(node, 'tableName') : getNodeField(node, 'viewName');

                const connectionManager = getConnectionManager();
                const adapter = connectionManager.getAdapter(connectionId);
                if (!adapter) {
                    vscode.window.showWarningMessage(t('database.noAdapterForTable'));
                    return;
                }

                const quotedName = adapter.schemaAdapter.quoteIdentifier(databaseName) + '.' + adapter.schemaAdapter.quoteIdentifier(name);
                const maxRows = getConfigManager().get<number>('query.maxRows', 1000);
                const sql = `SELECT * FROM ${quotedName} LIMIT ${maxRows};`;

                let queryResultPanel = getQueryResultPanelCtor().getCurrentInstance();
                if (!queryResultPanel || queryResultPanel.isDisposed) {
                    queryResultPanel = getQueryResultPanelCtor().createOrShow(context.extensionUri, context);
                    setupQueryResultPanelCallbacks(queryResultPanel, dbModule, connectionId, databaseName);
                } else {
                    queryResultPanel.showLoading(sql);
                }

                try {
                    const dbListAdapter = getConnectionManager().getAdapter(connectionId);
                    if (dbListAdapter) {
                        const dbs = await dbListAdapter.metadataAdapter.listDatabases();
                        queryResultPanel?.sendDatabaseList(dbs.map(d => d.name), databaseName);
                    }
                } catch (_e) { /* ignore */ }

                queryResultPanel.onExecutePanelSql = async (panelSql: string): Promise<void> => {
                    try {
                        const currentPanel = getQueryResultPanelCtor().getCurrentInstance();
                        if (!currentPanel || currentPanel.isDisposed) return;
                        const panelConn = getConnectionManager().getAllConnections().find(c => c.id === connectionId);
                        const panelAdapter = getConnectionManager().getAdapter(connectionId);
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
                        const panelResult = await queryExecutor.execute(panelAdapter, panelSql, { database: databaseName }, connectionId);
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
                        const currentPanel = getQueryResultPanelCtor().getCurrentInstance();
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

    function createViewDDLCommand(
        commandId: string,
        getNodeName: (node: ITreeNode) => string,
        getDDL: (adapter: DatabaseAdapter, database: string, name: string) => Promise<string>
    ): vscode.Disposable {
        return vscode.commands.registerCommand(commandId, async (node?: ITreeNode) => {
            if (!node) return;
            const connectionId = getNodeField(node, 'connectionId');
            const databaseName = getNodeField(node, 'databaseName');
            const adapter = getConnectionManager().getAdapter(connectionId);
            if (!adapter) return;
            try {
                const ddl = await getDDL(adapter, databaseName, getNodeName(node));
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
        createViewDDLCommand('hive-formatter.viewTableDDL', n => getNodeField(n, 'tableName'), (a, db, name) => a.schemaAdapter.getTableDDL(db, name)),
        createViewDDLCommand('hive-formatter.viewViewDDL', n => getNodeField(n, 'viewName'), (a, db, name) => a.schemaAdapter.getViewDDL(db, name)),
        createViewDDLCommand('hive-formatter.viewFunctionDDL', n => getNodeField(n, 'functionName'), (a, db, name) => a.schemaAdapter.getFunctionDDL(db, name)),
        createViewDDLCommand('hive-formatter.viewProcedureDDL', n => getNodeField(n, 'procedureName'), (a, db, name) => a.schemaAdapter.getProcedureDDL(db, name)),
        createViewDDLCommand('hive-formatter.viewTriggerDDL', n => getNodeField(n, 'triggerName'), (a, db, name) => a.schemaAdapter.getTriggerDDL(db, name)),
    );

    disposables.push(
        vscode.commands.registerCommand('hive-formatter.newQuery', async (node?: ITreeNode) => {
            let database = '';
            let connectionId = '';
            if (node?.type === 'database') {
                database = getNodeField(node, 'databaseName');
                connectionId = getNodeField(node, 'connectionId');
            } else if (node?.type === 'connection') {
                connectionId = getNodeField(node, 'connectionId');
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
            const q = newQueryAdapter ? newQueryAdapter.schemaAdapter.quoteIdentifier.bind(newQueryAdapter.schemaAdapter) : ((id: string): string => '`' + id.replace(/`/g, '``') + '`');
            const content = database ? `USE ${q(database)};\n\n` : '';

            let queryResultPanel = getQueryResultPanelCtor().getCurrentInstance();
            if (!queryResultPanel || queryResultPanel.isDisposed) {
                queryResultPanel = getQueryResultPanelCtor().createOrShow(context.extensionUri, context);
                setupQueryResultPanelCallbacks(queryResultPanel, dbModule, connectionId, database);
            }

            try {
                const dbListAdapter = connectionId ? connectionManager.getAdapter(connectionId) : undefined;
                if (dbListAdapter) {
                    const dbs = await dbListAdapter.metadataAdapter.listDatabases();
                    queryResultPanel?.sendDatabaseList(dbs.map(d => d.name), database);
                }
            } catch (_e) { /* ignore: database list is best-effort */ console.debug('[SQL All in One] Failed to list databases for table designer:', _e) }

            if (queryResultPanel && !queryResultPanel.isDisposed) {
                queryResultPanel.setSql(content);
            }
        })
    );

    disposables.push(
        vscode.commands.registerCommand('hive-formatter.copyColumnName', async (node?: ITreeNode) => {
            if (node) {
                // ColumnTreeNode.label === columnInfo.name (see views/databaseExplorer/treeNodes.ts).
                await vscode.env.clipboard.writeText(node.label);
                vscode.window.showInformationMessage(t('database.columnCopied'));
            }
        })
    );

    disposables.push(
        vscode.commands.registerCommand('hive-formatter.addToFavorites', async (node?: ITreeNode) => {
            if (node) {
                const connectionId = getNodeField(node, 'connectionId');
                const databaseName = getNodeField(node, 'databaseName');
                const conn = getConnectionManager().getAllConnections().find(
                    (c) => c.id === connectionId
                );
                if (conn) {
                    const name = node.type === 'table' ? getNodeField(node, 'tableName') : getNodeField(node, 'viewName');
                    const type: 'table' | 'view' = node.type === 'table' ? 'table' : 'view';
                    await treeProvider?.addFavorite(
                        connectionId,
                        conn.name,
                        databaseName,
                        type,
                        name
                    );
                    vscode.window.showInformationMessage(t('database.addedToFavorites'));
                }
            }
        })
    );

    disposables.push(
        vscode.commands.registerCommand('hive-formatter.removeFromFavorites', async (node?: ITreeNode) => {
            if (node) {
                await treeProvider?.removeFavorite(
                    getNodeField(node, 'connectionId'),
                    getNodeField(node, 'databaseName'),
                    node.type as 'table' | 'view',
                    getNodeField(node, 'objectName')
                );
                vscode.window.showInformationMessage(t('database.removedFromFavorites'));
            }
        })
    );

    disposables.push(
        vscode.commands.registerCommand('hive-formatter.revealInExplorer', async (node?: ITreeNode) => {
            if (node) {
                vscode.window.showInformationMessage(
                    t('explorer.revealInfo', node.type, getNodeField(node, 'objectName'), getNodeField(node, 'connectionName'), getNodeField(node, 'databaseName'))
                );
            }
        })
    );

    disposables.push(
        vscode.commands.registerCommand('hive-formatter.setDefaultDatabase', async (node?: ITreeNode) => {
            if (node) {
                const connectionId = getNodeField(node, 'connectionId');
                const databaseName = getNodeField(node, 'databaseName');
                const manager = getConnectionManager();
                const currentConfig = manager.getAllConnections().find(c => c.id === connectionId);
                if (!currentConfig) {
                    vscode.window.showErrorMessage(t('database.connectionNotFound'));
                    return;
                }

                const updatedConfig: ConnectionConfig = {
                    ...currentConfig,
                    database: databaseName
                };

                try {
                    await manager.updateConnection(connectionId, updatedConfig);
                    treeProvider?.refresh();
                    vscode.window.showInformationMessage(t('database.defaultDatabaseSet', databaseName));
                } catch (error) {
                    vscode.window.showErrorMessage(t('database.failedToSetDefaultDatabase', String(error)));
                }
            }
        })
    );

    disposables.push(
        vscode.commands.registerCommand('hive-formatter.designTable', async (node?: ITreeNode) => {
            const connectionManager = getConnectionManager();
            const activeConn = connectionManager.getActiveConnection();
            if (!activeConn) {
                vscode.window.showWarningMessage(t('database.noActiveConnection'));
                return;
            }

            let database = '';
            if (node?.type === 'database') {
                database = getNodeField(node, 'databaseName');
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
                    const databases = await adapter.metadataAdapter.listDatabases();
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

            const tableDesignerPanel = getTableDesignerPanelCtor().createOrShow(
                context.extensionUri,
                context
            );
            await tableDesignerPanel.openForCreate(database);
        })
    );

    disposables.push(
        vscode.commands.registerCommand('hive-formatter.editTable', async (node?: ITreeNode) => {
            if (!node) {
                vscode.window.showWarningMessage(t('database.selectTableToEdit'));
                return;
            }

            const connectionId = getNodeField(node, 'connectionId');
            const databaseName = getNodeField(node, 'databaseName');
            const tableName = getNodeField(node, 'tableName');

            const connectionManager = getConnectionManager();
            const adapter = connectionManager.getAdapter(connectionId);
            if (!adapter) {
                vscode.window.showWarningMessage(t('database.noAdapterForTable'));
                return;
            }

            const tableDesignerPanel = getTableDesignerPanelCtor().createOrShow(
                context.extensionUri,
                context
            );
            await tableDesignerPanel.openForEdit(databaseName, tableName);
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

            const capabilities = adapter.schemaAdapter.getDialectCapabilities();
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
