import * as assert from 'assert';
import { AdapterFactory } from '../database/adapters/AdapterFactory';

suite('AdapterFactory 方言元数据测试', () => {
    test('未注册方言应返回 undefined', () => {
        const meta = AdapterFactory.getDialectMetadata('nonexistent');
        assert.strictEqual(meta, undefined);
    });
});
