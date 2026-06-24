import * as assert from 'assert'
import { DialectConverter } from '../converter/DialectConverter'

suite('MySQL <-> Hive Subquery Conversion Test Suite', () => {
    let converter: DialectConverter

    setup(() => {
        converter = new DialectConverter()
    })

    function assertConverted(result: ReturnType<DialectConverter['convert']>): string {
        assert.strictEqual(result.success, true, `Conversion failed: ${result.error?.message ?? 'unknown'}`)
        assert.strictEqual(result.usedFallback, false, 'Should not use regex fallback for valid SQL')
        assert.ok(result.result, 'Result should not be null')
        return result.result!
    }

    function unquoted(s: string): string {
        return s.replace(/`/g, '')
    }

    // ========================================================================
    // Scalar subqueries in SELECT list
    // ========================================================================

    suite('Scalar subquery in SELECT list', () => {
        test('MySQL to Hive - basic scalar subquery in SELECT', () => {
            const sql = 'SELECT id, (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS order_count FROM users u'
            const result = converter.convert(sql, 'mysql', 'hive')
            const out = assertConverted(result)
            assert.ok(out.includes('SELECT COUNT(*)'), 'inner SELECT should be preserved')
            assert.ok(out.toUpperCase().includes('FROM'), 'FROM should be preserved')
            assert.ok(/order_count/i.test(out), 'column alias should be preserved')
        })

        test('MySQL to Hive - correlated scalar subquery references outer table', () => {
            const sql = 'SELECT u.name, (SELECT MAX(o.amount) FROM orders o WHERE o.user_id = u.id) AS max_amount FROM users u'
            const result = converter.convert(sql, 'mysql', 'hive')
            const out = assertConverted(result)
            assert.ok(out.toUpperCase().includes('MAX'), 'MAX aggregate should be preserved')
            assert.ok(/user_id/i.test(out), 'correlation predicate should be preserved')
        })

        test('MySQL to Hive - multiple scalar subqueries in one SELECT', () => {
            const sql = 'SELECT u.id, (SELECT COUNT(*) FROM orders WHERE user_id = u.id) AS cnt, (SELECT MAX(amount) FROM orders WHERE user_id = u.id) AS mx FROM users u'
            const result = converter.convert(sql, 'mysql', 'hive')
            const out = assertConverted(result)
            const countMatches = out.match(/SELECT COUNT\(\*\)/g)
            assert.ok(countMatches && countMatches.length >= 1, 'COUNT(*) subquery should be present')
            assert.ok(out.toUpperCase().includes('MAX'), 'MAX subquery should be present')
        })

        test('MySQL to Hive - scalar subquery with NOW() is transformed inside subquery', () => {
            const sql = 'SELECT id, (SELECT NOW()) AS now_time FROM users'
            const result = converter.convert(sql, 'mysql', 'hive')
            const out = assertConverted(result)
            assert.ok(out.toUpperCase().includes('CURRENT_TIMESTAMP'), 'NOW() inside subquery should become CURRENT_TIMESTAMP')
        })

        test('MySQL to Hive - scalar subquery with IFNULL is transformed inside subquery', () => {
            const sql = 'SELECT id, IFNULL((SELECT MAX(amount) FROM orders WHERE user_id = u.id), 0) AS mx FROM users u'
            const result = converter.convert(sql, 'mysql', 'hive')
            const out = assertConverted(result)
            assert.ok(out.toUpperCase().includes('COALESCE'), 'IFNULL should become COALESCE')
            assert.ok(out.toUpperCase().includes('MAX'), 'inner MAX should be preserved')
        })

        test('MySQL to Hive - scalar subquery with IF() is transformed to CASE WHEN', () => {
            const sql = "SELECT id, IF((SELECT COUNT(*) FROM orders WHERE user_id = u.id) > 0, 'active', 'inactive') AS st FROM users u"
            const result = converter.convert(sql, 'mysql', 'hive')
            const out = assertConverted(result)
            assert.ok(out.toUpperCase().includes('CASE'), 'IF should become CASE')
            assert.ok(out.toUpperCase().includes('WHEN'), 'CASE WHEN should be present')
            assert.ok(out.toUpperCase().includes('COUNT'), 'inner COUNT should be preserved')
        })
    })

    // ========================================================================
    // Scalar subqueries in WHERE
    // ========================================================================

    suite('Scalar subquery in WHERE', () => {
        test('MySQL to Hive - equality with scalar subquery', () => {
            const sql = 'SELECT id, name FROM users WHERE id = (SELECT user_id FROM orders WHERE order_id = 1)'
            const result = converter.convert(sql, 'mysql', 'hive')
            const out = assertConverted(result)
            assert.ok(out.toUpperCase().includes('WHERE'), 'WHERE clause should be preserved')
            assert.ok(unquoted(out).includes('SELECT user_id'), 'inner subquery should be preserved')
        })

        test('MySQL to Hive - IN subquery', () => {
            const sql = 'SELECT id, name FROM users WHERE id IN (SELECT user_id FROM orders WHERE status = 1)'
            const result = converter.convert(sql, 'mysql', 'hive')
            const out = assertConverted(result)
            assert.ok(/\bIN\b/i.test(out), 'IN operator should be preserved')
            assert.ok(unquoted(out).includes('SELECT user_id'), 'IN-subquery should be preserved')
        })

        test('MySQL to Hive - NOT IN subquery', () => {
            const sql = 'SELECT id, name FROM users WHERE id NOT IN (SELECT user_id FROM orders WHERE status = 0)'
            const result = converter.convert(sql, 'mysql', 'hive')
            const out = assertConverted(result)
            assert.ok(/NOT\s+IN/i.test(out), 'NOT IN operator should be preserved')
        })

        test('MySQL to Hive - EXISTS correlated subquery', () => {
            const sql = 'SELECT id, name FROM users u WHERE EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id)'
            const result = converter.convert(sql, 'mysql', 'hive')
            const out = assertConverted(result)
            assert.ok(/EXISTS/i.test(out), 'EXISTS should be preserved')
            assert.ok(out.includes('SELECT 1'), 'EXISTS subquery body should be preserved')
        })

        test('MySQL to Hive - comparison with aggregate scalar subquery', () => {
            const sql = 'SELECT u.id FROM users u JOIN orders o ON u.id = o.user_id AND o.amount > (SELECT AVG(amount) FROM orders)'
            const result = converter.convert(sql, 'mysql', 'hive')
            const out = assertConverted(result)
            assert.ok(out.toUpperCase().includes('AVG'), 'AVG in subquery should be preserved')
            assert.ok(/JOIN/i.test(out), 'JOIN should be preserved')
        })
    })

    // ========================================================================
    // Scalar subqueries in HAVING / ORDER BY / CASE
    // ========================================================================

    suite('Scalar subquery in HAVING / ORDER BY / CASE', () => {
        test('MySQL to Hive - scalar subquery in HAVING', () => {
            const sql = 'SELECT user_id, COUNT(*) FROM orders GROUP BY user_id HAVING COUNT(*) > (SELECT AVG(cnt) FROM (SELECT COUNT(*) AS cnt FROM orders GROUP BY user_id) t)'
            const result = converter.convert(sql, 'mysql', 'hive')
            const out = assertConverted(result)
            assert.ok(out.toUpperCase().includes('HAVING'), 'HAVING should be preserved')
            assert.ok(out.toUpperCase().includes('AVG'), 'AVG in HAVING subquery should be preserved')
            assert.ok(out.toUpperCase().includes('GROUP BY'), 'GROUP BY should be preserved')
        })

        test('MySQL to Hive - scalar subquery in ORDER BY', () => {
            const sql = 'SELECT id, name FROM users ORDER BY (SELECT COUNT(*) FROM orders WHERE user_id = users.id) DESC'
            const result = converter.convert(sql, 'mysql', 'hive')
            const out = assertConverted(result)
            assert.ok(out.toUpperCase().includes('ORDER BY'), 'ORDER BY should be preserved')
            assert.ok(out.includes('SELECT COUNT(*)'), 'ORDER BY subquery should be preserved')
            assert.ok(/DESC/i.test(out), 'DESC should be preserved')
        })

        test('MySQL to Hive - scalar subquery inside CASE WHEN', () => {
            const sql = "SELECT id, CASE WHEN (SELECT COUNT(*) FROM orders WHERE user_id = u.id) > 0 THEN 'has' ELSE 'none' END AS flag FROM users u"
            const result = converter.convert(sql, 'mysql', 'hive')
            const out = assertConverted(result)
            assert.ok(out.toUpperCase().includes('CASE'), 'CASE should be preserved')
            assert.ok(out.toUpperCase().includes('WHEN'), 'WHEN should be preserved')
            assert.ok(out.toUpperCase().includes('ELSE'), 'ELSE should be preserved')
            assert.ok(out.includes('SELECT COUNT(*)'), 'subquery inside CASE should be preserved')
        })
    })

    // ========================================================================
    // Nested / deep subqueries
    // ========================================================================

    suite('Nested and deep subqueries', () => {
        test('MySQL to Hive - nested scalar subquery (subquery within subquery)', () => {
            const sql = 'SELECT id, (SELECT COUNT(*) FROM orders WHERE user_id IN (SELECT id FROM users WHERE status = 1)) AS cnt FROM users'
            const result = converter.convert(sql, 'mysql', 'hive')
            const out = assertConverted(result)
            const selectCount = (out.match(/SELECT COUNT\(\*\)/g) || []).length
            assert.ok(selectCount >= 1, 'outer COUNT(*) should be present')
            assert.ok(out.toUpperCase().includes('IN (SELECT'), 'nested IN (SELECT ...) should be preserved')
        })

        test('MySQL to Hive - derived table in FROM with subquery', () => {
            const sql = 'SELECT t.user_id, t.cnt FROM (SELECT user_id, COUNT(*) AS cnt FROM orders GROUP BY user_id) t WHERE t.cnt > (SELECT AVG(c) FROM (SELECT COUNT(*) AS c FROM orders GROUP BY user_id) x)'
            const result = converter.convert(sql, 'mysql', 'hive')
            const out = assertConverted(result)
            assert.ok(out.toUpperCase().includes('GROUP BY'), 'GROUP BY in derived table should be preserved')
            assert.ok(out.toUpperCase().includes('AVG'), 'AVG in scalar subquery should be preserved')
        })
    })

    // ========================================================================
    // CTE / UNION with subqueries
    // ========================================================================

    suite('CTE and UNION with subqueries', () => {
        test('MySQL to Hive - CTE with scalar subquery in main query', () => {
            const sql = 'WITH active AS (SELECT id, name FROM users WHERE status = 1) SELECT id, (SELECT COUNT(*) FROM orders WHERE user_id = active.id) AS cnt FROM active'
            const result = converter.convert(sql, 'mysql', 'hive')
            const out = assertConverted(result)
            assert.ok(out.toUpperCase().includes('WITH'), 'WITH clause should be preserved')
            assert.ok(/active/i.test(out), 'CTE name should be preserved')
            assert.ok(out.includes('SELECT COUNT(*)'), 'scalar subquery referencing CTE should be preserved')
        })

        test('MySQL to Hive - UNION with scalar subquery on one side', () => {
            const sql = 'SELECT id, (SELECT COUNT(*) FROM orders WHERE user_id = u.id) AS c FROM users u UNION SELECT id, 0 AS c FROM archived_users'
            const result = converter.convert(sql, 'mysql', 'hive')
            const out = assertConverted(result)
            assert.ok(out.toUpperCase().includes('UNION'), 'UNION should be preserved')
            assert.ok(out.includes('SELECT COUNT(*)'), 'subquery on UNION side should be preserved')
        })
    })

    // ========================================================================
    // DML with subqueries
    // ========================================================================

    suite('DML with subqueries', () => {
        test('MySQL to Hive - UPDATE SET with scalar subquery', () => {
            const sql = 'UPDATE users SET status = (SELECT status FROM user_status WHERE user_id = 1) WHERE id = 1'
            const result = converter.convert(sql, 'mysql', 'hive')
            const out = assertConverted(result)
            assert.ok(out.toUpperCase().includes('UPDATE'), 'UPDATE should be preserved')
            assert.ok(out.toUpperCase().includes('SET'), 'SET should be preserved')
            assert.ok(unquoted(out).includes('SELECT status'), 'SET scalar subquery should be preserved')
        })

        test('MySQL to Hive - DELETE with IN subquery', () => {
            const sql = 'DELETE FROM users WHERE id IN (SELECT user_id FROM orders WHERE status = 0)'
            const result = converter.convert(sql, 'mysql', 'hive')
            const out = assertConverted(result)
            assert.ok(out.toUpperCase().includes('DELETE'), 'DELETE should be preserved')
            assert.ok(unquoted(out).includes('SELECT user_id'), 'DELETE IN-subquery should be preserved')
        })

        test('MySQL to Hive - INSERT SELECT with scalar subquery', () => {
            const sql = 'INSERT INTO report (user_id, order_count) SELECT id, (SELECT COUNT(*) FROM orders WHERE user_id = users.id) FROM users'
            const result = converter.convert(sql, 'mysql', 'hive')
            const out = assertConverted(result)
            assert.ok(out.toUpperCase().includes('INSERT INTO'), 'INSERT INTO should be preserved')
            assert.ok(out.includes('SELECT COUNT(*)'), 'INSERT SELECT scalar subquery should be preserved')
        })
    })

    // ========================================================================
    // Hive -> MySQL direction
    // ========================================================================

    suite('Hive to MySQL subquery conversion', () => {
        test('Hive to MySQL - basic scalar subquery in SELECT', () => {
            const sql = 'SELECT id, (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS order_count FROM users u'
            const result = converter.convert(sql, 'hive', 'mysql')
            const out = assertConverted(result)
            assert.ok(out.includes('SELECT COUNT(*)'), 'inner SELECT should be preserved')
            assert.ok(/order_count/i.test(out), 'column alias should be preserved')
        })

        test('Hive to MySQL - COALESCE in scalar subquery becomes IFNULL', () => {
            const sql = 'SELECT id, COALESCE((SELECT MAX(amount) FROM orders WHERE user_id = u.id), 0) AS mx FROM users u'
            const result = converter.convert(sql, 'hive', 'mysql')
            const out = assertConverted(result)
            assert.ok(out.toUpperCase().includes('IFNULL'), 'COALESCE should become IFNULL')
            assert.ok(out.toUpperCase().includes('MAX'), 'inner MAX should be preserved')
        })

        test('Hive to MySQL - IN subquery preserved', () => {
            const sql = 'SELECT id, name FROM users WHERE id IN (SELECT user_id FROM orders WHERE status = 1)'
            const result = converter.convert(sql, 'hive', 'mysql')
            const out = assertConverted(result)
            assert.ok(/\bIN\b/i.test(out), 'IN operator should be preserved')
            assert.ok(unquoted(out).includes('SELECT user_id'), 'IN-subquery should be preserved')
        })

        test('Hive to MySQL - EXISTS subquery preserved', () => {
            const sql = 'SELECT id, name FROM users u WHERE EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id)'
            const result = converter.convert(sql, 'hive', 'mysql')
            const out = assertConverted(result)
            assert.ok(/EXISTS/i.test(out), 'EXISTS should be preserved')
        })

        test('Hive to MySQL - nested subquery preserved', () => {
            const sql = 'SELECT id, (SELECT COUNT(*) FROM orders WHERE user_id IN (SELECT id FROM users WHERE status = 1)) AS cnt FROM users'
            const result = converter.convert(sql, 'hive', 'mysql')
            const out = assertConverted(result)
            assert.ok(out.toUpperCase().includes('IN (SELECT'), 'nested IN (SELECT ...) should be preserved')
        })
    })

    // ========================================================================
    // Round-trip stability
    // ========================================================================

    suite('Round-trip stability', () => {
        test('MySQL -> Hive -> MySQL preserves scalar subquery structure', () => {
            const sql = 'SELECT id, (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS order_count FROM users u'
            const toHive = converter.convert(sql, 'mysql', 'hive')
            const hiveOut = assertConverted(toHive)
            const backToMysql = converter.convert(hiveOut, 'hive', 'mysql')
            const mysqlOut = assertConverted(backToMysql)
            assert.ok(mysqlOut.includes('SELECT COUNT(*)'), 'subquery should survive round-trip')
            assert.ok(/order_count/i.test(mysqlOut), 'alias should survive round-trip')
        })

        test('Hive -> MySQL -> Hive preserves scalar subquery structure', () => {
            const sql = 'SELECT id, (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS order_count FROM users u'
            const toMysql = converter.convert(sql, 'hive', 'mysql')
            const mysqlOut = assertConverted(toMysql)
            const backToHive = converter.convert(mysqlOut, 'mysql', 'hive')
            const hiveOut = assertConverted(backToHive)
            assert.ok(hiveOut.includes('SELECT COUNT(*)'), 'subquery should survive round-trip')
        })
    })

    // ========================================================================
    // Known limitations / parser constraints
    // ========================================================================

    suite('Known parser limitations', () => {
        test('MySQL to Hive - LIMIT with subquery argument is not supported by parser', () => {
            const sql = "SELECT id FROM users LIMIT (SELECT cnt FROM config WHERE k = 'user_limit')"
            const result = converter.convert(sql, 'mysql', 'hive', { allowRegexFallback: false })
            assert.strictEqual(result.success, false, 'Parser should reject subquery as LIMIT argument')
            assert.ok(result.error !== null, 'Error should be reported')
        })

        test('Hive to MySQL - DISTRIBUTE BY is not parseable by Hive parser', () => {
            const sql = 'SELECT id, (SELECT COUNT(*) FROM orders WHERE user_id = u.id) AS cnt FROM users u DISTRIBUTE BY u.id'
            const result = converter.convert(sql, 'hive', 'mysql', { allowRegexFallback: false })
            assert.strictEqual(result.success, false, 'Hive parser should reject DISTRIBUTE BY in this context')
            assert.ok(result.error !== null, 'Error should be reported')
        })

        test('Fallback can rescue unparseable SQL when allowed', () => {
            const sql = 'SELECT id, (SELECT COUNT(*) FROM orders WHERE user_id = u.id) AS cnt FROM users u DISTRIBUTE BY u.id'
            const result = converter.convert(sql, 'hive', 'mysql', { allowRegexFallback: true })
            assert.strictEqual(result.success, true, 'Regex fallback should produce a result')
            assert.strictEqual(result.usedFallback, true, 'Should mark fallback as used')
        })
    })
})
