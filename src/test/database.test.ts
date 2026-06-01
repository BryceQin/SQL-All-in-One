
import * as assert from 'assert';
import { ConnectionConfig } from '../database/connection/ConnectionConfig';
import { AdapterFactory } from '../database/adapters/AdapterFactory';
import { MysqlAdapter } from '../database/adapters/MysqlAdapter';

suite('Database Adapter Layer', () => {
    suite('AdapterFactory', () => {
        suiteSetup(() => {
            AdapterFactory.register('mysql', MysqlAdapter);
        });

        test('should register adapter successfully', () => {
            assert.strictEqual(AdapterFactory.has('mysql'), true);
        });

        test('should create adapter instance for registered dialect', () => {
            const config: ConnectionConfig = {
                id: 'test',
                name: 'Test Connection',
                dialect: 'mysql',
                host: 'localhost',
                port: 3306,
                username: 'root'
            };
            const adapter = AdapterFactory.create('mysql', config);
            assert.ok(adapter);
            assert.strictEqual(typeof adapter.connect, 'function');
        });

        test('should throw error for unregistered dialect', () => {
            const config: ConnectionConfig = {
                id: 'test',
                name: 'Test Connection',
                dialect: 'unregistered',
                host: 'localhost',
                port: 3306,
                username: 'root'
            };
            assert.throws(() => {
                AdapterFactory.create('unregistered', config);
            });
        });

        test('should return list of registered dialects', () => {
            const dialects = AdapterFactory.getRegisteredDialects();
            assert.ok(Array.isArray(dialects));
            assert.ok(dialects.includes('mysql'));
        });
    });

    suite('MysqlAdapter - static methods', () => {
        let adapter: MysqlAdapter;
        const testConfig: ConnectionConfig = {
            id: 'test',
            name: 'Test Connection',
            dialect: 'mysql',
            host: 'localhost',
            port: 3306,
            username: 'root'
        };

        setup(() => {
            adapter = new MysqlAdapter(testConfig);
        });

        test('should create instance successfully', () => {
            assert.ok(adapter);
        });

        test('should return connection id', () => {
            const id = adapter.getConnectionId();
            assert.strictEqual(typeof id, 'string');
            assert.ok(id.startsWith('mysql-'));
        });

        test('should return connection state as disconnected initially', () => {
            assert.strictEqual(adapter.isConnected(), false);
        });

        test('should return dialect capabilities', () => {
            const capabilities = adapter.getDialectCapabilities();
            assert.strictEqual(typeof capabilities, 'object');
            assert.strictEqual(capabilities.supportsMultipleDatabases, true);
            assert.strictEqual(capabilities.supportsSchema, false);
        });

        test('should return supported data types', () => {
            const types = adapter.getSupportedDataTypes();
            assert.ok(Array.isArray(types));
            assert.ok(types.length > 0);
            assert.ok(types.some(t => t.category === 'Integer'));
            assert.ok(types.some(t => t.category === 'String'));
        });

        test('should quote identifiers with backticks', () => {
            assert.strictEqual(adapter.quoteIdentifier('table'), '`table`');
            assert.strictEqual(adapter.quoteIdentifier('my`table'), '`my``table`');
        });

        test('should return NOT_CONNECTED error when executing without connection', async () => {
            const result = await adapter.execute('SELECT 1');
            assert.strictEqual(result.status, 'error');
            assert.strictEqual(result.error?.code, 'NOT_CONNECTED');
        });

        test('should return false for checkConnectionHealth when not connected', async () => {
            const healthy = await adapter.checkConnectionHealth();
            assert.strictEqual(healthy, false);
        });

        test('should throw when beginning transaction without connection', async () => {
            await assert.rejects(
                () => adapter.beginTransaction(),
                /Not connected to database/
            );
        });

        test('should throw when committing without transaction', async () => {
            await assert.rejects(
                () => adapter.commit(),
                /No transaction in progress/
            );
        });

        test('should throw when rolling back without transaction', async () => {
            await assert.rejects(
                () => adapter.rollback(),
                /No transaction in progress/
            );
        });

        test('should return empty listDatabases when not connected', async () => {
            const dbs = await adapter.listDatabases();
            assert.deepStrictEqual(dbs, []);
        });

        test('should return empty listTables when not connected', async () => {
            const tables = await adapter.listTables();
            assert.deepStrictEqual(tables, []);
        });

        test('should return empty listViews when not connected', async () => {
            const views = await adapter.listViews();
            assert.deepStrictEqual(views, []);
        });

        test('should return empty listFunctions when not connected', async () => {
            const funcs = await adapter.listFunctions();
            assert.deepStrictEqual(funcs, []);
        });

        test('should return empty listProcedures when not connected', async () => {
            const procs = await adapter.listProcedures();
            assert.deepStrictEqual(procs, []);
        });

        test('should return empty listTriggers when not connected', async () => {
            const triggers = await adapter.listTriggers();
            assert.deepStrictEqual(triggers, []);
        });

        test('should return empty describeTable when not connected', async () => {
            const structure = await adapter.describeTable('testdb', 'testtable');
            assert.deepStrictEqual(structure.columns, []);
            assert.deepStrictEqual(structure.indexes, []);
            assert.deepStrictEqual(structure.foreignKeys, []);
            assert.deepStrictEqual(structure.triggers, []);
        });

        test('should return empty getTableDDL when not connected', async () => {
            const ddl = await adapter.getTableDDL('testdb', 'testtable');
            assert.strictEqual(ddl, '');
        });

        test('should return empty getViewDDL when not connected', async () => {
            const ddl = await adapter.getViewDDL('testdb', 'testview');
            assert.strictEqual(ddl, '');
        });

        test('should return empty getExplainPlan when not connected', async () => {
            const explain = await adapter.getExplainPlan('testdb', 'SELECT 1');
            assert.deepStrictEqual(explain.nodes, []);
        });

        test('should return zero getTableRowCount when not connected', async () => {
            const count = await adapter.getTableRowCount('testdb', 'testtable');
            assert.strictEqual(count, 0);
        });

        test('cancelQuery should not throw when not connected', async () => {
            await assert.doesNotReject(() => adapter.cancelQuery('test-query-id'));
        });

        test('should return empty listSchemas (MySQL does not support schemas)', async () => {
            const schemas = await adapter.listSchemas();
            assert.deepStrictEqual(schemas, []);
        });

        test('should return pool status with zero values when not connected', () => {
            const status = adapter.getPoolStatus();
            assert.strictEqual(status.totalConnections, 0);
            assert.strictEqual(status.activeConnections, 0);
            assert.strictEqual(status.idleConnections, 0);
            assert.strictEqual(status.waitingRequests, 0);
            assert.strictEqual(status.connectionLimit, 5);
            assert.strictEqual(status.acquireTimeout, 60000);
        });

        test('should return pool status with custom config values when not connected', () => {
            const customConfig: ConnectionConfig = {
                id: 'test',
                name: 'Test Connection',
                dialect: 'mysql',
                host: 'localhost',
                port: 3306,
                username: 'root',
                poolConfig: {
                    maxConnections: 10,
                    acquireTimeout: 30000,
                    minConnections: 2,
                    idleTimeout: 60000,
                    reapInterval: 15000,
                    enableKeepAlive: true,
                    keepAliveInterval: 10000,
                }
            };
            const customAdapter = new MysqlAdapter(customConfig);
            const status = customAdapter.getPoolStatus();
            assert.strictEqual(status.connectionLimit, 10);
            assert.strictEqual(status.acquireTimeout, 30000);
        });
    });

    suite('Connection Types', () => {
        test('should create valid ConnectionConfig object', () => {
            const config: ConnectionConfig = {
                id: 'test-1',
                name: 'Test Connection',
                dialect: 'mysql',
                group: 'Development',
                color: '#4CAF50',
                host: 'localhost',
                port: 3306,
                username: 'root',
                password: 'secret',
                database: 'test',
                connectTimeout: 10000
            };
            assert.strictEqual(config.id, 'test-1');
            assert.strictEqual(config.name, 'Test Connection');
            assert.strictEqual(config.dialect, 'mysql');
        });

        test('should create valid ConnectionConfig with poolConfig', () => {
            const config: ConnectionConfig = {
                id: 'test-pool',
                name: 'Pool Test',
                dialect: 'mysql',
                host: 'localhost',
                port: 3306,
                username: 'root',
                poolConfig: {
                    minConnections: 2,
                    maxConnections: 10,
                    acquireTimeout: 30000,
                    idleTimeout: 60000,
                    reapInterval: 15000,
                    enableKeepAlive: true,
                    keepAliveInterval: 10000,
                }
            };
            assert.strictEqual(config.poolConfig?.minConnections, 2);
            assert.strictEqual(config.poolConfig?.maxConnections, 10);
            assert.strictEqual(config.poolConfig?.acquireTimeout, 30000);
            assert.strictEqual(config.poolConfig?.idleTimeout, 60000);
            assert.strictEqual(config.poolConfig?.reapInterval, 15000);
            assert.strictEqual(config.poolConfig?.enableKeepAlive, true);
            assert.strictEqual(config.poolConfig?.keepAliveInterval, 10000);
        });
    });
});
