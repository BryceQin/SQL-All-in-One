import * as vscode from 'vscode';
import { getConnectionManager } from '../connection/ConnectionManager';
import { QueryExecutor } from '../query/QueryExecutor';
import { SafeQueryGuard } from '../query/SafeQueryGuard';
import { QueryHistory } from '../history/QueryHistory';
import { SqlStatementDetector } from '../query/SqlStatementDetector';
import type { SqlDialect } from '../../parser/dialectMapper';
import { QueryResultPanel, FilterCondition } from '../../views/queryResult/QueryResultPanel';
import type { QueryError, QueryRow } from '../adapters/IDatabaseAdapter';
import { getSchemaCache } from '../schema/SchemaCache';
import { getConfigManager } from '../../core/configManager';
import { generateEditSql, executeInTransaction, getActiveAdapter } from '../query/DataEditService';


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
    queryExecutor: QueryExecutor,
    safeQueryGuard: SafeQueryGuard,
    queryHistory: QueryHistory,
    statementDetector: SqlStatementDetector,
    outputChannel: vscode.OutputChannel
): { disposables: vscode.Disposable[]; getQueryResultPanel: () => QueryResultPanel | undefined } {
    const disposables: vscode.Disposable[] = [];
    let queryResultPanel: QueryResultPanel | undefined;

    const getQueryResultPanel = (): QueryResultPanel | undefined => queryResultPanel;

    disposables.push(
        vscode.commands.registerCommand('sql-all-in-one.executeQuery', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('No active editor');
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
                    vscode.window.showWarningMessage('No active connection. Please connect to a database first.');
                    return;
                }
                const picked = await vscode.window.showQuickPick(
                    connections.map((c) => ({
                        label: c.name,
                        description: `${c.host}:${c.port}`,
                        connectionId: c.id,
                    })),
                    { placeHolder: 'Select a connection' }
                );
                if (!picked) return;
                connectionManager.setActiveConnection(picked.connectionId);
                adapter = connectionManager.getAdapter(picked.connectionId);
            }

            if (!adapter) {
                vscode.window.showErrorMessage('Failed to get database adapter');
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

            const safetyResult = await safeQueryGuard.analyze(statement.sql, undefined, activeConn?.dialect as SqlDialect | undefined);
            if (!safetyResult.safe) {
                const confirmed = await safeQueryGuard.confirm(safetyResult);
                if (!confirmed) return;
            }

            if (!queryResultPanel) {
                queryResultPanel = QueryResultPanel.createOrShow(
                    context.extensionUri,
                    context
                );
                queryResultPanel.onExecuteQuery = (_sql: string): void => {
                    vscode.commands.executeCommand('sql-all-in-one.executeQuery');
                };
                queryResultPanel.onCancelQuery = (): void => {
                    vscode.commands.executeCommand('sql-all-in-one.cancelQuery');
                };
                queryResultPanel.onRequestSort = (_column: string, _direction: string): void => {
                    vscode.commands.executeCommand('sql-all-in-one.executeQuery');
                };
                queryResultPanel.onRequestFilter = (_conditions: FilterCondition[]): void => {
                    vscode.commands.executeCommand('sql-all-in-one.executeQuery');
                };
                queryResultPanel.onRequestPage = (_page: number): void => {
                    vscode.commands.executeCommand('sql-all-in-one.executeQuery');
                };
            } else {
                queryResultPanel.showLoading(statement.sql);
            }

            queryResultPanel.onCommitChanges = async (changes, tableName, _database): Promise<{ success: boolean; errors?: string[] }> => {
                try {
                    const adapter = getActiveAdapter();
                    if (!adapter) {
                        return { success: false, errors: ['No active database connection'] };
                    }

                    const currentResult = queryResultPanel?.getCurrentResult();
                    if (!currentResult) {
                        return { success: false, errors: ['No current result data'] };
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
                        throw new Error(`Invalid savepoint name: ${name}`);
                    }
                    await adapter.execute(`SAVEPOINT ${name}`);
                }
            };

            queryResultPanel.onRollbackToSavepoint = async (name: string): Promise<void> => {
                const adapter = getActiveAdapter();
                if (adapter) {
                    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
                        throw new Error(`Invalid savepoint name: ${name}`);
                    }
                    await adapter.execute(`ROLLBACK TO SAVEPOINT ${name}`);
                }
            };

            const activeConfig = connectionManager.getActiveConnection();
            const result = await queryExecutor.execute(
                adapter,
                statement.sql,
                { database: activeConfig?.database },
                activeConfig?.id
            );

            outputChannel.show(true);
            outputChannel.clear();

            if (result.status === 'error') {
                outputChannel.appendLine(`❌ Error: ${result.error?.message || 'Unknown error'}`);
                outputChannel.appendLine(`   SQL: ${statement.sql}`);
                queryResultPanel.showError(result.error as QueryError);
            } else {
                outputChannel.appendLine(`✅ Query executed successfully (${result.executionTime}ms, ${result.rowCount} rows)`);
                outputChannel.appendLine(`   SQL: ${statement.sql}`);
                outputChannel.appendLine('');

                if (result.columns.length > 0) {
                    const header = result.columns.map((c) => c.name).join('\t');
                    outputChannel.appendLine(header);
                    const separator = result.columns.map(() => '---').join('\t');
                    outputChannel.appendLine(separator);

                    for (const row of result.rows) {
                        const line = result.columns
                            .map((c) => String(row[c.name] ?? 'NULL'))
                            .join('\t');
                        outputChannel.appendLine(line);
                    }

                    if (result.affectedRows !== undefined && result.affectedRows > 0) {
                        outputChannel.appendLine(`\nAffected rows: ${result.affectedRows}`);
                    }
                }

                queryResultPanel.showResult(result, activeConfig?.name, activeConfig?.color);
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
        vscode.commands.registerCommand('sql-all-in-one.executeSelection', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('No active editor');
                return;
            }

            if (editor.selection.isEmpty) {
                vscode.window.showWarningMessage('No text selected');
                return;
            }

            vscode.commands.executeCommand('sql-all-in-one.executeQuery');
        })
    );

    disposables.push(
        vscode.commands.registerCommand('sql-all-in-one.cancelQuery', async () => {
            const running = queryExecutor.getRunningQueries();
            if (running.length === 0) {
                vscode.window.showInformationMessage('No running queries');
                return;
            }

            if (running.length === 1) {
                await queryExecutor.cancel(running[0].queryId);
                vscode.window.showInformationMessage('Query cancelled');
                return;
            }

            const picked = await vscode.window.showQuickPick(
                running.map((q) => ({
                    label: q.sql.substring(0, 80),
                    description: `Running for ${Date.now() - q.startTime}ms`,
                    queryId: q.queryId,
                })),
                { placeHolder: 'Select query to cancel' }
            );

            if (!picked) return;
            await queryExecutor.cancel(picked.queryId);
            vscode.window.showInformationMessage('Query cancelled');
        })
    );

    disposables.push(
        vscode.commands.registerCommand('sql-all-in-one.showQueryHistory', async () => {
            const entries = queryHistory.getRecent(50);
            if (entries.length === 0) {
                vscode.window.showInformationMessage('No query history');
                return;
            }

            const picked = await vscode.window.showQuickPick(
                entries.map((entry) => ({
                    label: entry.sql.substring(0, 80),
                    description: `${entry.connectionName} | ${entry.executionTime}ms | ${new Date(entry.executedAt).toLocaleString()}`,
                    detail: entry.status === 'error' ? `Error: ${entry.errorMessage}` : `${entry.rowCount} rows`,
                    entry,
                })),
                { placeHolder: 'Query History' }
            );

            if (!picked) return;

            const action = await vscode.window.showQuickPick(
                ['Open in Editor', 'Copy SQL'],
                { placeHolder: 'Action' }
            );

            if (action === 'Open in Editor') {
                const doc = await vscode.workspace.openTextDocument({
                    content: picked.entry.sql,
                    language: 'sql',
                });
                await vscode.window.showTextDocument(doc);
            } else if (action === 'Copy SQL') {
                await vscode.env.clipboard.writeText(picked.entry.sql);
                vscode.window.showInformationMessage('SQL copied to clipboard');
            }
        })
    );

    disposables.push(
        vscode.commands.registerCommand('sql-all-in-one.clearQueryHistory', async () => {
            const confirm = await vscode.window.showWarningMessage(
                'Clear all query history?',
                { modal: true },
                'Clear'
            );
            if (confirm === 'Clear') {
                await queryHistory.clear();
                vscode.window.showInformationMessage('Query history cleared');
            }
        })
    );

    return { disposables, getQueryResultPanel };
}
