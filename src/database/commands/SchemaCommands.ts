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
    FavoriteTreeNode
} from '../../views/databaseExplorer/treeNodes';
import { getSchemaCache } from '../schema/SchemaCache';
import { TableDesignerPanel } from '../../views/tableDesigner/TableDesignerPanel';
import { QueryResultPanel, FilterCondition, type PendingChange, type ForeignKeyOption } from '../../views/queryResult/QueryResultPanel';
import type { QueryError } from '../adapters/IDatabaseAdapter';
import { generateEditSql, executeInTransaction, getActiveAdapter } from '../query/DataEditService';
import { t } from '../../i18n/index';
import type { SqlStatementDetector } from '../query/SqlStatementDetector';
import type { QueryExecutor } from '../query/QueryExecutor';


export function registerSchemaCommands(
    context: vscode.ExtensionContext,
    dbModule: DatabaseModule,
    statementDetector: SqlStatementDetector | undefined,
    queryExecutor: QueryExecutor | undefined,
    outputChannel: vscode.OutputChannel | undefined
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
                const sql = `SELECT * FROM ${quotedName} LIMIT 100;`;

                let queryResultPanel = QueryResultPanel.getCurrentInstance();
                if (!queryResultPanel || queryResultPanel.isDisposed) {
                    queryResultPanel = QueryResultPanel.createOrShow(context.extensionUri, context);
                    queryResultPanel.onExecuteQuery = (_sql: string): void => {
                        vscode.commands.executeCommand('hive-formatter.executeQuery');
                    };
                    queryResultPanel.onCancelQuery = (): void => {
                        vscode.commands.executeCommand('hive-formatter.cancelQuery');
                    };
                    queryResultPanel.onRequestSort = (_column: string, _direction: string): void => {
                        vscode.commands.executeCommand('hive-formatter.executeQuery');
                    };
                    queryResultPanel.onRequestFilter = (_conditions: FilterCondition[]): void => {
                        vscode.commands.executeCommand('hive-formatter.executeQuery');
                    };
                    queryResultPanel.onRequestPage = (_page: number): void => {
                        vscode.commands.executeCommand('hive-formatter.executeQuery');
                    };
                    queryResultPanel.onCommitChanges = async (changes: PendingChange[], tableName: string, _database: string): Promise<{ success: boolean; errors?: string[] }> => {
                        try {
                            const editAdapter = getActiveAdapter();
                            if (!editAdapter) {
                                return { success: false, errors: [t('database.noActiveAdapter')] };
                            }
                            const currentResult = QueryResultPanel.getCurrentInstance()?.getCurrentResult();
                            if (!currentResult) {
                                return { success: false, errors: [t('database.noQueryResult')] };
                            }
                            const statements = generateEditSql(
                                changes,
                                tableName,
                                currentResult.columns,
                                currentResult.rows,
                                editAdapter.quoteIdentifier.bind(editAdapter)
                            );
                            return await executeInTransaction(editAdapter, statements);
                        } catch (error) {
                            return { success: false, errors: [(error as Error).message] };
                        }
                    };
                    queryResultPanel.onRequestForeignKeyOptions = async (_column: string, referencedTable: string, database: string): Promise<ForeignKeyOption[]> => {
                        try {
                            const fkAdapter = getActiveAdapter();
                            if (!fkAdapter) return [];
                            const activeConfig = getConnectionManager().getActiveConnection();
                            const structure = await fkAdapter.describeTable(database || activeConfig?.database || '', referencedTable);
                            const pkCol = structure.columns.find(c => c.isPrimaryKey);
                            let displayCol = structure.columns.find(c => c.comment && c.type.toUpperCase().includes('VARCHAR'));
                            if (!displayCol) displayCol = structure.columns.find(c => !c.isPrimaryKey);
                            if (!displayCol) displayCol = pkCol;
                            if (!pkCol) return [];
                            const q = fkAdapter.quoteIdentifier.bind(fkAdapter);
                            const fkSql = `SELECT ${q(pkCol.name)}, ${q(displayCol?.name || pkCol.name)} FROM ${q(referencedTable)} LIMIT 100`;
                            const result = await fkAdapter.execute(fkSql);
                            return result.rows.map((row: Record<string, unknown>) => ({
                                value: row[pkCol.name],
                                displayText: row[displayCol?.name || pkCol.name] !== null && row[displayCol?.name || pkCol.name] !== undefined
                                    ? String(row[pkCol.name]) + ' - ' + String(row[displayCol?.name || pkCol.name])
                                    : String(row[pkCol.name]),
                            }));
                        } catch {
                            return [];
                        }
                    };
                    queryResultPanel.onBeginTransaction = async (): Promise<void> => {
                        const txAdapter = getActiveAdapter();
                        if (txAdapter) await txAdapter.beginTransaction();
                    };
                    queryResultPanel.onCommitTransaction = async (): Promise<void> => {
                        const txAdapter = getActiveAdapter();
                        if (txAdapter) await txAdapter.commit();
                    };
                    queryResultPanel.onRollbackTransaction = async (): Promise<void> => {
                        const txAdapter = getActiveAdapter();
                        if (txAdapter) await txAdapter.rollback();
                    };
                    queryResultPanel.onCreateSavepoint = async (name: string): Promise<void> => {
                        const spAdapter = getActiveAdapter();
                        if (spAdapter) {
                            if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
                                throw new Error(t('database.invalidSavepointName', name));
                            }
                            await spAdapter.execute(`SAVEPOINT ${name}`);
                        }
                    };
                    queryResultPanel.onRollbackToSavepoint = async (name: string): Promise<void> => {
                        const spAdapter = getActiveAdapter();
                        if (spAdapter) {
                            if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
                                throw new Error(t('database.invalidSavepointName', name));
                            }
                            await spAdapter.execute(`ROLLBACK TO SAVEPOINT ${name}`);
                        }
                    };
                } else {
                    queryResultPanel.showLoading(sql);
                }

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
                vscode.window.showErrorMessage(t('database.failedToViewTableData', msg));
                outputChannel?.appendLine(`❌ viewTableData error: ${msg}`);
            }
        })
    );

    disposables.push(
        vscode.commands.registerCommand('hive-formatter.viewTableDDL', async (node?: TableTreeNode) => {
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
                        vscode.window.showErrorMessage(t('database.failedToGetDdl', String(error)));
                    }
                }
            }
        })
    );

    disposables.push(
        vscode.commands.registerCommand('hive-formatter.newQuery', async (node?: DatabaseTreeNode | ConnectionTreeNode) => {
            let database = '';
            if (node instanceof DatabaseTreeNode) {
                database = node.databaseName;
            }
            const activeConn = getConnectionManager().getActiveConnection();
            const newQueryAdapter = activeConn ? getConnectionManager().getAdapter(activeConn.id) : undefined;
            const q = activeConn ? newQueryAdapter!.quoteIdentifier.bind(newQueryAdapter) : ((id: string): string => '`' + id.replace(/`/g, '``') + '`');
            const content = database ? `USE ${q(database)};\n\n` : '';
            const document = await vscode.workspace.openTextDocument({
                content,
                language: 'sql'
            });
            await vscode.window.showTextDocument(document);
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
                    `${node.objectType}: ${node.objectName} | Connection: ${node.connectionName} | Database: ${node.databaseName}`
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

            const statement = statementDetector!.detectSelectionOrCurrent(
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
