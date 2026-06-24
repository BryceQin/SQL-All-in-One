import * as assert from 'assert'
import { DialectConverter } from '../converter/DialectConverter'

suite('DialectConverter Integration Test Suite', () => {
    let converter: DialectConverter

    setup(() => {
        converter = new DialectConverter()
    })

    // ========================================================================
    // CREATE TABLE (backward compatibility with existing behavior)
    // ========================================================================

    suite('CREATE TABLE conversion', () => {

        test('MySQL to Hive - basic types', () => {
            const sql = 'CREATE TABLE users (id INT, name VARCHAR(255), age INT);'
            const result = converter.convert(sql, 'mysql', 'hive')
            assert.strictEqual(result.success, true)
            assert.ok(result.result)
            assert.ok(result.result!.toUpperCase().includes('INT'))
            assert.ok(result.result!.toUpperCase().includes('STRING'))
        })

        test('MySQL to Hive - removes AUTO_INCREMENT', () => {
            const sql = 'CREATE TABLE users (id INT AUTO_INCREMENT, name VARCHAR(100));'
            const result = converter.convert(sql, 'mysql', 'hive')
            assert.strictEqual(result.success, true)
            assert.ok(!result.result!.toLowerCase().includes('auto_increment'))
        })

        test('MySQL to Hive - removes NOT NULL', () => {
            const sql = 'CREATE TABLE users (id INT NOT NULL, name VARCHAR(100));'
            const result = converter.convert(sql, 'mysql', 'hive')
            assert.strictEqual(result.success, true)
            assert.ok(!result.result!.toUpperCase().includes('NOT NULL'))
        })

        test('MySQL to Hive - DATETIME becomes TIMESTAMP', () => {
            const sql = 'CREATE TABLE events (id INT, created_at DATETIME);'
            const result = converter.convert(sql, 'mysql', 'hive')
            assert.strictEqual(result.success, true)
            assert.ok(result.result!.toUpperCase().includes('TIMESTAMP'))
        })

        test('MySQL to Hive - removes ENGINE table option', () => {
            const sql = "CREATE TABLE users (id INT) ENGINE=InnoDB COMMENT='test table';"
            const result = converter.convert(sql, 'mysql', 'hive')
            assert.strictEqual(result.success, true)
            assert.ok(!result.result!.toLowerCase().includes('engine'))
        })

        test('MySQL to Hive - removes UNSIGNED suffix', () => {
            const sql = 'CREATE TABLE users (id INT UNSIGNED, age TINYINT UNSIGNED);'
            const result = converter.convert(sql, 'mysql', 'hive')
            assert.strictEqual(result.success, true)
            assert.ok(!result.result!.toLowerCase().includes('unsigned'))
        })

        test('Hive to MySQL - STRING becomes VARCHAR(255)', () => {
            const sql = 'CREATE TABLE users (id INT, name STRING);'
            const result = converter.convert(sql, 'hive', 'mysql')
            assert.strictEqual(result.success, true)
            assert.ok(result.result!.includes('VARCHAR(255)'))
        })

        test('Hive to MySQL - TIMESTAMP becomes DATETIME', () => {
            const sql = 'CREATE TABLE events (id INT, created_at TIMESTAMP);'
            const result = converter.convert(sql, 'hive', 'mysql')
            assert.strictEqual(result.success, true)
            assert.ok(result.result!.toUpperCase().includes('DATETIME'))
        })
    })

    // ========================================================================
    // SELECT with functions
    // ========================================================================

    suite('SELECT with function conversion', () => {

        test('MySQL to Hive - NOW() becomes CURRENT_TIMESTAMP', () => {
            const sql = 'SELECT id, NOW() AS created_time FROM users'
            const result = converter.convert(sql, 'mysql', 'hive')
            assert.strictEqual(result.success, true)
            assert.ok(result.result!.toUpperCase().includes('CURRENT_TIMESTAMP'))
        })

        test('MySQL to Hive - IFNULL becomes COALESCE', () => {
            const sql = "SELECT IFNULL(name, 'unknown') FROM users"
            const result = converter.convert(sql, 'mysql', 'hive')
            assert.strictEqual(result.success, true)
            assert.ok(result.result!.toUpperCase().includes('COALESCE'))
        })

        test('MySQL to Hive - IF becomes CASE WHEN', () => {
            const sql = "SELECT IF(status = 1, 'active', 'inactive') FROM users"
            const result = converter.convert(sql, 'mysql', 'hive')
            assert.strictEqual(result.success, true)
            assert.ok(result.result!.toUpperCase().includes('CASE'))
            assert.ok(result.result!.toUpperCase().includes('WHEN'))
        })

        test('Hive to MySQL - CURRENT_TIMESTAMP becomes NOW', () => {
            const sql = 'SELECT CURRENT_TIMESTAMP FROM users'
            const result = converter.convert(sql, 'hive', 'mysql')
            assert.strictEqual(result.success, true)
            assert.ok(result.result!.toUpperCase().includes('NOW'))
        })
    })

    // ========================================================================
    // INSERT / UPDATE / DELETE
    // ========================================================================

    suite('DML statement conversion', () => {

        test('MySQL to Hive - INSERT VALUES', () => {
            const sql = "INSERT INTO users (id, name) VALUES (1, 'alice')"
            const result = converter.convert(sql, 'mysql', 'hive')
            assert.strictEqual(result.success, true)
            assert.ok(result.result!.toUpperCase().includes('INSERT'))
        })

        test('MySQL to Hive - INSERT SELECT', () => {
            const sql = 'INSERT INTO target SELECT id, NOW() FROM source'
            const result = converter.convert(sql, 'mysql', 'hive')
            assert.strictEqual(result.success, true)
            assert.ok(result.result!.toUpperCase().includes('CURRENT_TIMESTAMP'))
        })

        test('MySQL to Hive - UPDATE with function', () => {
            const sql = "UPDATE users SET updated_at = NOW() WHERE id = 1"
            const result = converter.convert(sql, 'mysql', 'hive')
            assert.strictEqual(result.success, true)
            assert.ok(result.result!.toUpperCase().includes('CURRENT_TIMESTAMP'))
        })

        test('MySQL to Hive - DELETE', () => {
            const sql = 'DELETE FROM users WHERE id = 1'
            const result = converter.convert(sql, 'mysql', 'hive')
            assert.strictEqual(result.success, true)
            assert.ok(result.result!.toUpperCase().includes('DELETE'))
        })

        test('MySQL to Hive - CREATE VIEW', () => {
            const sql = 'CREATE VIEW active_users AS SELECT id, NOW() FROM users WHERE status = 1'
            const result = converter.convert(sql, 'mysql', 'hive')
            assert.strictEqual(result.success, true)
            assert.ok(result.result!.toUpperCase().includes('CURRENT_TIMESTAMP'))
        })
    })

    // ========================================================================
    // Fallback behavior
    // ========================================================================

    suite('Fallback behavior', () => {

        test('returns failure when AST cannot parse (no fallback)', () => {
            const sql = 'this is not valid sql !!! @@@'
            const result = converter.convert(sql, 'mysql', 'hive', { allowRegexFallback: false })
            assert.strictEqual(result.success, false)
            assert.strictEqual(result.usedFallback, false)
            assert.ok(result.error !== null)
        })

        test('uses regex fallback when allowed', () => {
            const sql = 'SELECT NOW() FROM users'
            const result = converter.convert(sql, 'mysql', 'hive', { allowRegexFallback: true })
            assert.strictEqual(result.success, true)
        })

        test('tryConvert does not use fallback', () => {
            const sql = 'this is not valid sql !!! @@@'
            const result = converter.tryConvert(sql, 'mysql', 'hive')
            assert.strictEqual(result.success, false)
            assert.strictEqual(result.usedFallback, false)
        })

        test('same dialect returns input unchanged', () => {
            const sql = 'SELECT * FROM users'
            const result = converter.convert(sql, 'mysql', 'mysql')
            assert.strictEqual(result.success, true)
            assert.strictEqual(result.result, sql)
        })
    })

    // ========================================================================
    // Warnings
    // ========================================================================

    suite('Warnings', () => {

        test('warnings array is empty for simple conversions', () => {
            const sql = 'CREATE TABLE users (id INT, name VARCHAR(255));'
            const result = converter.convert(sql, 'mysql', 'hive')
            assert.strictEqual(result.success, true)
            assert.strictEqual(result.warnings.length, 0)
        })
    })
})
