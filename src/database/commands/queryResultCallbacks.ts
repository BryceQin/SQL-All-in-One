import * as vscode from 'vscode';
import { getConnectionManager } from '../connection/ConnectionManager';
import { DatabaseModule } from '../DatabaseModule';
import { QueryResultPanel, FilterCondition, type PendingChange, type ForeignKeyOption } from '../../views/queryResult/QueryResultPanel';
import type { QueryError, QueryRow } from '../adapters/IDatabaseAdapter';
import { generateEditSql, executeInTransaction, getActiveAdapter } from '../query/DataEditService';
import { t } from '../../i18n/index';

export function setupQueryResultPanelCallbacks(
    panel: QueryResultPanel,
    dbModule: DatabaseModule,
    connectionId?: string,
    database?: string
): void {
    panel.onExecuteQuery = (_sql: string): void => {
        vscode.commands.executeCommand('hive-formatter.executeQuery');
    };

    panel.onCancelQuery = (): void => {
        vscode.commands.executeCommand('hive-formatter.cancelQuery');
    };

    panel.onRequestSort = (_column: string, _direction: string): void => {
        vscode.commands.executeCommand('hive-formatter.executeQuery');
    };

    panel.onRequestFilter = (_conditions: FilterCondition[]): void => {
        vscode.commands.executeCommand('hive-formatter.executeQuery');
    };

    panel.onRequestPage = (_page: number): void => {
        vscode.commands.executeCommand('hive-formatter.executeQuery');
    };

    panel.onCommitChanges = async (changes: PendingChange[], tableName: string, _database: string): Promise<{ success: boolean; errors?: string[] }> => {
        try {
            const adapter = getActiveAdapter();
            if (!adapter) {
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
                adapter.quoteIdentifier.bind(adapter)
            );

            return await executeInTransaction(adapter, statements);
        } catch (error) {
            return { success: false, errors: [(error as Error).message] };
        }
    };

    panel.onRequestForeignKeyOptions = async (_column: string, referencedTable: string, db: string): Promise<ForeignKeyOption[]> => {
        try {
            const adapter = getActiveAdapter();
            if (!adapter) return [];

            const activeConfig = getConnectionManager().getActiveConnection();
            const structure = await adapter.describeTable(db || activeConfig?.database || '', referencedTable);
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
        } catch (e) {
            console.debug('[SQL All in One] onRequestForeignKeyOptions failed:', e)
            return [];
        }
    };

    panel.onBeginTransaction = async (): Promise<void> => {
        const adapter = getActiveAdapter();
        if (adapter) await adapter.beginTransaction();
    };

    panel.onCommitTransaction = async (): Promise<void> => {
        const adapter = getActiveAdapter();
        if (adapter) await adapter.commit();
    };

    panel.onRollbackTransaction = async (): Promise<void> => {
        const adapter = getActiveAdapter();
        if (adapter) await adapter.rollback();
    };

    panel.onCreateSavepoint = async (name: string): Promise<void> => {
        const adapter = getActiveAdapter();
        if (adapter) {
            if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
                throw new Error(t('database.invalidSavepointName', name));
            }
            await adapter.execute(`SAVEPOINT ${name}`);
        }
    };

    panel.onRollbackToSavepoint = async (name: string): Promise<void> => {
        const adapter = getActiveAdapter();
        if (adapter) {
            if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
                throw new Error(t('database.invalidSavepointName', name));
            }
            await adapter.execute(`ROLLBACK TO SAVEPOINT ${name}`);
        }
    };

    panel.onExecutePanelSql = async (sql: string): Promise<void> => {
        try {
            const currentPanel = QueryResultPanel.getCurrentInstance();
            if (!currentPanel || currentPanel.isDisposed) return;

            const connectionManager = getConnectionManager();
            let panelConn;
            let panelAdapter;

            if (connectionId) {
                panelConn = connectionManager.getAllConnections().find(c => c.id === connectionId);
                panelAdapter = connectionManager.getAdapter(connectionId);
            } else {
                const activeConn = connectionManager.getActiveConnection();
                panelConn = activeConn;
                panelAdapter = activeConn
                    ? connectionManager.getAdapter(activeConn.id)
                    : undefined;
            }

            if (!panelAdapter) {
                currentPanel.showError({
                    code: 'NO_CONNECTION',
                    message: t('database.noActiveAdapter'),
                    sql,
                });
                return;
            }

            currentPanel.showLoading(sql);
            const queryExecutor = dbModule.getQueryExecutor();
            const outputChannel = dbModule.getOutputChannel();

            if (!queryExecutor) {
                currentPanel.showError({
                    code: 'NO_EXECUTOR',
                    message: t('database.noActiveAdapter'),
                    sql,
                });
                return;
            }

            const result = await queryExecutor.execute(
                panelAdapter,
                sql,
                { database: database ?? connectionManager.getActiveConnection()?.database },
                connectionId ?? connectionManager.getActiveConnection()?.id
            );

            if (currentPanel.isDisposed) return;

            if (!result || result.status === 'error') {
                outputChannel?.appendLine(`❌ Error: ${result?.error?.message || t('database.unknownError')}`);
                outputChannel?.appendLine(`   SQL: ${sql}`);
                currentPanel.showError((result?.error ?? { code: 'EXEC_ERROR', message: t('database.noActiveAdapter'), sql }) as QueryError);
            } else {
                outputChannel?.appendLine(`✅ ${t('database.queryExecutedSuccessfully', String(result.executionTime), String(result.rowCount))}`);
                outputChannel?.appendLine(`   SQL: ${sql}`);
                currentPanel.showResult(result, panelConn?.name, panelConn?.color);
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            const currentPanel = QueryResultPanel.getCurrentInstance();
            if (!currentPanel || currentPanel.isDisposed) return;
            currentPanel.showError({
                code: 'EXEC_ERROR',
                message: msg,
                sql,
            });
        }
    };

    panel.onChangeDatabase = async (changedDb: string): Promise<void> => {
        try {
            const connectionManager = getConnectionManager();

            if (connectionId) {
                const cfg = connectionManager.getAllConnections().find(c => c.id === connectionId);
                if (cfg) {
                    const updatedConfig = { ...cfg, database: changedDb || cfg.database };
                    await connectionManager.updateConnection(connectionId, updatedConfig);
                }
                if (changedDb) {
                    const dbAdapter = connectionManager.getAdapter(connectionId);
                    if (dbAdapter) {
                        const dbs = await dbAdapter.listDatabases();
                        panel?.sendDatabaseList(dbs.map(d => d.name), changedDb);
                    }
                }
            } else {
                const activeConn = connectionManager.getActiveConnection();
                if (!activeConn) return;

                const config = connectionManager.getAllConnections().find(c => c.id === activeConn.id);
                if (!config) return;

                const updatedConfig = { ...config, database: changedDb };
                await connectionManager.updateConnection(activeConn.id, updatedConfig);
                connectionManager.setActiveConnection(activeConn.id);
            }
        } catch (e) { /* ignore: database change is best-effort */ console.debug('[SQL All in One] onChangeDatabase failed:', e) }
    };
}
