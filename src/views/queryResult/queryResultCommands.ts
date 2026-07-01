import * as vscode from 'vscode';
import { QueryResultPanel } from './QueryResultPanel';
import { QueryResultController } from '../../application/QueryResultController';
import { getContainer, Tokens } from '../../core/diContainer';
import type {
    IConnectionService,
    IQueryService,
    IDataEditService,
} from '../../application/ports';
import type { QueryResult, QueryError } from '../../database/adapters/IDatabaseAdapter';
import { t } from '../../i18n';

/**
 * Lazily create the QueryResultPanel if it does not exist yet and ensure a
 * QueryResultController is attached. Returns the panel instance (or undefined
 * if the extension context / extensionUri is not available).
 *
 * The panel resolves its own port dependencies (IConnectionService,
 * IDataTransferService) from the DI container when the caller does not inject
 * them explicitly, so we only need to pass the extensionUri + context.
 */
function ensurePanel(context: vscode.ExtensionContext): QueryResultPanel | undefined {
    const existing = QueryResultPanel.getCurrentInstance();
    if (existing) {
        return existing;
    }
    return QueryResultPanel.createOrShow(context.extensionUri, context);
}

/**
 * Ensure a QueryResultController is attached to the panel with the given
 * (connectionId, database) pin. If a controller is already attached we
 * re-create it so the new pin takes effect — the panel's callbacks are
 * simple property assignments, so overwriting is safe.
 *
 * The controller instance is not retained after attach(): once the panel's
 * callback fields are populated the controller has no further runtime state
 * to observe, so there is no need to keep a module-level reference.
 */
function ensureController(
    panel: QueryResultPanel,
    connectionId?: string,
    database?: string,
): void {
    const container = getContainer();
    const connectionService = container.get<IConnectionService>(Tokens.ConnectionService);
    const queryService = container.get<IQueryService>(Tokens.QueryService);
    const dataEditService = container.get<IDataEditService>(Tokens.DataEditService);

    const controller = new QueryResultController(
        connectionService,
        queryService,
        dataEditService,
        connectionId,
        database,
    );
    controller.attach(panel);
}

/**
 * Register the views-layer command handlers that the database layer delegates
 * to via `vscode.commands.executeCommand(...)`. Each handler owns the
 * QueryResultPanel lifecycle (creating it on demand) and the
 * QueryResultController binding.
 *
 * These handlers MUST be registered after the database-layer query commands
 * so that `hive-formatter.executeQuery` can fire `hive-formatter.showQueryLoading`
 * and find a registered handler.
 */
export function registerQueryResultCommands(context: vscode.ExtensionContext): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = [];

    disposables.push(
        vscode.commands.registerCommand(
            'hive-formatter.showQueryLoading',
            (sql: string) => {
                const panel = ensurePanel(context);
                if (!panel) return;
                panel.showLoading(sql);
            },
        ),
    );

    disposables.push(
        vscode.commands.registerCommand(
            'hive-formatter.showQueryResult',
            (
                result: QueryResult,
                connectionName?: string,
                connectionColor?: string,
                tableName?: string,
            ) => {
                const panel = ensurePanel(context);
                if (!panel) return;
                panel.showResult(result, connectionName, connectionColor, tableName);
            },
        ),
    );

    disposables.push(
        vscode.commands.registerCommand(
            'hive-formatter.showQueryError',
            (error: QueryError, _sql?: string) => {
                const panel = ensurePanel(context);
                if (!panel) return;
                panel.showError(error);
            },
        ),
    );

    disposables.push(
        vscode.commands.registerCommand(
            'hive-formatter.setQueryResultPanelSql',
            (sql: string, autoExecute?: boolean) => {
                const panel = ensurePanel(context);
                if (!panel) return;
                if (autoExecute) {
                    panel.setSqlAndExecute(sql);
                } else {
                    panel.setSql(sql);
                }
            },
        ),
    );

    disposables.push(
        vscode.commands.registerCommand(
            'hive-formatter.sendDatabaseList',
            (databases: string[], current: string) => {
                const panel = ensurePanel(context);
                if (!panel) return;
                panel.sendDatabaseList(databases, current);
            },
        ),
    );

    disposables.push(
        vscode.commands.registerCommand(
            'hive-formatter.setQueryResultPanelCallbacks',
            (connectionId?: string, database?: string) => {
                const panel = ensurePanel(context);
                if (!panel) return;
                ensureController(panel, connectionId, database);
            },
        ),
    );

    disposables.push(
        vscode.commands.registerCommand(
            'hive-formatter.exportQueryResult',
            async (format: string): Promise<boolean> => {
                const panel = QueryResultPanel.getCurrentInstance();
                if (!panel) {
                    return false;
                }
                const current = panel.getCurrentResult();
                if (!current) {
                    return false;
                }
                try {
                    panel.triggerExport(format);
                    return true;
                } catch (e) {
                    vscode.window.showErrorMessage(
                        t('database.exportFailed', e instanceof Error ? e.message : String(e)),
                    );
                    return false;
                }
            },
        ),
    );

    disposables.push(
        vscode.commands.registerCommand(
            'hive-formatter.getCurrentQueryResult',
            (): { columns: { name: string }[]; rows: Record<string, unknown>[] } | undefined => {
                const panel = QueryResultPanel.getCurrentInstance();
                if (!panel) return undefined;
                const result = panel.getCurrentResult();
                if (!result) return undefined;
                return {
                    columns: result.columns.map((c) => ({ name: c.name, type: c.type })),
                    rows: result.rows,
                };
            },
        ),
    );

    return disposables;
}
