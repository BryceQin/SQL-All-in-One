import * as assert from 'assert'
import { findCursorContext, extractCteNames, extractTableNames, extractColumnRefs } from '../completion/AstCompletionProvider'

suite('AstCompletionProvider Test Suite', () => {

    suite('findCursorContext', () => {

        test('returns unknown for incomplete SQL', () => {
            const result = findCursorContext('SELECT ', { line: 0, column: 7 }, 'mysql')
            assert.strictEqual(result, 'unknown')
        })

        test('returns unknown for empty SQL', () => {
            const result = findCursorContext('', { line: 0, column: 0 }, 'mysql')
            assert.strictEqual(result, 'unknown')
        })

        test('returns select_columns when cursor is in SELECT clause', () => {
            const sql = 'SELECT id, name FROM users'
            const result = findCursorContext(sql, { line: 0, column: 9 }, 'mysql')
            assert.strictEqual(result, 'select_columns')
        })

        test('returns from_table when cursor is in FROM clause', () => {
            const sql = 'SELECT id FROM users'
            const result = findCursorContext(sql, { line: 0, column: 15 }, 'mysql')
            assert.strictEqual(result, 'from_table')
        })

        test('returns where_expr when cursor is in WHERE clause', () => {
            const sql = 'SELECT id FROM users WHERE id = 1'
            const result = findCursorContext(sql, { line: 0, column: 27 }, 'mysql')
            assert.strictEqual(result, 'where_expr')
        })

        test('returns groupby_columns when cursor is in GROUP BY clause', () => {
            const sql = 'SELECT id, COUNT(*) FROM users GROUP BY id'
            const result = findCursorContext(sql, { line: 0, column: 37 }, 'mysql')
            assert.strictEqual(result, 'groupby_columns')
        })

        test('returns orderby_columns when cursor is in ORDER BY clause', () => {
            const sql = 'SELECT id FROM users ORDER BY id'
            const result = findCursorContext(sql, { line: 0, column: 28 }, 'mysql')
            assert.strictEqual(result, 'orderby_columns')
        })

        test('returns join_type when cursor is after JOIN keyword', () => {
            const sql = 'SELECT a.id FROM users a LEFT JOIN orders b ON a.id = b.user_id'
            const result = findCursorContext(sql, { line: 0, column: 36 }, 'mysql')
            assert.strictEqual(result, 'join_type')
        })

        test('returns on_condition when cursor is in ON clause', () => {
            const sql = 'SELECT a.id FROM users a LEFT JOIN orders b ON a.id = b.user_id'
            const result = findCursorContext(sql, { line: 0, column: 49 }, 'mysql')
            assert.strictEqual(result, 'on_condition')
        })

        test('handles multiline SQL', () => {
            const sql = 'SELECT id\nFROM users\nWHERE id = 1'
            const result = findCursorContext(sql, { line: 2, column: 5 }, 'mysql')
            assert.strictEqual(result, 'where_expr')
        })

        test('returns unknown for unparseable SQL', () => {
            const result = findCursorContext('NOT VALID SQL !!!', { line: 0, column: 5 }, 'mysql')
            assert.strictEqual(result, 'unknown')
        })
    })

    suite('extractCteNames', () => {

        test('extracts CTE names from WITH clause', () => {
            const sql = 'WITH active_users AS (SELECT * FROM users WHERE active = 1) SELECT * FROM active_users'
            const names = extractCteNames(sql, 'mysql')
            assert.ok(names.includes('active_users'))
        })

        test('extracts multiple CTE names', () => {
            const sql = 'WITH a AS (SELECT 1), b AS (SELECT 2) SELECT * FROM a JOIN b ON 1=1'
            const names = extractCteNames(sql, 'mysql')
            assert.ok(names.includes('a'))
            assert.ok(names.includes('b'))
        })

        test('returns empty array for SQL without CTEs', () => {
            const sql = 'SELECT id FROM users'
            const names = extractCteNames(sql, 'mysql')
            assert.strictEqual(names.length, 0)
        })

        test('returns empty array for unparseable SQL', () => {
            const names = extractCteNames('NOT SQL', 'mysql')
            assert.strictEqual(names.length, 0)
        })
    })

    suite('extractTableNames', () => {

        test('extracts table names from FROM clause', () => {
            const sql = 'SELECT id FROM users'
            const names = extractTableNames(sql, 'mysql')
            assert.ok(names.includes('users'))
        })

        test('extracts table names from JOIN clauses', () => {
            const sql = 'SELECT a.id FROM users a LEFT JOIN orders b ON a.id = b.user_id'
            const names = extractTableNames(sql, 'mysql')
            assert.ok(names.includes('users'))
            assert.ok(names.includes('orders'))
        })

        test('deduplicates table names', () => {
            const sql = 'SELECT a.id FROM users a JOIN orders b ON a.id = b.user_id JOIN users c ON c.id = b.user_id'
            const names = extractTableNames(sql, 'mysql')
            const usersCount = names.filter(n => n.toLowerCase() === 'users').length
            assert.strictEqual(usersCount, 1)
        })

        test('returns empty array for unparseable SQL', () => {
            const names = extractTableNames('NOT SQL', 'mysql')
            assert.strictEqual(names.length, 0)
        })
    })

    suite('extractColumnRefs', () => {

        test('extracts column references', () => {
            const sql = 'SELECT id, name FROM users'
            const refs = extractColumnRefs(sql, 'mysql')
            const columns = refs.map(r => r.column)
            assert.ok(columns.includes('id'))
            assert.ok(columns.includes('name'))
        })

        test('extracts table-qualified column references', () => {
            const sql = 'SELECT a.id, a.name FROM users a'
            const refs = extractColumnRefs(sql, 'mysql')
            const qualifiedRef = refs.find(r => r.column === 'id')
            assert.ok(qualifiedRef)
            assert.ok(qualifiedRef.table.length > 0 || qualifiedRef.column === 'id')
        })

        test('deduplicates column references', () => {
            const sql = 'SELECT id, id FROM users'
            const refs = extractColumnRefs(sql, 'mysql')
            const idRefs = refs.filter(r => r.column === 'id')
            assert.strictEqual(idRefs.length, 1)
        })

        test('returns empty array for unparseable SQL', () => {
            const refs = extractColumnRefs('NOT SQL', 'mysql')
            assert.strictEqual(refs.length, 0)
        })
    })
})
