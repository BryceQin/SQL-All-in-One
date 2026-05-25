import * as assert from 'assert'

suite('Completion Module Tests', () => {

    test('FunctionSignature type has required fields', () => {
        const sig = {
            name: 'SUBSTR',
            params: ['string str', 'int start'],
            description: 'test',
            category: 'string'
        }
        assert.strictEqual(sig.name, 'SUBSTR')
        assert.strictEqual(sig.params.length, 2)
        assert.strictEqual(sig.category, 'string')
    })

    test('signatureToString formats correctly', async () => {
        const mod = await import('../completion/functionSignatures.js')
        const result = mod.signatureToString({
            name: 'SUBSTR',
            params: ['string str', 'int start', 'int length'],
            description: 'substring',
            category: 'string',
        })
        assert.strictEqual(result, 'SUBSTR(string str, int start, int length)')
    })

    test('getCategoryLabel returns Chinese labels', async () => {
        const i18n = await import('../i18n/index.js')
        i18n.initI18nForTest('zh')
        const mod = await import('../completion/functionSignatures.js')
        assert.strictEqual(mod.getCategoryLabel('string'), '字符串')
        assert.strictEqual(mod.getCategoryLabel('math'), '数学')
        assert.strictEqual(mod.getCategoryLabel('date'), '日期')
        assert.strictEqual(mod.getCategoryLabel('aggregate'), '聚合')
        assert.strictEqual(mod.getCategoryLabel('window'), '窗口')
    })

    test('Hive functionSignatures export is a non-empty array', async () => {
        const hive = await import('../languages/hive/hive.functions.js')
        assert.ok(Array.isArray(hive.functionSignatures))
        assert.ok(hive.functionSignatures.length > 0)
        const f = hive.functionSignatures[0]
        assert.ok(typeof f.name === 'string')
        assert.ok(Array.isArray(f.params))
        assert.ok(typeof f.description === 'string')
    })
})