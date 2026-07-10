import * as vscode from "vscode";
import { EventEmitter } from "vscode";
import { IQueryAdapter, QueryResult, QueryStreamOptions } from "../adapters/IDatabaseAdapter";
import { DatabaseAdapter } from "../adapters/AdapterFactory";
import { getConnectionManager } from "../connection/ConnectionManager";
import { QueryOptions, QueryStartEvent, QueryEndEvent, RunningQuery } from "./QueryResult";
import { getConfigManager } from "../../core/configManager";
import { handleError, ErrorCategory } from "../../core/errorHandler";
import { t } from "../../i18n/index";
import { generateShortId } from "../../utils/idGenerator";
import { collectStreamToResult } from "./streamCollector";

/**
 * Adapter surface required by {@link QueryExecutor.execute} /
 * {@link QueryExecutor.raceExecution}.
 *
 * After the P0-2 adapter consolidation, the query / schema surfaces live on
 * the {@link DatabaseAdapter.queryAdapter} and {@link DatabaseAdapter.schemaAdapter}
 * fields rather than as forwarding methods on the adapter itself. The executor
 * reaches query execution via `adapter.queryAdapter.execute(...)` and the
 * dialect-capabilities probe via `adapter.schemaAdapter.getDialectCapabilities()`.
 */
