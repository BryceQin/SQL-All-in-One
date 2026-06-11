import * as vscode from 'vscode';
import { EventEmitter } from 'vscode';
import { IDatabaseAdapter, QueryResult } from '../adapters/IDatabaseAdapter';
import { getConnectionManager } from '../connection/ConnectionManager';
import { QueryOptions, QueryStartEvent, QueryEndEvent, RunningQuery } from './QueryResult';
import { getConfigManager } from '../../core/configManager';
import { t } from '../../i18n/index';

export class QueryExecutor {
    private runningQueries = new Map<string, RunningQuery>();
    private readonly _onDidStartQuery = new EventEmitter<QueryStartEvent>();
    private readonly _onDidEndQuery = new EventEmitter<QueryEndEvent>();

    readonly onDidStartQuery = this._onDidStartQuery.event;
    readonly onDidEndQuery = this._onDidEndQuery.event;

    async execute(
        adapter: IDatabaseAdapter,
        sql: string,
        options?: Partial<QueryOptions>,
        connectionId?: string
    ): Promise<QueryResult> {
        const queryId = this.generateQueryId();
        const cts = new vscode.CancellationTokenSource();
        const startTime = Date.now();

        const mergedOptions: QueryOptions = {
            maxRows: options?.maxRows ?? this.getConfigMaxRows(),
            timeout: options?.timeout ?? this.getConfigTimeout(),
            params: options?.params,
            database: options?.database,
        };

        const runningQuery: RunningQuery = {
            queryId,
            sql,
            connectionId: connectionId || '',
            database: mergedOptions.database,
            startTime,
            cancellationTokenSource: cts,
        };

        this.runningQueries.set(queryId, runningQuery);

        this._onDidStartQuery.fire({
            queryId,
            sql,
            connectionId: connectionId || '',
            database: mergedOptions.database,
        });

        try {
            const result = await this.raceExecution(
                adapter,
                sql,
                mergedOptions,
                cts.token,
                queryId
            );

            const executionTime = Date.now() - startTime;

            if (result.rowCount > mergedOptions.maxRows) {
                result.rows = result.rows.slice(0, mergedOptions.maxRows);
            }

            result.executionTime = executionTime;

            this._onDidEndQuery.fire({ queryId, result });
            return result;
        } catch (error: unknown) {
            const executionTime = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : String(error);

            const result: QueryResult = {
                queryId,
                status: 'error',
                columns: [],
                rows: [],
                rowCount: 0,
                executionTime,
                error: {
                    code: 'EXEC_ERROR',
                    message: errorMessage,
                    sql,
                },
                database: mergedOptions.database,
            };

            this._onDidEndQuery.fire({ queryId, result });
            return result;
        } finally {
            this.runningQueries.delete(queryId);
            cts.dispose();
        }
    }

    async cancel(queryId: string): Promise<void> {
        const runningQuery = this.runningQueries.get(queryId);
        if (!runningQuery) {
            return;
        }

        runningQuery.cancellationTokenSource.cancel();

        const connectionManager = getConnectionManager();
        const adapter = connectionManager.getAdapter(runningQuery.connectionId);

        if (adapter) {
            const capabilities = adapter.getDialectCapabilities();
            if (capabilities.supportsCancel) {
                const maxRetries = this.getConfigCancelRetries();
                const retryDelay = this.getConfigCancelRetryDelay();

                for (let attempt = 0; attempt < maxRetries; attempt++) {
                    try {
                        await adapter.cancelQuery(queryId);
                        return;
                    } catch {
                        if (attempt < maxRetries - 1) {
                            await this.delay(retryDelay);
                        }
                    }
                }

                vscode.window.showWarningMessage(
                    t('database.queryMayStillBeRunning')
                );
            }
        }
    }

    getRunningQueries(): RunningQuery[] {
        return Array.from(this.runningQueries.values());
    }

    isRunning(queryId: string): boolean {
        return this.runningQueries.has(queryId);
    }

    private async raceExecution(
        adapter: IDatabaseAdapter,
        sql: string,
        options: QueryOptions,
        token: vscode.CancellationToken,
        queryId: string
    ): Promise<QueryResult> {
        return new Promise<QueryResult>((resolve, reject) => {
            let timer: ReturnType<typeof setTimeout> | undefined;
            let cancellationDisposable: vscode.Disposable | undefined;

            const cleanup = (): void => {
                if (timer !== undefined) {
                    clearTimeout(timer);
                    timer = undefined;
                }
                if (cancellationDisposable) {
                    cancellationDisposable.dispose();
                    cancellationDisposable = undefined;
                }
            };

            const attemptCancel = async (): Promise<void> => {
                try {
                    const capabilities = adapter.getDialectCapabilities();
                    if (capabilities.supportsCancel) {
                        await adapter.cancelQuery(queryId);
                    }
                } catch {
                    // best effort
                }
            };

            timer = setTimeout(() => {
                cleanup();
                attemptCancel();
                reject(new Error(t('database.queryTimedOut', String(options.timeout))));
            }, options.timeout);

            cancellationDisposable = token.onCancellationRequested(() => {
                cleanup();
                attemptCancel();
                reject(new Error(t('database.queryWasCancelled')));
            });

            adapter.execute(sql, options.params)
                .then((result) => { cleanup(); resolve(result); })
                .catch((error: unknown) => { cleanup(); reject(error); });
        });
    }

    private generateQueryId(): string {
        return `q-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    }

    private getConfigMaxRows(): number {
        return getConfigManager().get<number>('query.maxRows', 1000);
    }

    private getConfigTimeout(): number {
        return getConfigManager().get<number>('query.timeout', 30000);
    }

    private getConfigCancelRetries(): number {
        return getConfigManager().get<number>('execution.cancelRetries', 3);
    }

    private getConfigCancelRetryDelay(): number {
        return getConfigManager().get<number>('execution.cancelRetryDelay', 500);
    }

    private delay(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    dispose(): void {
        for (const query of this.runningQueries.values()) {
            query.cancellationTokenSource.cancel();
            query.cancellationTokenSource.dispose();
        }
        this.runningQueries.clear();
        this._onDidStartQuery.dispose();
        this._onDidEndQuery.dispose();
    }
}
