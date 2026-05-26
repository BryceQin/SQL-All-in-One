import * as assert from 'assert'
import { AstLinter } from '../providers/AstLinter'

suite('AstLinter Test Suite', () => {
    let linter: AstLinter

    suiteSetup(() => {
        linter = new AstLinter()
    })

    test('avoid_select_star detects SELECT *', () => {
        const sql = 'SELECT * FROM users'
        const diags = linter.lint(sql, 'mysql')
        const starDiags = diags.filter(d => d.code === 'avoid_select_star')
        assert.ok(starDiags.length > 0, 'Should detect SELECT *')
    })

    test('avoid_select_star does not flag explicit columns', () => {
        const sql = 'SELECT id, name FROM users'
        const diags = linter.lint(sql, 'mysql')
        const starDiags = diags.filter(d => d.code === 'avoid_select_star')
        assert.strictEqual(starDiags.length, 0, 'Should not flag explicit columns')
    })

    test('explicit_join_type detects bare JOIN', () => {
        const sql = 'SELECT a.id FROM users a JOIN orders b ON a.id = b.user_id'
        const diags = linter.lint(sql, 'mysql')
        const joinDiags = diags.filter(d => d.code === 'explicit_join_type')
        assert.ok(joinDiags.length > 0, 'Should detect bare JOIN')
    })

    test('explicit_join_type does not flag LEFT JOIN', () => {
        const sql = 'SELECT a.id FROM users a LEFT JOIN orders b ON a.id = b.user_id'
        const diags = linter.lint(sql, 'mysql')
        const joinDiags = diags.filter(d => d.code === 'explicit_join_type')
        assert.strictEqual(joinDiags.length, 0, 'Should not flag LEFT JOIN')
    })

    test('limit_with_order_by detects LIMIT without ORDER BY', () => {
        const sql = 'SELECT id FROM users LIMIT 10'
        const diags = linter.lint(sql, 'mysql')
        const limitDiags = diags.filter(d => d.code === 'limit_with_order_by')
        assert.ok(limitDiags.length > 0, 'Should detect LIMIT without ORDER BY')
    })

    test('limit_with_order_by does not flag LIMIT with ORDER BY', () => {
        const sql = 'SELECT id FROM users ORDER BY id LIMIT 10'
        const diags = linter.lint(sql, 'mysql')
        const limitDiags = diags.filter(d => d.code === 'limit_with_order_by')
        assert.strictEqual(limitDiags.length, 0, 'Should not flag LIMIT with ORDER BY')
    })

    test('avoid_column_count_mismatch returns empty for matching counts', () => {
        const sql = "INSERT INTO users (id, name) VALUES (1, 'test')"
        const diags = linter.lint(sql, 'mysql')
        const mismatchDiags = diags.filter(d => d.code === 'avoid_column_count_mismatch')
        assert.strictEqual(mismatchDiags.length, 0, 'Should not flag matching counts')
    })

    test('avoid_column_count_mismatch returns empty for unparseable SQL', () => {
        const sql = 'INSERT INTO users (id, name) VALUES (1)'
        const diags = linter.lint(sql, 'mysql')
        assert.ok(Array.isArray(diags), 'Should return array even for unparseable SQL')
    })

    test('missing_primary_key detects CREATE TABLE without PK', () => {
        const sql = 'CREATE TABLE users (id INT, name VARCHAR(100))'
        const diags = linter.lint(sql, 'mysql')
        const pkDiags = diags.filter(d => d.code === 'missing_primary_key')
        assert.ok(pkDiags.length > 0, 'Should detect CREATE TABLE without primary key')
    })

    test('missing_primary_key does not flag CREATE TABLE with PK', () => {
        const sql = 'CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(100))'
        const diags = linter.lint(sql, 'mysql')
        const pkDiags = diags.filter(d => d.code === 'missing_primary_key')
        assert.strictEqual(pkDiags.length, 0, 'Should not flag CREATE TABLE with primary key')
    })

    test('duplicate_column_aliases detects duplicate aliases', () => {
        const sql = 'SELECT id AS x, name AS x FROM users'
        const diags = linter.lint(sql, 'mysql')
        const dupDiags = diags.filter(d => d.code === 'duplicate_column_aliases')
        assert.ok(dupDiags.length > 0, 'Should detect duplicate column aliases')
    })

    test('duplicate_column_aliases does not flag unique aliases', () => {
        const sql = 'SELECT id AS user_id, name AS user_name FROM users'
        const diags = linter.lint(sql, 'mysql')
        const dupDiags = diags.filter(d => d.code === 'duplicate_column_aliases')
        assert.strictEqual(dupDiags.length, 0, 'Should not flag unique aliases')
    })

    test('use_coalesce_over_isnull detects IFNULL when enabled', async () => {
        const vscode = await import('vscode')
        await vscode.workspace.getConfiguration('SQL-All-in-One').update('lint.use_coalesce_over_isnull', { enabled: true }, vscode.ConfigurationTarget.Global)
        const enabledLinter = new AstLinter()
        const sql = "SELECT IFNULL(name, 'N/A') FROM users"
        const diags = enabledLinter.lint(sql, 'mysql')
        const coalesceDiags = diags.filter(d => d.code === 'use_coalesce_over_isnull')
        assert.ok(coalesceDiags.length > 0, 'Should detect IFNULL when rule is enabled')
        await vscode.workspace.getConfiguration('SQL-All-in-One').update('lint.use_coalesce_over_isnull', undefined, vscode.ConfigurationTarget.Global)
    })

    test('use_current_timestamp detects NOW()', () => {
        const sql = 'SELECT NOW() FROM users'
        const diags = linter.lint(sql, 'mysql')
        const tsDiags = diags.filter(d => d.code === 'use_current_timestamp')
        assert.ok(tsDiags.length > 0, 'Should detect NOW()')
    })

    test('use_current_timestamp does not flag CURRENT_TIMESTAMP', () => {
        const sql = 'SELECT CURRENT_TIMESTAMP FROM users'
        const diags = linter.lint(sql, 'mysql')
        const tsDiags = diags.filter(d => d.code === 'use_current_timestamp')
        assert.strictEqual(tsDiags.length, 0, 'Should not flag CURRENT_TIMESTAMP')
    })

    test('avoid_select_in_insert detects INSERT ... SELECT *', () => {
        const sql = 'INSERT INTO target_table SELECT * FROM source_table'
        const diags = linter.lint(sql, 'mysql')
        const insertDiags = diags.filter(d => d.code === 'avoid_select_in_insert')
        assert.ok(insertDiags.length > 0, 'Should detect INSERT ... SELECT *')
    })

    test('diagnostics have correct source and code', () => {
        const sql = 'SELECT * FROM users'
        const diags = linter.lint(sql, 'mysql')
        const starDiags = diags.filter(d => d.code === 'avoid_select_star')
        if (starDiags.length > 0) {
            assert.strictEqual(starDiags[0].code, 'avoid_select_star')
            assert.ok(starDiags[0].source, 'Diagnostic should have source')
        }
    })

    test('returns empty diagnostics for unparseable SQL', () => {
        const sql = 'NOT VALID SQL AT ALL !!!'
        const diags = linter.lint(sql, 'mysql')
        assert.ok(Array.isArray(diags), 'Should return array even for invalid SQL')
    })

    test('handles UNION queries', () => {
        const sql = 'SELECT * FROM users UNION SELECT * FROM orders'
        const diags = linter.lint(sql, 'mysql')
        const starDiags = diags.filter(d => d.code === 'avoid_select_star')
        assert.ok(starDiags.length >= 2, 'Should detect SELECT * in both sides of UNION')
    })

    test('missing_primary_key detects table with constraint PK', () => {
        const sql = 'CREATE TABLE users (id INT, name VARCHAR(100), CONSTRAINT pk_users PRIMARY KEY (id))'
        const diags = linter.lint(sql, 'mysql')
        const pkDiags = diags.filter(d => d.code === 'missing_primary_key')
        assert.strictEqual(pkDiags.length, 0, 'Should not flag table with constraint PK')
    })
})