type QueryExecutorAdapter = DatabaseAdapter;

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
        this.cachedMaxRows = cfg.get<number>("query.maxRows", 1000);
        this.cachedTimeout = cfg.get<number>("query.timeout", 30000);
        this.cachedCancelRetries = cfg.get<number>("execution.cancelRetries", 3);
        this.cachedCancelRetryDelay = cfg.get<number>("execution.cancelRetryDelay", 500);
    }

    async execute(
        adapter: QueryExecutorAdapter,
        sql: string,
        options?: Partial<QueryOptions>,
        connectionId?: string,
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
            connectionId: connectionId || "",
            database: mergedOptions.database,
            startTime,
            cancellationTokenSource: cts,
        };

        this.runningQueries.set(queryId, runningQuery);

        this._onDidStartQuery.fire({
            queryId,
            sql,
            connectionId: connectionId || "",
            database: mergedOptions.database,
        });

        try {
            const result = await this.raceExecution(adapter, sql, mergedOptions, cts.token, queryId);

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
                status: "error",
                columns: [],
                rows: [],
                rowCount: 0,
                executionTime,
                error: {
                    code: "EXEC_ERROR",
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
            const capabilities = adapter.schemaAdapter.getDialectCapabilities();
            if (capabilities.supportsCancel) {
                const cancelled = await this.cancelWithRetry(adapter, queryId, "cancelQueryAttempt");
                if (!cancelled) {
                    vscode.window.showWarningMessage(t("database.queryMayStillBeRunning"));
                }
            }
        }
    }

    /**
     * Shared retry-with-exponential-backoff loop for `adapter.queryAdapter.cancelQuery`.
     * Returns true if the cancel succeeded within the retry budget, false otherwise.
     *
     * Extracted from the previously duplicated inline loops in {@link cancel}
     * and {@link raceExecution}'s timeout path.
     *
     * If `shouldAbort` returns true (e.g. the query already settled), the
     * loop exits early without further retry attempts.
     */
    private async cancelWithRetry(
        adapter: { queryAdapter: { cancelQuery: (queryId: string) => Promise<void> } },
        queryId: string,
        errorContext: string,
        shouldAbort?: () => boolean,
    ): Promise<boolean> {
        const maxRetries = this.getConfigCancelRetries();
        const retryDelay = this.getConfigCancelRetryDelay();
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            if (shouldAbort?.()) return false;
            try {
                await adapter.queryAdapter.cancelQuery(queryId);
                return true;
            } catch (e) {
                handleError(e, `QueryExecutor.${errorContext}.attempt.${attempt}`, ErrorCategory.SUB_ITEM);
                if (attempt < maxRetries - 1) {
                    await this.delay(retryDelay * Math.pow(2, attempt));
                }
            }
        }
        return false;
    }

    getRunningQueries(): RunningQuery[] {
        return Array.from(this.runningQueries.values());
    }

    isRunning(queryId: string): boolean {
        return this.runningQueries.has(queryId);
    }

    private async raceExecution(
        adapter: QueryExecutorAdapter,
        sql: string,
        options: QueryOptions,
        token: vscode.CancellationToken,
        queryId: string,
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
                    const capabilities = adapter.schemaAdapter.getDialectCapabilities();
                    if (capabilities.supportsCancel) {
                        // 在实际发起取消前再次检查，避免在调度期间 Promise 已 resolve
                        if (settled) {
                            return;
                        }
                        // 复用 cancelWithRetry，与 cancel 方法保持一致的重试策略
                        await this.cancelWithRetry(adapter, queryId, "timeoutCancel", () => settled);
                    }
                } catch (e) {
                    // best effort: log but do not propagate cancel failure
                    handleError(e, "QueryExecutor.timeoutCancel", ErrorCategory.SUB_ITEM);
                }
            };

            timer = setTimeout(() => {
                if (!settled) {
                    // 异步发起取消，不阻塞 settleReject，避免用户长时间等待
                    void attemptCancel();
                }
                settleReject(new Error(t("database.queryTimedOut", String(options.timeout))));
            }, options.timeout);

            cancellationDisposable = token.onCancellationRequested(() => {
                if (!settled) {
                    void attemptCancel();
                }
                settleReject(new Error(t("database.queryWasCancelled")));
            });

            // Prefer the streaming path when the adapter implements
            // executeStream and the statement looks read-only. Falling back to
            // the synchronous execute() path keeps behavior unchanged for
            // adapters without streaming (SQLite, StarRocks, …) and for
            // statements that are not safe to stream (DDL/DML).
            const useStream = shouldUseStream(adapter.queryAdapter, sql);
            const startTime = Date.now();

            const runStream = async (): Promise<QueryResult> => {
                const ac = new AbortController();
                // Bridge the VS Code cancellation token to the stream's
                // AbortSignal so that timeout / user-cancel both abort the
                // in-flight stream.
                const streamCancelDisposable = token.onCancellationRequested(() => ac.abort());
                const streamOptions: QueryStreamOptions = {
                    batchSize: 1000,
                    maxRows: options.maxRows,
                    params: options.params,
                    signal: ac.signal,
                };
                try {
                    const stream = adapter.queryAdapter.executeStream!(sql, streamOptions);
                    return await collectStreamToResult({
                        stream,
                        queryId,
                        maxRows: options.maxRows,
                        executionTime: Date.now() - startTime,
                        database: options.database,
                        sql,
                    });
                } finally {
                    streamCancelDisposable.dispose();
                }
            };

            if (useStream) {
                runStream()
                    .then(async (result) => {
                        // Fallback: if the streaming path produced an error
                        // (either the adapter threw and collectStreamToResult
                        // converted it to an error QueryResult, or the stream
                        // surfaced a STREAM_ERROR), retry via the one-shot
                        // execute() path. This guards against transient
                        // cursor/DECLARE failures and dialect quirks where
                        // streaming is not supported for a particular shape.
                        // SELECT statements are idempotent so re-execution is
                        // safe; the streaming path is only chosen for
                        // read-only row-returning statements (see
                        // shouldUseStream).
                        if (result.status === "error" && !settled) {
                            try {
                                const fallback = await adapter.queryAdapter.execute(sql, options.params);
                                if (!settled) {
                                    settleResolve(fallback);
                                    return;
                                }
                            } catch {
                                // Fall through and report the original
                                // streaming error result below.
                            }
                        }
                        settleResolve(result);
                    })
                    .catch(async (streamError: unknown) => {
                        // Fallback when the streaming path throws before
                        // collectStreamToResult could convert it to an error
                        // QueryResult (e.g. adapter.executeStream itself threw
                        // synchronously).
                        if (settled) {
                            return;
                        }
                        try {
                            const fallback = await adapter.queryAdapter.execute(sql, options.params);
                            if (!settled) {
                                settleResolve(fallback);
                            }
                        } catch (execError: unknown) {
                            if (!settled) {
                                settleReject(streamError ?? execError);
                            }
                        }
                    });
            } else {
                adapter.queryAdapter
                    .execute(sql, options.params)
                    .then((result) => settleResolve(result))
                    .catch((error: unknown) => settleReject(error));
            }
        });
    }

    private generateQueryId(): string {
        return generateShortId("q");
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

/**
 * Decide whether to route a query through the adapter's streaming path.
 *
 * Streaming is only used when:
 *  1. The adapter implements {@link IDatabaseAdapter.executeStream}, and
 *  2. The SQL is a read-only statement that returns a row set (SELECT,
 *     WITH/CTE, TABLE, VALUES, SHOW, EXPLAIN). DDL/DML statements are not
 *     safe to stream because cursors are stateful and the streaming contract
 *     assumes a result set.
 *
 * This keeps the streaming path opt-in and conservative: any statement the
 * streaming path cannot handle transparently falls back to the one-shot
 * {@link IDatabaseAdapter.execute} path.
 */
function shouldUseStream(adapter: Pick<IQueryAdapter, "executeStream">, sql: string): boolean {
    if (typeof adapter.executeStream !== "function") {
        return false;
    }
    return isReadOnlyRowReturningStatement(sql);
}

/**
 * Lightweight lexical check for read-only, row-returning statements that are
 * safe to drive through a server-side cursor. We intentionally err on the
 * side of "no" — anything ambiguous falls back to the non-streaming path.
 */
function isReadOnlyRowReturningStatement(sql: string): boolean {
    const trimmed = sql.trim();
    // Strip leading SQL comments / block comments conservatively.
    const withoutComments = trimmed.replace(/\/\*[\s\S]*?\*\//g, "").trim();
    const keywordMatch = withoutComments.match(/^([A-Za-z_]+)/);
    if (!keywordMatch) {
        return false;
    }
    const first = keywordMatch[1].toUpperCase();
    return first === "SELECT" || first === "WITH" || first === "TABLE" || first === "VALUES" || first === "SHOW" || first === "EXPLAIN";
}
