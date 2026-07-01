import * as assert from 'assert';
import { QueryExecutor } from '../database/query/QueryExecutor';
import type { DatabaseAdapter } from '../database/adapters/AdapterFactory';
import type { QueryResult, QueryParam, SqlStatement, ConnectionConfig, DialectCapabilities } from '../database/adapters/IDatabaseAdapter';

function createMockAdapter(options: { supportsCancel?: boolean; neverResolve?: boolean } = {}): DatabaseAdapter & { cancelQueryCalled: boolean; cancelQueryCallCount: number } {
    const supportsCancel = options.supportsCancel ?? true;
    const neverResolve = options.neverResolve ?? true;
    let cancelQueryCalled = false;
    let cancelQueryCallCount = 0;

    const mock = {
        config: {} as ConnectionConfig,
        isConnected: () => true,
        getConnectionId: () => 'mock-conn',
        getPoolStatus: () => ({ totalConnections: 1, activeConnections: 0, idleConnections: 1, waitingRequests: 0, connectionLimit: 5, acquireTimeout: 60000 }),
        connect: async () => { /* mock no-op */ },
        disconnect: async () => { /* mock no-op */ },
        testConnection: async () => ({ success: true }),
        checkConnectionHealth: async () => true,
        queryAdapter: {
            execute: async (_sql: string, _params?: QueryParam[]): Promise<QueryResult> => {
                if (neverResolve) {
                    return new Promise<QueryResult>(() => { /* never resolves: simulates timeout */ });
                }
                return {
                    queryId: 'mock',
                    status: 'success',
                    columns: [],
                    rows: [],
                    rowCount: 0,
                    executionTime: 0,
                };
            },
            executeBatch: async (_statements: SqlStatement[]): Promise<QueryResult[]> => [],
            beginTransaction: async () => { /* mock no-op */ },
            commit: async () => { /* mock no-op */ },
            rollback: async () => { /* mock no-op */ },
            cancelQuery: async (_queryId: string): Promise<void> => {
                cancelQueryCalled = true;
                cancelQueryCallCount++;
            },
        },
        metadataAdapter: {
            listDatabases: async () => [],
            listSchemas: async () => [],
            listTables: async () => [],
            listViews: async () => [],
            listFunctions: async () => [],
            listProcedures: async () => [],
            listTriggers: async () => [],
        },
        schemaAdapter: {
            describeTable: async () => ({ columns: [], indexes: [], foreignKeys: [], triggers: [] }),
            getTableDDL: async () => '',
            getViewDDL: async () => '',
            getFunctionDDL: async () => '',
            getProcedureDDL: async () => '',
            getTriggerDDL: async () => '',
            getRoutineParameters: async () => [],
            getExplainPlan: async () => ({ format: 'json' as const, raw: '{}', nodes: [] }),
            getTableRowCount: async () => 0,
            getDialectCapabilities: (): DialectCapabilities => ({
                supportsSchema: true,
                supportsMultipleDatabases: false,
                maxConcurrentQueries: 5,
                supportsPreparedStatement: true,
                supportsExplain: true,
                supportsExplainAnalyze: false,
                supportsCancel,
                supportsSshTunnel: false,
                supportedObjectTypes: ['table'],
            }),
            getSupportedDataTypes: () => [],
            quoteIdentifier: (id: string) => id,
        },
        get cancelQueryCalled() { return cancelQueryCalled; },
        get cancelQueryCallCount() { return cancelQueryCallCount; },
    } as unknown as DatabaseAdapter & { cancelQueryCalled: boolean; cancelQueryCallCount: number };

    return mock;
}

suite('Query Cancel Test Suite', () => {
    let executor: QueryExecutor;

    setup(() => {
        executor = new QueryExecutor();
    });

    teardown(() => {
        executor.dispose();
    });

    test('should call adapter.cancelQuery on timeout when supportsCancel is true', async () => {
        const mockAdapter = createMockAdapter({ supportsCancel: true, neverResolve: true });
        const executePromise = executor.execute(mockAdapter, 'SELECT 1', { timeout: 50 });

        const result = await executePromise;
        assert.strictEqual(result.status, 'error');

        await new Promise(resolve => setTimeout(resolve, 100));
        assert.ok(mockAdapter.cancelQueryCalled, 'cancelQuery should be called on timeout');
    });

    test('should call adapter.cancelQuery on explicit cancel', async () => {
        const mockAdapter = createMockAdapter({ supportsCancel: true, neverResolve: true });
        const executePromise = executor.execute(mockAdapter, 'SELECT 1', { timeout: 60000 });

        const runningQueries = executor.getRunningQueries();
        assert.strictEqual(runningQueries.length, 1);

        await executor.cancel(runningQueries[0].queryId);

        await new Promise(resolve => setTimeout(resolve, 100));
        assert.ok(mockAdapter.cancelQueryCalled, 'cancelQuery should be called on explicit cancel');

        executePromise.catch(() => { /* swallow rejection */ });
        await new Promise(resolve => setTimeout(resolve, 50));
    });

    test('should not call cancelQuery when supportsCancel is false', async () => {
        const mockAdapter = createMockAdapter({ supportsCancel: false, neverResolve: true });
        const executePromise = executor.execute(mockAdapter, 'SELECT 1', { timeout: 50 });

        const result = await executePromise;
        assert.strictEqual(result.status, 'error');

        await new Promise(resolve => setTimeout(resolve, 100));
        assert.strictEqual(mockAdapter.cancelQueryCalled, false, 'cancelQuery should not be called when supportsCancel is false');
    });

    test('should track running queries during execution', async () => {
        const mockAdapter = createMockAdapter({ supportsCancel: true, neverResolve: true });
        const executePromise = executor.execute(mockAdapter, 'SELECT 1', { timeout: 60000 });

        assert.strictEqual(executor.getRunningQueries().length, 1);
        assert.strictEqual(executor.isRunning(executor.getRunningQueries()[0].queryId), true);

        await executor.cancel(executor.getRunningQueries()[0].queryId);
        await executePromise.catch(() => { /* swallow rejection */ });

        await new Promise(resolve => setTimeout(resolve, 50));
        assert.strictEqual(executor.getRunningQueries().length, 0);
    });
});
