import * as vscode from 'vscode';
import { getConnectionManager } from '../connection/ConnectionManager';
import { DatabaseModule } from '../DatabaseModule';
import type { SqlDialect } from '../../parser/dialectMapper';
import { QueryResultPanel, FilterCondition } from '../../views/queryResult/QueryResultPanel';
import type { QueryError, QueryRow } from '../adapters/IDatabaseAdapter';
import { getSchemaCache } from '../schema/SchemaCache';
import { getConfigManager } from '../../core/configManager';
import { generateEditSql, executeInTransaction, getActiveAdapter } from '../query/DataEditService';
import { t } from '../../i18n/index';


function isDDLStatement(sql: string): boolean {
    const upper = sql.trim().toUpperCase();
    return upper.startsWith('ALTER ') ||
        upper.startsWith('CREATE ') ||
        upper.startsWith('DROP ') ||
        upper.startsWith('RENAME ') ||
        upper.startsWith('TRUNCATE ');
}

function isRoutineDDL(sql: string): boolean {
    const upper = sql.trim().toUpperCase();
    return /\b(CREATE|DROP|ALTER)\s+(FUNCTION|PROCEDURE)\b/i.test(upper);
}

function invalidateSchemaOnDDL(sql: string): void {
    const cfgMgr = getConfigManager();
    if (!cfgMgr.get<boolean>('schemaCache.refreshOnDDL', true)) return;

    const connectionManager = getConnectionManager();
    const activeConn = connectionManager.getActiveConnection();
    if (!activeConn) return;

    const schemaCache = getSchemaCache();
    schemaCache.invalidate(activeConn.id, 'table', activeConn.database);
    if (isRoutineDDL(sql)) {
        schemaCache.invalidate(activeConn.id, 'function', activeConn.database);
        schemaCache.invalidate(activeConn.id, 'procedure', activeConn.database);
    }
}

