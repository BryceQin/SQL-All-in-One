import * as vscode from 'vscode';
import type { IConnectionService, IQueryService, IDataEditService, QueryExecutionResult } from './ports';
import type { FilterCondition, PendingChange, ForeignKeyOption } from '../shared/editTypes';
import { t } from '../i18n/index';
import { handleError, ErrorCategory } from '../core/errorHandler';

/**
 * Interface that the query result panel must satisfy.
 * The controller attaches callbacks to this interface.
 * This decouples the controller from the concrete QueryResultPanel class
 * that lives in the views layer.
 *
 * The methods describe the subset of the panel's surface that the
 * controller needs to drive (loading / result / error / database list),
 * plus the optional callbacks the controller wires up in {@link attach}.
 */
export interface IQueryResultPanel {
    // Callbacks the controller attaches. The panel invokes them in response
    // to webview messages.
    onExecuteQuery?: (sql: string) => void;
    onCancelQuery?: () => void;
    onRequestSort?: (column: string, direction: string) => void;
    onRequestFilter?: (conditions: FilterCondition[]) => void;
    onRequestPage?: (page: number) => void;
    onCommitChanges?: (changes: PendingChange[], tableName: string, database: string) => Promise<{ success: boolean; errors?: string[] }>;
    onRequestForeignKeyOptions?: (column: string, referencedTable: string, database: string) => Promise<ForeignKeyOption[]>;
    onBeginTransaction?: () => Promise<void>;
    onCommitTransaction?: () => Promise<void>;
    onRollbackTransaction?: () => Promise<void>;
    onCreateSavepoint?: (name: string) => Promise<void>;
    onRollbackToSavepoint?: (name: string) => Promise<void>;
    onExecutePanelSql?: (sql: string) => Promise<void>;
    onChangeDatabase?: (database: string) => Promise<void>;

    // Methods the controller calls on the panel.
    showLoading(sql: string): void;
    showResult(result: QueryExecutionResult, connectionName?: string, connectionColor?: string): void;
    showError(error: { code: string; message: string; sql?: string }): void;
    getCurrentResult(): { columns: { name: string }[]; rows: Record<string, unknown>[] } | undefined;
    sendDatabaseList(databases: string[], current: string): void;
    readonly isDisposed: boolean;
}

/**
 * Replaces `setupQueryResultPanelCallbacks` from
 * `database/commands/queryResultCallbacks.ts`.
 *
 * The controller is pure application layer: it depends only on the ports
 * defined in `./ports` and the shared edit types. It never imports a
 * database-layer singleton (no `getConnectionManager`, no `getActiveAdapter`,
 * no `dbModule.getQueryExecutor`) and never imports a views-layer component.
 *
 * Construct a controller per panel binding (optionally pinned to a specific
 * connectionId / database for table-data viewing), then call {@link attach}
 * to wire the panel's callbacks.
 */
export class QueryResultController {
    constructor(
        private readonly connectionService: IConnectionService,
        private readonly queryService: IQueryService,
        private readonly dataEditService: IDataEditService,
        private readonly connectionId?: string,
        private readonly database?: string,
    ) {}

