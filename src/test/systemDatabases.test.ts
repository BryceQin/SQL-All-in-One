import * as assert from 'assert';
import { getSystemDatabases } from '../utils/systemDatabases';

suite('getSystemDatabases 方言系统库列表', () => {
    test('mysql 应返回 MySQL 系统库', () => {
        const list = getSystemDatabases('mysql');
        assert.ok(list.includes('information_schema'));
        assert.ok(list.includes('mysql'));
        assert.ok(list.includes('performance_schema'));
        assert.ok(list.includes('sys'));
    });

    test('starrocks 复用 mysql 系统库列表', () => {
        const list = getSystemDatabases('starrocks');
        assert.ok(list.includes('information_schema'));
        assert.ok(list.includes('sys'));
    });

    test('postgresql 应返回 postgres/template 库', () => {
        const list = getSystemDatabases('postgresql');
        assert.ok(list.includes('postgres'));
        assert.ok(list.includes('template0'));
        assert.ok(list.includes('template1'));
        assert.ok(list.includes('pg_catalog'));
    });

    test('sqlserver 应返回 master/model/msdb/tempdb', () => {
        const list = getSystemDatabases('sqlserver');
        assert.ok(list.includes('master'));
        assert.ok(list.includes('model'));
        assert.ok(list.includes('msdb'));
        assert.ok(list.includes('tempdb'));
    });

    test('oracle 应包含 SYS/SYSTEM 系统 schema（小写形式）', () => {
        const list = getSystemDatabases('oracle');
        assert.ok(list.includes('sys'));
        assert.ok(list.includes('system'));
        assert.ok(list.includes('outln'));
        assert.ok(list.includes('xdb'));
    });

    test('dameng 复用 oracle 系统列表', () => {
        const list = getSystemDatabases('dameng');
        assert.ok(list.includes('sys'));
        assert.ok(list.includes('system'));
    });

    test('sqlite 没有系统库，应返回空数组', () => {
        const list = getSystemDatabases('sqlite');
        assert.deepStrictEqual(list, []);
    });

    test('未知方言应回退到兼容默认列表', () => {
        const list = getSystemDatabases('unknownDialect');
        assert.ok(list.includes('information_schema'));
        assert.ok(list.includes('pg_catalog'));
    });

    test('所有返回项应为小写，便于大小写不敏感比较', () => {
        const dialects = ['mysql', 'starrocks', 'postgresql', 'sqlserver', 'oracle', 'dameng', 'unknown'];
        for (const dialect of dialects) {
            const list = getSystemDatabases(dialect);
            for (const name of list) {
                assert.strictEqual(name, name.toLowerCase(), `dialect ${dialect} 的系统库 ${name} 应为小写`);
            }
        }
    });
});
