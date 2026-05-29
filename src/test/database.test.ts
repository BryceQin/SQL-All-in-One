
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

    suite('MysqlAdapter', () => {
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
        });

        test('should return connection state as disconnected initially', () => {
            assert.strictEqual(adapter.isConnected(), false);
        });

        test('should set connection state to connected after connect', async () => {
            await adapter.connect(testConfig);
            assert.strictEqual(adapter.isConnected(), true);
        });

        test('should set connection state to disconnected after disconnect', async () => {
            await adapter.connect(testConfig);
            await adapter.disconnect();
            assert.strictEqual(adapter.isConnected(), false);
        });

        test('should return test connection result', async () => {
            const result = await adapter.testConnection(testConfig);
            assert.strictEqual(typeof result, 'object');
            assert.ok(result.success);
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
    });
});