export function registerQueryCommands(
    context: vscode.ExtensionContext,
    dbModule: DatabaseModule
): { disposables: vscode.Disposable[]; getQueryResultPanel: () => QueryResultPanel | undefined } {
    const disposables: vscode.Disposable[] = [];

    const getQueryResultPanel = (): QueryResultPanel | undefined => QueryResultPanel.currentPanel;

    const queryExecutor = dbModule.getQueryExecutor();
    const safeQueryGuard = dbModule.getSafeQueryGuard();
    const statementDetector = dbModule.getStatementDetector();
    const queryHistory = dbModule.getQueryHistory();
    const outputChannel = dbModule.getOutputChannel();

    disposables.push(
        vscode.commands.registerCommand('hive-formatter.executeQuery', async () => {
            if (!queryExecutor || !safeQueryGuard || !statementDetector || !queryHistory) {
                vscode.window.showErrorMessage(t('database.noActiveAdapter'));
                return;
            }

            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage(t('database.noActiveEditor'));
                return;
            }

            const connectionManager = getConnectionManager();
            const activeConn = connectionManager.getActiveConnection();
            let adapter = activeConn
                ? connectionManager.getAdapter(activeConn.id)
                : undefined;

            if (!adapter) {
                const connections = connectionManager.getAllConnections().filter(
                    (c) => connectionManager.getState(c.id) === 'connected'
                );
                if (connections.length === 0) {
                    vscode.window.showWarningMessage(t('database.noActiveConnection'));
                    return;
                }
                const picked = await vscode.window.showQuickPick(
                    connections.map((c) => ({
                        label: c.name,
                        description: `${c.host}:${c.port}`,
                        connectionId: c.id,
                    })),
                    { placeHolder: t('database.selectAConnection') }
                );
                if (!picked) return;
                connectionManager.setActiveConnection(picked.connectionId);
                adapter = connectionManager.getAdapter(picked.connectionId);
            }

            if (!adapter) {
                vscode.window.showErrorMessage(t('database.failedToGetAdapter'));
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

            const safetyResult = await safeQueryGuard.analyze(statement.sql, undefined, activeConn?.dialect as SqlDialect | undefined);
            if (!safetyResult.safe) {
                const confirmed = await safeQueryGuard.confirm(safetyResult);
                if (!confirmed) return;
            }

            let queryResultPanel = QueryResultPanel.currentPanel;
            if (!queryResultPanel || queryResultPanel.isDisposed) {
                queryResultPanel = QueryResultPanel.createOrShow(
                    context.extensionUri,
                    context
                );
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
            } else {
                queryResultPanel.showLoading(statement.sql);
            }

            queryResultPanel.onCommitChanges = async (changes, tableName, _database): Promise<{ success: boolean; errors?: string[] }> => {
                try {
                    const adapter = getActiveAdapter();
                    if (!adapter) {
                        return { success: false, errors: [t('database.noActiveAdapter')] };
                    }

                    const currentResult = QueryResultPanel.currentPanel?.getCurrentResult();
                    if (!currentResult) {
                        return { success: false, errors: [t('database.noQueryResult')] };
                    }

                    const statements = generateEditSql(
                        changes,
                        tableName,
                        currentResult.columns,
                        currentResult.rows,
                        adapter.quoteIdentifier.bind(adapter)
                    );

                    return await executeInTransaction(adapter, statements);
                } catch (error) {
                    return { success: false, errors: [(error as Error).message] };
                }
            };

            queryResultPanel.onRequestForeignKeyOptions = async (_column, referencedTable, database): Promise<import('../../views/queryResult/QueryResultPanel').ForeignKeyOption[]> => {
                try {
                    const adapter = getActiveAdapter();
                    if (!adapter) return [];

                    const activeConfig = getConnectionManager().getActiveConnection();
                    const structure = await adapter.describeTable(database || activeConfig?.database || '', referencedTable);
                    const pkCol = structure.columns.find(c => c.isPrimaryKey);
                    let displayCol = structure.columns.find(c => c.comment && c.type.toUpperCase().includes('VARCHAR'));
                    if (!displayCol) displayCol = structure.columns.find(c => !c.isPrimaryKey);
                    if (!displayCol) displayCol = pkCol;

                    if (!pkCol) return [];

                    const q = adapter.quoteIdentifier.bind(adapter);
                    const sql = `SELECT ${q(pkCol.name)}, ${q(displayCol?.name || pkCol.name)} FROM ${q(referencedTable)} LIMIT 100`;
                    const result = await adapter.execute(sql);

                    return result.rows.map((row: QueryRow) => ({
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
                const adapter = getActiveAdapter();
                if (adapter) await adapter.beginTransaction();
            };

            queryResultPanel.onCommitTransaction = async (): Promise<void> => {
                const adapter = getActiveAdapter();
                if (adapter) await adapter.commit();
            };

            queryResultPanel.onRollbackTransaction = async (): Promise<void> => {
                const adapter = getActiveAdapter();
                if (adapter) await adapter.rollback();
            };

            queryResultPanel.onCreateSavepoint = async (name: string): Promise<void> => {
                const adapter = getActiveAdapter();
                if (adapter) {
                    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
                        throw new Error(t('database.invalidSavepointName', name));
                    }
                    await adapter.execute(`SAVEPOINT ${name}`);
                }
            };

            queryResultPanel.onRollbackToSavepoint = async (name: string): Promise<void> => {
                const adapter = getActiveAdapter();
                if (adapter) {
                    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
                        throw new Error(t('database.invalidSavepointName', name));
                    }
                    await adapter.execute(`ROLLBACK TO SAVEPOINT ${name}`);
                }
            };

            queryResultPanel.onExecutePanelSql = async (sql: string): Promise<void> => {
                try {
                    const currentPanel = QueryResultPanel.currentPanel;
                    if (!currentPanel || currentPanel.isDisposed) return;

                    const connectionManager = getConnectionManager();
                    const activeConn = connectionManager.getActiveConnection();
                    const panelAdapter = activeConn
                        ? connectionManager.getAdapter(activeConn.id)
                        : undefined;

                    if (!panelAdapter) {
                        currentPanel.showError({
                            code: 'NO_CONNECTION',
                            message: t('database.noActiveAdapter'),
                            sql,
                        });
                        return;
                    }

                    currentPanel.showLoading(sql);
                    const result = await queryExecutor.execute(
                        panelAdapter,
                        sql,
                        { database: activeConn?.database },
                        activeConn?.id
                    );

                    if (currentPanel.isDisposed) return;

                    if (result.status === 'error') {
                        outputChannel?.appendLine(`❌ Error: ${result.error?.message || t('database.unknownError')}`);
                        outputChannel?.appendLine(`   SQL: ${sql}`);
                        currentPanel.showError(result.error as QueryError);
                    } else {
                        outputChannel?.appendLine(`✅ ${t('database.queryExecutedSuccessfully', String(result.executionTime), String(result.rowCount))}`);
                        outputChannel?.appendLine(`   SQL: ${sql}`);
                        const activeConfig = connectionManager.getActiveConnection();
                        currentPanel.showResult(result, activeConfig?.name, activeConfig?.color);
                    }
                } catch (error) {
                    const msg = error instanceof Error ? error.message : String(error);
                    const currentPanel = QueryResultPanel.currentPanel;
                    if (!currentPanel || currentPanel.isDisposed) return;
                    currentPanel.showError({
                        code: 'EXEC_ERROR',
                        message: msg,
                        sql,
                    });
                }
            };

            const activeConfig = connectionManager.getActiveConnection();
            const result = await queryExecutor.execute(
                adapter,
                statement.sql,
                { database: activeConfig?.database },
                activeConfig?.id
            );

            if (result.status === 'error') {
                outputChannel?.appendLine(`❌ Error: ${result.error?.message || t('database.unknownError')}`);
                outputChannel?.appendLine(`   SQL: ${statement.sql}`);
                if (queryResultPanel && !queryResultPanel.isDisposed) {
                    queryResultPanel.showError(result.error as QueryError);
                }
            } else {
                outputChannel?.appendLine(`✅ ${t('database.queryExecutedSuccessfully', String(result.executionTime), String(result.rowCount))}`);
                outputChannel?.appendLine(`   SQL: ${statement.sql}`);

                if (result.affectedRows !== undefined && result.affectedRows > 0) {
                    outputChannel?.appendLine(`   ${t('database.affectedRows', String(result.affectedRows))}`);
                }

                if (queryResultPanel && !queryResultPanel.isDisposed) {
                    queryResultPanel.showResult(result, activeConfig?.name, activeConfig?.color);
                }
            }

            if (result.status !== 'error' || result.error?.code !== 'CANCELLED') {
                if (result.status === 'success' && isDDLStatement(statement.sql)) {
                    invalidateSchemaOnDDL(statement.sql);
                }

                await queryHistory.add({
                    sql: statement.sql,
                    connectionId: activeConfig?.id || '',
                    connectionName: activeConfig?.name || '',
                    database: activeConfig?.database || '',
                    executedAt: new Date().toISOString(),
                    executionTime: result.executionTime,
                    rowCount: result.rowCount,
                    affectedRows: result.affectedRows,
                    status: result.status === 'success' ? 'success' : 'error',
                    errorMessage: result.error?.message,
                });
            }
        })
    );

    disposables.push(
        vscode.commands.registerCommand('hive-formatter.executeSelection', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage(t('database.noActiveEditor'));
                return;
            }

            if (editor.selection.isEmpty) {
                vscode.window.showWarningMessage(t('database.noTextSelected'));
                return;
            }

            vscode.commands.executeCommand('hive-formatter.executeQuery');
        })
    );

    disposables.push(
        vscode.commands.registerCommand('hive-formatter.cancelQuery', async () => {
            if (!queryExecutor) {
                vscode.window.showWarningMessage(t('database.noActiveAdapter'));
                return;
            }
            const running = queryExecutor.getRunningQueries();
            if (running.length === 0) {
                vscode.window.showInformationMessage(t('database.noRunningQueries'));
                return;
            }

            if (running.length === 1) {
                await queryExecutor.cancel(running[0].queryId);
                vscode.window.showInformationMessage(t('database.queryCancelled'));
                return;
            }

            const picked = await vscode.window.showQuickPick(
                running.map((q) => ({
                    label: q.sql.substring(0, 80),
                    description: `Running for ${Date.now() - q.startTime}ms`,
                    queryId: q.queryId,
                })),
                { placeHolder: t('database.selectQueryToCancel') }
            );

            if (!picked) return;
            await queryExecutor.cancel(picked.queryId);
            vscode.window.showInformationMessage(t('database.queryCancelled'));
        })
    );

    disposables.push(
        vscode.commands.registerCommand('hive-formatter.showQueryHistory', async () => {
            if (!queryHistory) {
                vscode.window.showWarningMessage(t('database.noActiveAdapter'));
                return;
            }
            const entries = queryHistory.getRecent(50);
            if (entries.length === 0) {
                vscode.window.showInformationMessage(t('database.noQueryHistory'));
                return;
            }

            const picked = await vscode.window.showQuickPick(
                entries.map((entry) => ({
                    label: entry.sql.substring(0, 80),
                    description: `${entry.connectionName} | ${entry.executionTime}ms | ${new Date(entry.executedAt).toLocaleString()}`,
                    detail: entry.status === 'error' ? `Error: ${entry.errorMessage}` : `${entry.rowCount} rows`,
                    entry,
                })),
                { placeHolder: t('database.queryHistory') }
            );

            if (!picked) return;

            const action = await vscode.window.showQuickPick(
                [t('database.openInEditor'), t('database.copySql')],
                { placeHolder: t('database.action') }
            );

            if (action === t('database.openInEditor')) {
                const doc = await vscode.workspace.openTextDocument({
                    content: picked.entry.sql,
                    language: 'sql',
                });
                await vscode.window.showTextDocument(doc);
            } else if (action === t('database.copySql')) {
                await vscode.env.clipboard.writeText(picked.entry.sql);
                vscode.window.showInformationMessage(t('database.sqlCopied'));
            }
        })
    );

    disposables.push(
        vscode.commands.registerCommand('hive-formatter.clearQueryHistory', async () => {
            const confirm = await vscode.window.showWarningMessage(
                t('database.clearHistoryConfirm'),
                { modal: true },
                t('database.clear')
            );
            if (confirm === t('database.clear')) {
                if (queryHistory) {
                    await queryHistory.clear();
                }
                vscode.window.showInformationMessage(t('database.queryHistoryCleared'));
            }
        })
    );

    return { disposables, getQueryResultPanel };
}
