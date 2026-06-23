import * as assert from 'assert';
import { AdapterFactory } from '../database/adapters/AdapterFactory';
import { MysqlAdapter } from '../database/adapters/MysqlAdapter';

suite('AdapterFactory 方言元数据测试', () => {
    test('未注册方言应返回 undefined', () => {
        const meta = AdapterFactory.getDialectMetadata('nonexistent');
        assert.strictEqual(meta, undefined);
    });

    test('mysql 方言元数据应正确', () => {
        AdapterFactory.register('mysql', MysqlAdapter, MysqlAdapter.getDialectMetadata);
        const meta = AdapterFactory.getDialectMetadata('mysql');
        assert.ok(meta, 'mysql 元数据应存在');
        assert.strictEqual(meta!.dialect, 'mysql');
        assert.strictEqual(meta!.displayName, 'MySQL');
        assert.strictEqual(meta!.defaultPort, 3306);
        assert.strictEqual(meta!.defaultUsername, 'root');
        assert.strictEqual(meta!.supportsSshTunnel, true);
        assert.strictEqual(meta!.supportsSsl, true);
        assert.strictEqual(meta!.isFileBased, false);
    });

    test('getAllMetadata 应包含 mysql', () => {
        const all = AdapterFactory.getAllMetadata();
        assert.ok(all.some(m => m.dialect === 'mysql'), '应包含 mysql');
    });
});
