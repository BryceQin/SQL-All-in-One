import * as vscode from 'vscode';
import { EventEmitter } from 'vscode';
import { IDatabaseAdapter, QueryResult } from '../adapters/IDatabaseAdapter';
import { getConnectionManager } from '../connection/ConnectionManager';
import { QueryOptions, QueryStartEvent, QueryEndEvent, RunningQuery } from './QueryResult';
import { getConfigManager } from '../../core/configManager';
import { t } from '../../i18n/index';
import { generateShortId } from '../../utils/idGenerator';

export class QueryExecutor {
    private runningQueries = new Map<string, RunningQuery>();
    private readonly _onDidStartQuery = new EventEmitter<QueryStartEvent>();
    private readonly _onDidEndQuery = new EventEmitter<QueryEndEvent>();
    private cachedMaxRows = 1000;
    private cachedTimeout = 30000;
    private cachedCancelRetries = 3;
    private cachedCancelRetryDelay = 500;
    private configDisposable: vscode.Disposable | undefined;

    readonly onDidStartQuery = this._onDidStartQuery.event;
    readonly onDidEndQuery = this._onDidEndQuery.event;

    constructor() {
        this.refreshConfigCache();
        this.configDisposable = getConfigManager().onConfigChange(() => {
            this.refreshConfigCache();
        });
    }

    private refreshConfigCache(): void {
        const cfg = getConfigManager();
        this.cachedMaxRows = cfg.get<number>('query.maxRows', 1000);
        this.cachedTimeout = cfg.get<number>('query.timeout', 30000);
        this.cachedCancelRetries = cfg.get<number>('execution.cancelRetries', 3);
        this.cachedCancelRetryDelay = cfg.get<number>('execution.cancelRetryDelay', 500);
    }

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
                    } catch (e) {
                        console.debug(`[SQL All in One] Cancel query attempt ${attempt + 1} failed:`, e)
                        if (attempt < maxRetries - 1) {
                            const backoffDelay = retryDelay * Math.pow(2, attempt);
                            await this.delay(backoffDelay);
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
            let settled = false;

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

            const settleResolve = (result: QueryResult): void => {
                if (settled) {
                    return;
                }
                settled = true;
                cleanup();
                resolve(result);
            };

            const settleReject = (error: unknown): void => {
                if (settled) {
                    return;
                }
                settled = true;
                cleanup();
                reject(error);
            };

            const attemptCancel = async (): Promise<void> => {
                if (settled) {
                    return;
                }
                try {
                    const capabilities = adapter.getDialectCapabilities();
                    if (capabilities.supportsCancel) {
                        // 在实际发起取消前再次检查，避免在调度期间 Promise 已 resolve
                        if (settled) {
                            return;
                        }
                        await adapter.cancelQuery(queryId);
                    }
                } catch (e) {
                    // best effort: log but do not propagate cancel failure
                    console.debug('[SQL All in One] Timeout cancel attempt (best effort) failed:', e)
                }
            };

            timer = setTimeout(() => {
                if (!settled) {
                    void attemptCancel();
                }
                settleReject(new Error(t('database.queryTimedOut', String(options.timeout))));
            }, options.timeout);

            cancellationDisposable = token.onCancellationRequested(() => {
                if (!settled) {
                    void attemptCancel();
                }
                settleReject(new Error(t('database.queryWasCancelled')));
            });

            adapter.execute(sql, options.params)
                .then((result) => settleResolve(result))
                .catch((error: unknown) => settleReject(error));
        });
    }

    private generateQueryId(): string {
        return generateShortId('query');
    }

    private getConfigMaxRows(): number {
        return this.cachedMaxRows;
    }

    private getConfigTimeout(): number {
        return this.cachedTimeout;
    }

    private getConfigCancelRetries(): number {
        return this.cachedCancelRetries;
    }

    private getConfigCancelRetryDelay(): number {
        return this.cachedCancelRetryDelay;
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
        this.configDisposable?.dispose();
    }
}
