import * as assert from 'assert';
import { SqlStatementDetector } from '../database/query/SqlStatementDetector';
import { SafeQueryGuard } from '../database/query/SafeQueryGuard';
import { QueryExecutor } from '../database/query/QueryExecutor';
import { QueryHistory } from '../database/history/QueryHistory';
import { MysqlAdapter } from '../database/adapters/MysqlAdapter';
import { ConnectionConfig } from '../database/connection/ConnectionConfig';
import { StatementType, SafetyCheckResult, SafetyLevel, SafetyWarning, SafetyConfirmation, QueryHistoryEntry } from '../database/query/QueryResult';

interface SqlStatementDetectorInternal {
    detectStatementType(sql: string): StatementType;
    mapAstTypeToStatementType(astType: string): StatementType;
    parseDelimiter(doc: { getText(): string }): string;
};

interface SafeQueryGuardInternal {
    buildResult(level: SafetyLevel, warnings: SafetyWarning[], confirmations: SafetyConfirmation[]): SafetyCheckResult;
    extractObjectName(astNode: Record<string, unknown>): string;
    hasDropColumn(astNode: Record<string, unknown>): boolean;
};

interface QueryExecutorInternal {
    generateQueryId(): string;
};

interface QueryHistoryInternal {
    truncateSql(sql: string): string;
};

