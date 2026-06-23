import * as assert from 'assert'
import { AstLinter } from '../providers/AstLinter'

suite('Dialect-Specific Lint Rules Test Suite', () => {
    let linter: AstLinter

    suiteSetup(() => {
        linter = new AstLinter()
    })

    test('implicit_cross_join detects JOIN without ON', () => {
        const sql = 'SELECT a.id FROM users a JOIN orders b'
        const diags = linter.lint(sql, 'mysql')
        const crossJoinDiags = diags.filter(d => d.code === 'implicit_cross_join')
        assert.ok(crossJoinDiags.length > 0, 'Should detect JOIN without ON clause')
    })

    test('implicit_cross_join does not flag JOIN with ON', () => {
        const sql = 'SELECT a.id FROM users a JOIN orders b ON a.id = b.user_id'
        const diags = linter.lint(sql, 'mysql')
        const crossJoinDiags = diags.filter(d => d.code === 'implicit_cross_join')
        assert.strictEqual(crossJoinDiags.length, 0, 'Should not flag JOIN with ON clause')
    })

    test('implicit_cross_join does not flag CROSS JOIN', () => {
        const sql = 'SELECT a.id FROM users a CROSS JOIN orders b'
        const diags = linter.lint(sql, 'mysql')
        const crossJoinDiags = diags.filter(d => d.code === 'implicit_cross_join')
        assert.strictEqual(crossJoinDiags.length, 0, 'Should not flag explicit CROSS JOIN')
    })

    test('deprecated_function detects LENGTH()', () => {
        const sql = 'SELECT LENGTH(name) FROM users'
        const diags = linter.lint(sql, 'mysql')
        const deprecatedDiags = diags.filter(d => d.code === 'deprecated_function')
        assert.ok(deprecatedDiags.length > 0, 'Should detect LENGTH() function')
    })

    test('deprecated_function detects GREATEST()', () => {
        const sql = 'SELECT GREATEST(a, b) FROM users'
        const diags = linter.lint(sql, 'mysql')
        const deprecatedDiags = diags.filter(d => d.code === 'deprecated_function')
        assert.ok(deprecatedDiags.length > 0, 'Should detect GREATEST() function')
    })

    test('deprecated_function does not flag non-deprecated functions', () => {
        const sql = 'SELECT COUNT(*) FROM users'
        const diags = linter.lint(sql, 'mysql')
        const deprecatedDiags = diags.filter(d => d.code === 'deprecated_function')
        assert.strictEqual(deprecatedDiags.length, 0, 'Should not flag COUNT() function')
    })

    test('postgres_boolean_comparison detects = TRUE in postgresql', () => {
        const sql = 'SELECT * FROM users WHERE is_active = TRUE'
        const diags = linter.lint(sql, 'postgresql')
        const boolDiags = diags.filter(d => d.code === 'postgres_boolean_comparison')
        assert.ok(boolDiags.length > 0, 'Should detect = TRUE comparison in PostgreSQL')
    })

    test('postgres_boolean_comparison does not flag = TRUE in mysql', () => {
        const sql = 'SELECT * FROM users WHERE is_active = TRUE'
        const diags = linter.lint(sql, 'mysql')
        const boolDiags = diags.filter(d => d.code === 'postgres_boolean_comparison')
        assert.strictEqual(boolDiags.length, 0, 'Should not flag = TRUE in MySQL')
    })
})
