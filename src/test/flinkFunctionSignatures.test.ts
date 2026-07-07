import * as assert from 'assert'
import { functionSignatures } from '../dialects/flinksql/flinksql.functions'

suite('Flink Function Signatures Completeness Tests', () => {

    const requiredWindowFunctions = [
        'TUMBLE_START',
        'TUMBLE_END',
        'HOP_START',
        'HOP_END',
        'SESSION_START',
        'SESSION_END',
        'CUMULATE_START',
        'CUMULATE_END',
    ]

    for (const fn of requiredWindowFunctions) {
        test(`窗口辅助函数 ${fn} 存在签名`, () => {
            const sig = functionSignatures.find(s => s.name === fn)
            assert.ok(sig, `missing function signature: ${fn}`)
            assert.ok(sig!.params.length >= 1, `${fn} should have params`)
            assert.ok(sig!.description.length > 0, `${fn} should have description`)
            assert.strictEqual(sig!.category, 'window')
        })
    }

    const requiredTableFunctions = [
        'TUMBLE',
        'HOP',
        'CUMULATE',
        'SESSION',
    ]

    for (const fn of requiredTableFunctions) {
        test(`表值窗口函数 ${fn} 签名首参为 TABLE`, () => {
            const sig = functionSignatures.find(s => s.name === fn)
            assert.ok(sig, `missing function signature: ${fn}`)
            // 首参应包含 TABLE 关键字（TVF 语法）
            assert.ok(
                sig!.params[0].includes('TABLE') || sig!.params[0].includes('table'),
                `${fn} first param should be TABLE type, got: ${sig!.params[0]}`
            )
        })
    }

    test('所有签名有非空描述', () => {
        for (const sig of functionSignatures) {
            assert.ok(
                sig.description.length > 0,
                `${sig.name} should have non-empty description`
            )
        }
    })

    test('所有签名有非空参数数组', () => {
        for (const sig of functionSignatures) {
            assert.ok(
                Array.isArray(sig.params),
                `${sig.name} should have params array`
            )
        }
    })

    test('所有签名有 category', () => {
        for (const sig of functionSignatures) {
            assert.ok(
                sig.category.length > 0,
                `${sig.name} should have category`
            )
        }
    })

    test('函数名唯一（无重复签名）', () => {
        const names = functionSignatures.map(s => s.name)
        const dupes = names.filter((n, i) => names.indexOf(n) !== i)
        assert.deepStrictEqual(dupes, [], `duplicate signatures: ${dupes.join(', ')}`)
    })
})