suite('SQL Execution Engine', () => {

    suite('SqlStatementDetector - detectStatementType', () => {
        let detector: SqlStatementDetector;

        setup(() => {
            detector = new SqlStatementDetector();
        });

        test('should detect SELECT', () => {
            assert.strictEqual((detector as unknown as SqlStatementDetectorInternal).detectStatementType('SELECT * FROM users'), 'SELECT');
        });

        test('should detect INSERT', () => {
            assert.strictEqual((detector as unknown as SqlStatementDetectorInternal).detectStatementType('INSERT INTO users VALUES (1)'), 'INSERT');
        });

        test('should detect UPDATE', () => {
            assert.strictEqual((detector as unknown as SqlStatementDetectorInternal).detectStatementType('UPDATE users SET name = "a"'), 'UPDATE');
        });

        test('should detect DELETE', () => {
            assert.strictEqual((detector as unknown as SqlStatementDetectorInternal).detectStatementType('DELETE FROM users'), 'DELETE');
        });

        test('should detect CREATE', () => {
            assert.strictEqual((detector as unknown as SqlStatementDetectorInternal).detectStatementType('CREATE TABLE test (id INT)'), 'CREATE');
        });

        test('should detect ALTER', () => {
            assert.strictEqual((detector as unknown as SqlStatementDetectorInternal).detectStatementType('ALTER TABLE test ADD col INT'), 'ALTER');
        });

        test('should detect DROP', () => {
            assert.strictEqual((detector as unknown as SqlStatementDetectorInternal).detectStatementType('DROP TABLE test'), 'DROP');
        });

        test('should detect TRUNCATE', () => {
            assert.strictEqual((detector as unknown as SqlStatementDetectorInternal).detectStatementType('TRUNCATE TABLE test'), 'TRUNCATE');
        });

        test('should detect RENAME', () => {
            assert.strictEqual((detector as unknown as SqlStatementDetectorInternal).detectStatementType('RENAME TABLE old TO new'), 'RENAME');
        });

        test('should detect GRANT', () => {
            assert.strictEqual((detector as unknown as SqlStatementDetectorInternal).detectStatementType('GRANT SELECT ON db.* TO user'), 'GRANT');
        });

        test('should detect REVOKE', () => {
            assert.strictEqual((detector as unknown as SqlStatementDetectorInternal).detectStatementType('REVOKE SELECT ON db.* FROM user'), 'REVOKE');
        });

        test('should detect SET', () => {
            assert.strictEqual((detector as unknown as SqlStatementDetectorInternal).detectStatementType('SET @var = 1'), 'SET');
        });

        test('should detect SHOW', () => {
            assert.strictEqual((detector as unknown as SqlStatementDetectorInternal).detectStatementType('SHOW TABLES'), 'SHOW');
        });

        test('should detect USE', () => {
            assert.strictEqual((detector as unknown as SqlStatementDetectorInternal).detectStatementType('USE mydb'), 'USE');
        });

        test('should detect CALL', () => {
            assert.strictEqual((detector as unknown as SqlStatementDetectorInternal).detectStatementType('CALL my_proc()'), 'CALL');
        });

        test('should detect EXPLAIN', () => {
            assert.strictEqual((detector as unknown as SqlStatementDetectorInternal).detectStatementType('EXPLAIN SELECT 1'), 'EXPLAIN');
        });

        test('should map WITH to SELECT (CTE)', () => {
            assert.strictEqual((detector as unknown as SqlStatementDetectorInternal).detectStatementType('WITH cte AS (SELECT 1) SELECT * FROM cte'), 'SELECT');
        });

        test('should return OTHER for unrecognized SQL', () => {
            assert.strictEqual((detector as unknown as SqlStatementDetectorInternal).detectStatementType('SOMETHING WEIRD'), 'OTHER');
        });

        test('should handle lowercase SQL', () => {
            assert.strictEqual((detector as unknown as SqlStatementDetectorInternal).detectStatementType('select * from users'), 'SELECT');
            assert.strictEqual((detector as unknown as SqlStatementDetectorInternal).detectStatementType('insert into users values (1)'), 'INSERT');
            assert.strictEqual((detector as unknown as SqlStatementDetectorInternal).detectStatementType('update users set name = "a"'), 'UPDATE');
            assert.strictEqual((detector as unknown as SqlStatementDetectorInternal).detectStatementType('delete from users'), 'DELETE');
        });

        test('should handle mixed case SQL', () => {
            assert.strictEqual((detector as unknown as SqlStatementDetectorInternal).detectStatementType('Select * From users'), 'SELECT');
            assert.strictEqual((detector as unknown as SqlStatementDetectorInternal).detectStatementType('Insert Into users Values (1)'), 'INSERT');
        });

        test('should handle SQL with leading whitespace', () => {
            assert.strictEqual((detector as unknown as SqlStatementDetectorInternal).detectStatementType('   SELECT * FROM users'), 'SELECT');
            assert.strictEqual((detector as unknown as SqlStatementDetectorInternal).detectStatementType('\n  INSERT INTO users VALUES (1)'), 'INSERT');
            assert.strictEqual((detector as unknown as SqlStatementDetectorInternal).detectStatementType('\t\tDELETE FROM users'), 'DELETE');
        });

        test('should handle empty string', () => {
            assert.strictEqual((detector as unknown as SqlStatementDetectorInternal).detectStatementType(''), 'OTHER');
        });

        test('should handle whitespace-only string', () => {
            assert.strictEqual((detector as unknown as SqlStatementDetectorInternal).detectStatementType('   '), 'OTHER');
        });
    });

    suite('SqlStatementDetector - mapAstTypeToStatementType', () => {
        let detector: SqlStatementDetector;

        setup(() => {
            detector = new SqlStatementDetector();
        });

        test('should map all known AST types', () => {
            const mappings: [string, StatementType][] = [
                ['select', 'SELECT'],
                ['insert', 'INSERT'],
                ['update', 'UPDATE'],
                ['delete', 'DELETE'],
                ['create', 'CREATE'],
                ['alter', 'ALTER'],
                ['drop', 'DROP'],
                ['truncate', 'TRUNCATE'],
                ['rename', 'RENAME'],
                ['grant', 'GRANT'],
                ['revoke', 'REVOKE'],
                ['set', 'SET'],
                ['show', 'SHOW'],
                ['use', 'USE'],
                ['call', 'CALL'],
                ['explain', 'EXPLAIN'],
            ];

            for (const [astType, expected] of mappings) {
                assert.strictEqual(
                    (detector as unknown as SqlStatementDetectorInternal).mapAstTypeToStatementType(astType),
                    expected,
                    `Failed for AST type: ${astType}`
                );
            }
        });

        test('should return OTHER for unknown AST type', () => {
            assert.strictEqual((detector as unknown as SqlStatementDetectorInternal).mapAstTypeToStatementType('unknown'), 'OTHER');
            assert.strictEqual((detector as unknown as SqlStatementDetectorInternal).mapAstTypeToStatementType(''), 'OTHER');
        });
    });

    suite('SqlStatementDetector - parseDelimiter', () => {
        let detector: SqlStatementDetector;

        setup(() => {
            detector = new SqlStatementDetector();
        });

        test('should return default semicolon when no DELIMITER statement', () => {
            assert.strictEqual((detector as unknown as SqlStatementDetectorInternal).parseDelimiter({ getText: () => 'SELECT 1;' }), ';');
        });

        test('should return default semicolon for empty document', () => {
            assert.strictEqual((detector as unknown as SqlStatementDetectorInternal).parseDelimiter({ getText: () => '' }), ';');
        });

        test('should detect DELIMITER //', () => {
            assert.strictEqual(
                (detector as unknown as SqlStatementDetectorInternal).parseDelimiter({ getText: () => 'DELIMITER //\nSELECT 1//' }),
                '//'
            );
        });

        test('should detect DELIMITER $$', () => {
            assert.strictEqual(
                (detector as unknown as SqlStatementDetectorInternal).parseDelimiter({ getText: () => 'DELIMITER $$\nCREATE PROCEDURE test$$' }),
                '$$'
            );
        });

        test('should detect DELIMITER with leading whitespace', () => {
            assert.strictEqual(
                (detector as unknown as SqlStatementDetectorInternal).parseDelimiter({ getText: () => '  DELIMITER |\nSELECT 1|' }),
                '|'
            );
        });
    });

    suite('SafeQueryGuard - analyze', () => {
        let guard: SafeQueryGuard;

        setup(() => {
            guard = new SafeQueryGuard();
        });

        test('should detect DELETE without WHERE', async () => {
            const result = await guard.analyze('DELETE FROM users', 'strict');
            assert.ok(result.warnings.some(w => w.rule === 'delete_without_where'));
            assert.strictEqual(result.safe, false);
        });

        test('should detect UPDATE without WHERE', async () => {
            const result = await guard.analyze('UPDATE users SET name = "a"', 'strict');
            assert.ok(result.warnings.some(w => w.rule === 'update_without_where'));
            assert.strictEqual(result.safe, false);
        });

        test('should warn but mark safe for DELETE without WHERE in moderate mode', async () => {
            const result = await guard.analyze('DELETE FROM users', 'moderate');
            assert.ok(result.warnings.some(w => w.rule === 'delete_without_where'));
            assert.strictEqual(result.safe, true);
        });

        test('should warn but mark safe for UPDATE without WHERE in moderate mode', async () => {
            const result = await guard.analyze('UPDATE users SET name = "a"', 'moderate');
            assert.ok(result.warnings.some(w => w.rule === 'update_without_where'));
            assert.strictEqual(result.safe, true);
        });

        test('should detect DROP statement', async () => {
            const result = await guard.analyze('DROP TABLE users', 'moderate');
            assert.ok(result.confirmations.some(c => c.rule === 'drop_statement'));
            assert.strictEqual(result.safe, false);
        });

        test('should detect TRUNCATE statement', async () => {
            const result = await guard.analyze('TRUNCATE TABLE users', 'moderate');
            assert.ok(result.confirmations.some(c => c.rule === 'truncate_statement'));
            assert.strictEqual(result.safe, false);
        });

        test('should mark SELECT as safe', async () => {
            const result = await guard.analyze('SELECT * FROM users WHERE id = 1', 'moderate');
            assert.strictEqual(result.safe, true);
            assert.strictEqual(result.warnings.length, 0);
            assert.strictEqual(result.confirmations.length, 0);
        });

        test('should mark INSERT as safe', async () => {
            const result = await guard.analyze('INSERT INTO users (name) VALUES ("test")', 'moderate');
            assert.strictEqual(result.safe, true);
        });

        test('should mark DELETE with WHERE as safe', async () => {
            const result = await guard.analyze('DELETE FROM users WHERE id = 1', 'moderate');
            assert.strictEqual(result.warnings.length, 0);
            assert.strictEqual(result.safe, true);
        });

        test('should mark UPDATE with WHERE as safe', async () => {
            const result = await guard.analyze('UPDATE users SET name = "a" WHERE id = 1', 'moderate');
            assert.strictEqual(result.warnings.length, 0);
            assert.strictEqual(result.safe, true);
        });

        test('should detect mixed case DELETE without WHERE', async () => {
            const result = await guard.analyze('delete from users', 'moderate');
            assert.ok(result.warnings.some(w => w.rule === 'delete_without_where'));
        });

        test('should detect mixed case UPDATE without WHERE', async () => {
            const result = await guard.analyze('update users set name = "a"', 'moderate');
            assert.ok(result.warnings.some(w => w.rule === 'update_without_where'));
        });

        test('should detect mixed case DROP', async () => {
            const result = await guard.analyze('drop table users', 'moderate');
            assert.ok(result.confirmations.some(c => c.rule === 'drop_statement'));
        });

        test('should detect mixed case TRUNCATE', async () => {
            const result = await guard.analyze('truncate table users', 'moderate');
            assert.ok(result.confirmations.some(c => c.rule === 'truncate_statement'));
        });

        test('should handle SQL with leading whitespace', async () => {
            const result = await guard.analyze('  DELETE FROM users', 'moderate');
            assert.ok(result.warnings.some(w => w.rule === 'delete_without_where'));
        });

        test('should return empty warnings and confirmations for safe SQL', async () => {
            const result = await guard.analyze('CREATE TABLE test (id INT)', 'moderate');
            assert.strictEqual(result.warnings.length, 0);
            assert.strictEqual(result.confirmations.length, 0);
            assert.strictEqual(result.safe, true);
        });

        test('should handle empty SQL', async () => {
            const result = await guard.analyze('');
            assert.strictEqual(result.safe, true);
        });
    });

    suite('SafeQueryGuard - buildResult', () => {
        let guard: SafeQueryGuard;

        setup(() => {
            guard = new SafeQueryGuard();
        });

        test('should mark safe when no warnings or confirmations', () => {
            const result = (guard as unknown as SafeQueryGuardInternal).buildResult('moderate', [], []);
            assert.strictEqual(result.safe, true);
        });

        test('should mark unsafe when confirmations exist in moderate mode', () => {
            const result = (guard as unknown as SafeQueryGuardInternal).buildResult('moderate', [], [{ rule: 'drop_statement', message: 'DROP', sql: '' }]);
            assert.strictEqual(result.safe, false);
        });

        test('should mark unsafe when warnings exist in strict mode', () => {
            const result = (guard as unknown as SafeQueryGuardInternal).buildResult('strict', [{ rule: 'delete_without_where', message: 'DELETE', severity: 'warning', sql: '' }], []);
            assert.strictEqual(result.safe, false);
        });

        test('should mark safe when only warnings exist in moderate mode', () => {
            const result = (guard as unknown as SafeQueryGuardInternal).buildResult('moderate', [{ rule: 'delete_without_where', message: 'DELETE', severity: 'warning', sql: '' }], []);
            assert.strictEqual(result.safe, true);
        });
    });

    suite('SafeQueryGuard - extractObjectName', () => {
        let guard: SafeQueryGuard;

        setup(() => {
            guard = new SafeQueryGuard();
        });

        test('should extract table name from array with table property', () => {
            const result = (guard as unknown as SafeQueryGuardInternal).extractObjectName({ table: [{ table: 'users' }] });
            assert.strictEqual(result, 'users');
        });

        test('should extract table name from string table', () => {
            const result = (guard as unknown as SafeQueryGuardInternal).extractObjectName({ table: 'users' });
            assert.strictEqual(result, 'users');
        });

        test('should extract table name from object with table property', () => {
            const result = (guard as unknown as SafeQueryGuardInternal).extractObjectName({ table: { table: 'users' } });
            assert.strictEqual(result, 'users');
        });

        test('should return unknown object for missing table', () => {
            const result = (guard as unknown as SafeQueryGuardInternal).extractObjectName({});
            assert.strictEqual(result, 'unknown object');
        });

        test('should return unknown object for null table', () => {
            const result = (guard as unknown as SafeQueryGuardInternal).extractObjectName({ table: null });
            assert.strictEqual(result, 'unknown object');
        });
    });

    suite('SafeQueryGuard - hasDropColumn', () => {
        let guard: SafeQueryGuard;

        setup(() => {
            guard = new SafeQueryGuard();
        });

        test('should detect drop column action', () => {
            const result = (guard as unknown as SafeQueryGuardInternal).hasDropColumn({ expr: [{ action: 'drop' }] });
            assert.strictEqual(result, true);
        });

        test('should return false for add column action', () => {
            const result = (guard as unknown as SafeQueryGuardInternal).hasDropColumn({ expr: [{ action: 'add' }] });
            assert.strictEqual(result, false);
        });

        test('should return false for empty expr array', () => {
            const result = (guard as unknown as SafeQueryGuardInternal).hasDropColumn({ expr: [] });
            assert.strictEqual(result, false);
        });

        test('should return false for non-array expr', () => {
            const result = (guard as unknown as SafeQueryGuardInternal).hasDropColumn({ expr: 'not-array' });
            assert.strictEqual(result, false);
        });

        test('should return false for missing expr', () => {
            const result = (guard as unknown as SafeQueryGuardInternal).hasDropColumn({});
            assert.strictEqual(result, false);
        });
    });

    suite('QueryExecutor - generateQueryId', () => {
        test('should generate unique IDs', () => {
            const executor = new QueryExecutor();
            const id1 = (executor as unknown as QueryExecutorInternal).generateQueryId();
            const id2 = (executor as unknown as QueryExecutorInternal).generateQueryId();
            assert.notStrictEqual(id1, id2);
        });

        test('should start with q- prefix', () => {
            const executor = new QueryExecutor();
            const id = (executor as unknown as QueryExecutorInternal).generateQueryId();
            assert.ok(id.startsWith('q-'));
        });

        test('should contain timestamp and random component', () => {
            const executor = new QueryExecutor();
            const id = (executor as unknown as QueryExecutorInternal).generateQueryId();
            const parts = id.split('-');
            assert.ok(parts.length >= 3, 'ID should have at least 3 parts separated by -');
        });

        test('should generate multiple unique IDs rapidly', () => {
            const executor = new QueryExecutor();
            const ids = new Set<string>();
            for (let i = 0; i < 100; i++) {
                ids.add((executor as unknown as QueryExecutorInternal).generateQueryId());
            }
            assert.strictEqual(ids.size, 100, 'All 100 IDs should be unique');
        });
    });

    suite('QueryExecutor - running queries tracking', () => {
        test('should start with no running queries', () => {
            const executor = new QueryExecutor();
            assert.strictEqual(executor.getRunningQueries().length, 0);
        });

        test('should return false for isRunning with unknown ID', () => {
            const executor = new QueryExecutor();
            assert.strictEqual(executor.isRunning('nonexistent'), false);
        });

        test('should return empty array after dispose', () => {
            const executor = new QueryExecutor();
            executor.dispose();
            assert.strictEqual(executor.getRunningQueries().length, 0);
        });

        test('should dispose cleanly even with no running queries', () => {
            const executor = new QueryExecutor();
            assert.doesNotThrow(() => executor.dispose());
        });

        test('should handle multiple dispose calls', () => {
            const executor = new QueryExecutor();
            executor.dispose();
            assert.doesNotThrow(() => executor.dispose());
        });
    });

    suite('QueryHistory - without initialization', () => {
        test('should return empty array from getAll when not initialized', () => {
            const history = new QueryHistory();
            assert.deepStrictEqual(history.getAll(), []);
        });

        test('should return empty array from getRecent when not initialized', () => {
            const history = new QueryHistory();
            assert.deepStrictEqual(history.getRecent(10), []);
        });

        test('should return empty array from search when not initialized', () => {
            const history = new QueryHistory();
            assert.deepStrictEqual(history.search('test'), []);
        });

        test('should not throw on add when not initialized', () => {
            const history = new QueryHistory();
            assert.doesNotThrow(() => history.add({
                sql: 'SELECT 1',
                connectionId: 'test',
                connectionName: 'Test',
                database: 'testdb',
                executedAt: new Date().toISOString(),
                executionTime: 100,
                rowCount: 1,
                status: 'success',
            }));
        });

        test('should not throw on clear when not initialized', () => {
            const history = new QueryHistory();
            assert.doesNotThrow(() => history.clear());
        });

        test('should not throw on deleteEntry when not initialized', () => {
            const history = new QueryHistory();
            assert.doesNotThrow(() => history.deleteEntry('nonexistent'));
        });
    });

    suite('QueryHistory - with mock context', () => {
        let history: QueryHistory;
        let store: Map<string, QueryHistoryEntry[]>;

        setup(() => {
            history = new QueryHistory();
            store = new Map();

            const mockContext = {
                globalState: {
                    get: (key: string, defaultValue: QueryHistoryEntry[] | undefined): QueryHistoryEntry[] | undefined =>
                        store.get(key) ?? defaultValue,
                    update: (key: string, value: QueryHistoryEntry[]): Thenable<void> => {
                        store.set(key, value);
                        return Promise.resolve();
                    },
                },
            };

            history.initialize(mockContext as unknown as import('vscode').ExtensionContext);
        });

        const makeEntry = (overrides?: Partial<Omit<QueryHistoryEntry, 'id'>>): QueryHistoryEntry => ({
            id: 'test-id',
            sql: 'SELECT * FROM users',
            connectionId: 'conn-1',
            connectionName: 'Test Connection',
            database: 'testdb',
            executedAt: new Date().toISOString(),
            executionTime: 50,
            rowCount: 10,
            status: 'success' as const,
            ...overrides,
        });

        test('should add and retrieve entries', async () => {
            await history.add(makeEntry());
            const entries = history.getAll();
            assert.strictEqual(entries.length, 1);
            assert.strictEqual(entries[0].sql, 'SELECT * FROM users');
            assert.strictEqual(entries[0].connectionId, 'conn-1');
        });

        test('should add entries in reverse chronological order', async () => {
            await history.add(makeEntry({ sql: 'First query' }));
            await history.add(makeEntry({ sql: 'Second query' }));
            const entries = history.getAll();
            assert.strictEqual(entries[0].sql, 'Second query');
            assert.strictEqual(entries[1].sql, 'First query');
        });

        test('should assign unique IDs to entries', async () => {
            await history.add(makeEntry());
            await history.add(makeEntry());
            const entries = history.getAll();
            assert.notStrictEqual(entries[0].id, entries[1].id);
        });

        test('should assign IDs with h- prefix', async () => {
            await history.add(makeEntry());
            const entries = history.getAll();
            assert.ok(entries[0].id.startsWith('h-'));
        });

        test('should get recent entries with limit', async () => {
            for (let i = 0; i < 10; i++) {
                await history.add(makeEntry({ sql: `Query ${i}` }));
            }
            const recent = history.getRecent(3);
            assert.strictEqual(recent.length, 3);
            assert.strictEqual(recent[0].sql, 'Query 9');
            assert.strictEqual(recent[2].sql, 'Query 7');
        });

        test('should search entries by keyword', async () => {
            await history.add(makeEntry({ sql: 'SELECT * FROM users' }));
            await history.add(makeEntry({ sql: 'INSERT INTO orders VALUES (1)' }));
            await history.add(makeEntry({ sql: 'SELECT * FROM products' }));

            const results = history.search('select');
            assert.strictEqual(results.length, 2);
        });

        test('should search case-insensitively', async () => {
            await history.add(makeEntry({ sql: 'SELECT * FROM users' }));
            const results = history.search('select');
            assert.strictEqual(results.length, 1);
        });

        test('should return empty array for non-matching search', async () => {
            await history.add(makeEntry({ sql: 'SELECT * FROM users' }));
            const results = history.search('DROP');
            assert.strictEqual(results.length, 0);
        });

        test('should clear all entries', async () => {
            await history.add(makeEntry());
            await history.add(makeEntry());
            await history.clear();
            assert.strictEqual(history.getAll().length, 0);
        });

        test('should delete a specific entry by ID', async () => {
            await history.add(makeEntry({ sql: 'Keep this' }));
            await history.add(makeEntry({ sql: 'Delete this' }));
            const entries = history.getAll();
            const toDelete = entries.find(e => e.sql === 'Delete this');
            assert.ok(toDelete);

            await history.deleteEntry(toDelete!.id);
            const remaining = history.getAll();
            assert.strictEqual(remaining.length, 1);
            assert.strictEqual(remaining[0].sql, 'Keep this');
        });

        test('should not affect other entries when deleting', async () => {
            await history.add(makeEntry({ sql: 'Query A' }));
            await history.add(makeEntry({ sql: 'Query B' }));
            await history.add(makeEntry({ sql: 'Query C' }));

            const entries = history.getAll();
            await history.deleteEntry(entries[1].id);

            const remaining = history.getAll();
            assert.strictEqual(remaining.length, 2);
        });

        test('should store error entries', async () => {
            await history.add(makeEntry({
                sql: 'BAD QUERY',
                status: 'error',
                errorMessage: 'Syntax error',
            }));
            const entries = history.getAll();
            assert.strictEqual(entries[0].status, 'error');
            assert.strictEqual(entries[0].errorMessage, 'Syntax error');
        });

        test('should store affected rows', async () => {
            await history.add(makeEntry({
                affectedRows: 5,
            }));
            const entries = history.getAll();
            assert.strictEqual(entries[0].affectedRows, 5);
        });

        test('should respect max entries limit', async () => {
            for (let i = 0; i < 600; i++) {
                await history.add(makeEntry({ sql: `Query ${i}` }));
            }
            const entries = history.getAll();
            assert.ok(entries.length <= 500, `Expected at most 500 entries, got ${entries.length}`);
        });

        test('should keep most recent entries when exceeding limit', async () => {
            for (let i = 0; i < 600; i++) {
                await history.add(makeEntry({ sql: `Query ${i}` }));
            }
            const entries = history.getAll();
            assert.strictEqual(entries[0].sql, 'Query 599');
        });
    });

    suite('QueryHistory - truncateSql', () => {
        test('should not truncate SQL under 2000 chars', () => {
            const history = new QueryHistory();
            const sql = 'SELECT 1';
            assert.strictEqual((history as unknown as QueryHistoryInternal).truncateSql(sql), sql);
        });

        test('should truncate SQL over 2000 chars', () => {
            const history = new QueryHistory();
            const longSql = 'A'.repeat(3000);
            const truncated = (history as unknown as QueryHistoryInternal).truncateSql(longSql);
            assert.ok(truncated.length < 3000);
            assert.ok(truncated.endsWith('...(truncated)'));
        });

        test('should preserve SQL exactly at 2000 chars', () => {
            const history = new QueryHistory();
            const sql = 'A'.repeat(2000);
            const result = (history as unknown as QueryHistoryInternal).truncateSql(sql);
            assert.strictEqual(result, sql);
        });

        test('should truncate SQL at 2001 chars', () => {
            const history = new QueryHistory();
            const sql = 'A'.repeat(2001);
            const result = (history as unknown as QueryHistoryInternal).truncateSql(sql);
            assert.ok(result.endsWith('...(truncated)'));
            assert.strictEqual(result.length, 2000 + '...(truncated)'.length);
        });

        test('should handle empty string', () => {
            const history = new QueryHistory();
            assert.strictEqual((history as unknown as QueryHistoryInternal).truncateSql(''), '');
        });
    });

    suite('MysqlAdapter - transaction methods (no connection)', () => {
        let adapter: MysqlAdapter;
        const testConfig: ConnectionConfig = {
            id: 'test',
            name: 'Test Connection',
            dialect: 'mysql',
            host: 'localhost',
            port: 3306,
            username: 'root',
        };

        setup(() => {
            adapter = new MysqlAdapter(testConfig);
        });

        test('should throw when beginning transaction without connection', async () => {
            await assert.rejects(
                () => adapter.queryAdapter.beginTransaction(),
                /Not connected to database/
            );
        });

        test('should throw when committing without transaction', async () => {
            await assert.rejects(
                () => adapter.queryAdapter.commit(),
                /No transaction in progress/
            );
        });

        test('should throw when rolling back without transaction', async () => {
            await assert.rejects(
                () => adapter.queryAdapter.rollback(),
                /No transaction in progress/
            );
        });
    });

    suite('MysqlAdapter - basic operations (no connection)', () => {
        let adapter: MysqlAdapter;
        const testConfig: ConnectionConfig = {
            id: 'test',
            name: 'Test Connection',
            dialect: 'mysql',
            host: 'localhost',
            port: 3306,
            username: 'root',
        };

        setup(() => {
            adapter = new MysqlAdapter(testConfig);
        });

        test('should return dialect capabilities with supportsCancel', () => {
            const caps = adapter.schemaAdapter.getDialectCapabilities();
            assert.strictEqual(caps.supportsCancel, true);
        });

        test('should return dialect capabilities with expected fields', () => {
            const caps = adapter.schemaAdapter.getDialectCapabilities();
            assert.strictEqual(typeof caps.supportsSchema, 'boolean');
            assert.strictEqual(typeof caps.supportsMultipleDatabases, 'boolean');
            assert.strictEqual(typeof caps.maxConcurrentQueries, 'number');
            assert.strictEqual(typeof caps.supportsPreparedStatement, 'boolean');
            assert.strictEqual(typeof caps.supportsExplain, 'boolean');
            assert.strictEqual(typeof caps.supportsCancel, 'boolean');
            assert.ok(Array.isArray(caps.supportedObjectTypes));
        });

        test('should return error when executing without connection', async () => {
            const result = await adapter.queryAdapter.execute('SELECT 1');
            assert.strictEqual(result.status, 'error');
            assert.strictEqual(result.error?.code, 'NOT_CONNECTED');
        });

        test('should return errors for batch queries without connection', async () => {
            const results = await adapter.queryAdapter.executeBatch([
                { sql: 'SELECT 1' },
                { sql: 'SELECT 2' },
            ]);
            assert.strictEqual(results.length, 2);
            assert.strictEqual(results[0].status, 'error');
            assert.strictEqual(results[1].status, 'error');
        });

        test('should cancel query without error when not connected', async () => {
            await assert.doesNotReject(() => adapter.queryAdapter.cancelQuery('test-query-id'));
        });
    });

    suite('QueryResult types', () => {
        test('should have correct StatementType values', () => {
            const types: StatementType[] = [
                'SELECT', 'INSERT', 'UPDATE', 'DELETE',
                'CREATE', 'ALTER', 'DROP', 'TRUNCATE',
                'RENAME', 'GRANT', 'REVOKE', 'SET',
                'SHOW', 'USE', 'CALL', 'EXPLAIN', 'OTHER',
            ];
            assert.strictEqual(types.length, 17);
        });

        test('should create valid SafetyCheckResult', () => {
            const result: SafetyCheckResult = {
                safe: true,
                warnings: [],
                confirmations: [],
            };
            assert.strictEqual(result.safe, true);
            assert.strictEqual(result.warnings.length, 0);
            assert.strictEqual(result.confirmations.length, 0);
        });

        test('should create SafetyCheckResult with warnings', () => {
            const result: SafetyCheckResult = {
                safe: false,
                warnings: [{
                    rule: 'delete_without_where',
                    message: 'DELETE without WHERE clause',
                    severity: 'warning',
                    sql: 'DELETE FROM users',
                }],
                confirmations: [],
            };
            assert.strictEqual(result.safe, false);
            assert.strictEqual(result.warnings.length, 1);
        });

        test('should create SafetyCheckResult with confirmations', () => {
            const result: SafetyCheckResult = {
                safe: false,
                warnings: [],
                confirmations: [{
                    rule: 'drop_statement',
                    message: 'DROP operation',
                    sql: 'DROP TABLE users',
                }],
            };
            assert.strictEqual(result.safe, false);
            assert.strictEqual(result.confirmations.length, 1);
        });
    });

    suite('Integration - SafeQueryGuard with various SQL patterns', () => {
        let guard: SafeQueryGuard;

        setup(() => {
            guard = new SafeQueryGuard();
        });

        test('should handle DELETE with complex WHERE clause', async () => {
            const result = await guard.analyze('DELETE FROM users WHERE id IN (SELECT id FROM temp)', 'moderate');
            assert.strictEqual(result.warnings.length, 0);
        });

        test('should handle UPDATE with JOIN and WHERE', async () => {
            const result = await guard.analyze('UPDATE users u JOIN orders o ON u.id = o.user_id SET u.status = "active" WHERE o.total > 100', 'moderate');
            assert.strictEqual(result.warnings.length, 0);
        });

        test('should handle DROP INDEX', async () => {
            const result = await guard.analyze('DROP INDEX idx_name ON users', 'moderate');
            assert.ok(result.confirmations.some(c => c.rule === 'drop_statement'));
        });

        test('should handle DROP DATABASE', async () => {
            const result = await guard.analyze('DROP DATABASE testdb', 'moderate');
            assert.ok(result.confirmations.some(c => c.rule === 'drop_statement'));
        });

        test('should handle CREATE TABLE as safe', async () => {
            const result = await guard.analyze('CREATE TABLE new_table (id INT PRIMARY KEY)', 'moderate');
            assert.strictEqual(result.safe, true);
        });

        test('should handle ALTER TABLE ADD COLUMN as safe', async () => {
            const result = await guard.analyze('ALTER TABLE users ADD COLUMN age INT', 'moderate');
            assert.strictEqual(result.safe, true);
        });

        test('should handle SET statement as safe', async () => {
            const result = await guard.analyze('SET @var = 1', 'moderate');
            assert.strictEqual(result.safe, true);
        });

        test('should handle SHOW statement as safe', async () => {
            const result = await guard.analyze('SHOW TABLES', 'moderate');
            assert.strictEqual(result.safe, true);
        });

        test('should handle EXPLAIN as safe', async () => {
            const result = await guard.analyze('EXPLAIN SELECT * FROM users', 'moderate');
            assert.strictEqual(result.safe, true);
        });
    });
});
