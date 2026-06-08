import * as assert from 'assert'
import {
    FORMAT_CONFIG_ITEMS,
    getFormatterDefaultOptions,
    getFormatterConfigKeys,
    validateConfigConsistency,
} from '../config/configDefinitions'

suite('Config Consistency', () => {

    test('getFormatterDefaultOptions covers all FORMAT_CONFIG_ITEMS except dialect', () => {
        const defaults = getFormatterDefaultOptions()
        for (const item of FORMAT_CONFIG_ITEMS) {
            if (item.key === 'dialect') continue
            assert.ok(
                item.key in defaults,
                `Missing key '${item.key}' in getFormatterDefaultOptions()`
            )
            assert.strictEqual(
                defaults[item.key],
                item.defaultValue,
                `Default value mismatch for '${item.key}': expected ${JSON.stringify(item.defaultValue)}, got ${JSON.stringify(defaults[item.key])}`
            )
        }
    })

    test('getFormatterDefaultOptions includes tabWidth and useTabs', () => {
        const defaults = getFormatterDefaultOptions()
        assert.strictEqual(defaults.tabWidth, 4)
        assert.strictEqual(defaults.useTabs, false)
    })

    test('getFormatterDefaultOptions excludes dialect', () => {
        const defaults = getFormatterDefaultOptions()
        assert.ok(!('dialect' in defaults), 'dialect should not be in formatter defaults')
    })

    test('getFormatterConfigKeys covers all FORMAT_CONFIG_ITEMS except dialect', () => {
        const keys = getFormatterConfigKeys()
        for (const item of FORMAT_CONFIG_ITEMS) {
            if (item.key === 'dialect') continue
            assert.ok(
                keys.includes(item.key),
                `Missing key '${item.key}' in getFormatterConfigKeys()`
            )
        }
    })

    test('getFormatterConfigKeys excludes dialect', () => {
        const keys = getFormatterConfigKeys()
        assert.ok(!keys.includes('dialect'), 'dialect should not be in formatter config keys')
    })

    test('validateConfigConsistency returns no mismatches for generated defaults', () => {
        const defaults = getFormatterDefaultOptions()
        const mismatches = validateConfigConsistency(defaults)
        assert.deepStrictEqual(mismatches, [], `Unexpected mismatches: ${mismatches.join('; ')}`)
    })

    test('validateConfigConsistency detects mismatches', () => {
        const defaults = getFormatterDefaultOptions()
        defaults.keywordCase = 'upper'
        const mismatches = validateConfigConsistency(defaults)
        assert.ok(mismatches.length > 0, 'Should detect keywordCase mismatch')
        assert.ok(
            mismatches.some(m => m.includes('keywordCase')),
            `Mismatch should mention keywordCase: ${mismatches.join('; ')}`
        )
    })
})