    /**
     * Wires all panel callbacks. Mirrors the behavior of the former
     * `setupQueryResultPanelCallbacks` but routes every capability through
     * the injected port services instead of database-layer globals.
     */
    attach(panel: IQueryResultPanel): void {
        // The first five callbacks re-issue the central query command so that
        // sort/filter/page/execute share the same execution path as the
        // toolbar run button.
        //
        // TODO(P0): sort/filter/page parameters are currently dropped because
        // `hive-formatter.executeQuery` reads SQL from the active editor and
        // accepts no arguments. To actually implement these features, extend
        // IQueryService with `executeWithSort/executeWithFilter/executeWithPage`
        // and route the corresponding callbacks through those methods instead
        // of re-running the editor query.
        panel.onExecuteQuery = (_sql: string): void => {
            vscode.commands.executeCommand('hive-formatter.executeQuery');
        };

        panel.onCancelQuery = (): void => {
            vscode.commands.executeCommand('hive-formatter.cancelQuery');
        };

        panel.onRequestSort = (_column: string, _direction: string): void => {
            // See TODO above — sort params dropped until IQueryService extended.
            vscode.commands.executeCommand('hive-formatter.executeQuery');
        };

        panel.onRequestFilter = (_conditions: FilterCondition[]): void => {
            // See TODO above — filter conditions dropped until IQueryService extended.
            vscode.commands.executeCommand('hive-formatter.executeQuery');
        };

        panel.onRequestPage = (_page: number): void => {
            // See TODO above — page number dropped until IQueryService extended.
            vscode.commands.executeCommand('hive-formatter.executeQuery');
        };

        panel.onCommitChanges = async (
            changes: PendingChange[],
            tableName: string,
            database: string,
        ): Promise<{ success: boolean; errors?: string[] }> => {
            try {
                const currentResult = panel.getCurrentResult();
                if (!currentResult) {
                    return { success: false, errors: [t('database.noQueryResult')] };
                }
                return await this.dataEditService.commitChanges(
                    changes,
                    tableName,
                    database,
                    currentResult.columns,
                    currentResult.rows,
                );
            } catch (error) {
                return { success: false, errors: [(error as Error).message] };
            }
        };

        panel.onRequestForeignKeyOptions = async (
            column: string,
            referencedTable: string,
            db: string,
        ): Promise<ForeignKeyOption[]> => {
            try {
                return await this.dataEditService.requestForeignKeyOptions(column, referencedTable, db);
            } catch (e) {
                // Surface via ErrorHandler instead of silently console.debug —
                // silent failures make FK option retrieval impossible to debug.
                handleError(e, 'QueryResultController.onRequestForeignKeyOptions', ErrorCategory.FEATURE);
                return [];
            }
        };

        panel.onBeginTransaction = async (): Promise<void> => {
            await this.dataEditService.beginTransaction();
        };

        panel.onCommitTransaction = async (): Promise<void> => {
            await this.dataEditService.commit();
        };

        panel.onRollbackTransaction = async (): Promise<void> => {
            await this.dataEditService.rollback();
        };

        panel.onCreateSavepoint = async (name: string): Promise<void> => {
            await this.dataEditService.createSavepoint(name);
        };

        panel.onRollbackToSavepoint = async (name: string): Promise<void> => {
            await this.dataEditService.rollbackToSavepoint(name);
        };

        panel.onExecutePanelSql = async (sql: string): Promise<void> => {
            try {
                if (panel.isDisposed) return;

                // Resolve the adapter to execute against. When the controller
                // is pinned to a connectionId we use it; otherwise fall back
                // to the active connection.
                const adapterId = this.connectionId ?? this.connectionService.getActiveConnection()?.id;
                if (!adapterId) {
                    panel.showError({ code: 'NO_CONNECTION', message: t('database.noActiveAdapter'), sql });
                    return;
                }

                panel.showLoading(sql);
                const result = await this.queryService.execute(adapterId, sql, {
                    database: this.database,
                });

                if (panel.isDisposed) return;

                if (result.status === 'error') {
                    panel.showError(
                        result.error ?? { code: 'EXEC_ERROR', message: t('database.unknownError'), sql },
                    );
                } else {
                    const conn = this.connectionId
                        ? this.connectionService.getConnection(this.connectionId)
                        : this.connectionService.getActiveConnection();
                    panel.showResult(result, conn?.name, conn?.color);
                }
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                if (panel.isDisposed) return;
                panel.showError({ code: 'EXEC_ERROR', message: msg, sql });
            }
        };

        panel.onChangeDatabase = async (changedDb: string): Promise<void> => {
            try {
                const connId = this.connectionId ?? this.connectionService.getActiveConnection()?.id;
                if (!connId) return;

                const cfg = this.connectionService.getConnection(connId);
                if (cfg) {
                    await this.connectionService.updateConnection(connId, {
                        ...cfg,
                        database: changedDb || cfg.database || '',
                    });
                }
                if (changedDb) {
                    const adapter = this.connectionService.getAdapter(connId);
                    if (adapter) {
                        const dbs = await this.queryService.listDatabases();
                        panel.sendDatabaseList(
                            dbs.map((d) => d.name),
                            changedDb,
                        );
                    }
                }
            } catch (e) {
                // Database change is best-effort, but still surface the error
                // for observability (previously silently console.debug'd).
                handleError(e, 'QueryResultController.onChangeDatabase', ErrorCategory.FEATURE);
            }
        };
    }
}
