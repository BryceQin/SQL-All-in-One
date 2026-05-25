import * as assert from 'assert'
import { getAstConverter } from '../converter/AstConverter'

suite('AstConverter Test Suite', () => {
    const converter = getAstConverter()

    test('convertCreateTable MySQL to Hive - basic types', () => {
        const sql = 'CREATE TABLE users (id INT, name VARCHAR(255), age INT);'
        const result = converter.convertCreateTable(sql, 'mysql', 'hive')
        assert.ok(result.includes('INT'), 'INT should remain INT')
        assert.ok(result.toLowerCase().includes('string'), 'VARCHAR(255) should become STRING')
        assert.ok(!result.toLowerCase().includes('varchar'), 'VARCHAR should be removed')
    })

    test('convertCreateTable MySQL to Hive - removes AUTO_INCREMENT', () => {
        const sql = 'CREATE TABLE users (id INT AUTO_INCREMENT, name VARCHAR(100));'
        const result = converter.convertCreateTable(sql, 'mysql', 'hive')
        assert.ok(!result.toLowerCase().includes('auto_increment'), 'AUTO_INCREMENT should be removed')
    })

    test('convertCreateTable MySQL to Hive - removes NOT NULL', () => {
        const sql = 'CREATE TABLE users (id INT NOT NULL, name VARCHAR(100));'
        const result = converter.convertCreateTable(sql, 'mysql', 'hive')
        assert.ok(!result.toUpperCase().includes('NOT NULL'), 'NOT NULL should be removed for Hive')
    })

    test('convertCreateTable MySQL to Hive - removes DEFAULT NULL', () => {
        const sql = 'CREATE TABLE users (id INT DEFAULT NULL, name VARCHAR(100));'
        const result = converter.convertCreateTable(sql, 'mysql', 'hive')
        assert.ok(!result.toUpperCase().includes('DEFAULT NULL'), 'DEFAULT NULL should be removed for Hive')
    })

    test('convertCreateTable MySQL to Hive - removes index/constraint definitions', () => {
        const sql = 'CREATE TABLE users (id INT, name VARCHAR(100), PRIMARY KEY (id), KEY idx_name (name));'
        const result = converter.convertCreateTable(sql, 'mysql', 'hive')
        assert.ok(!result.toLowerCase().includes('primary key'), 'PRIMARY KEY should be removed for Hive')
        assert.ok(!result.toLowerCase().includes('key idx_name'), 'KEY should be removed for Hive')
    })

    test('convertCreateTable MySQL to Hive - preserves COMMENT', () => {
        const sql = "CREATE TABLE users (id INT COMMENT 'user id', name VARCHAR(100) COMMENT 'user name');"
        const result = converter.convertCreateTable(sql, 'mysql', 'hive')
        assert.ok(result.includes('user id'), 'Column comment should be preserved')
        assert.ok(result.includes('user name'), 'Column comment should be preserved')
    })

    test('convertCreateTable MySQL to Hive - removes ENGINE table option', () => {
        const sql = "CREATE TABLE users (id INT) ENGINE=InnoDB COMMENT='test table';"
        const result = converter.convertCreateTable(sql, 'mysql', 'hive')
        assert.ok(!result.toLowerCase().includes('engine'), 'ENGINE should be removed for Hive')
        assert.ok(result.includes('test table'), 'COMMENT should be preserved')
    })

    test('convertCreateTable MySQL to Hive - DATETIME becomes TIMESTAMP', () => {
        const sql = 'CREATE TABLE events (id INT, created_at DATETIME);'
        const result = converter.convertCreateTable(sql, 'mysql', 'hive')
        assert.ok(result.toUpperCase().includes('TIMESTAMP'), 'DATETIME should become TIMESTAMP')
        assert.ok(!result.toUpperCase().includes('DATETIME'), 'DATETIME should be gone')
    })

    test('convertCreateTable MySQL to Hive - TEXT becomes STRING', () => {
        const sql = 'CREATE TABLE docs (id INT, content TEXT);'
        const result = converter.convertCreateTable(sql, 'mysql', 'hive')
        assert.ok(result.toUpperCase().includes('STRING'), 'TEXT should become STRING')
    })

    test('convertCreateTable MySQL to Hive - ENUM becomes STRING', () => {
        const sql = "CREATE TABLE items (id INT, status ENUM('active','inactive'));"
        const result = converter.convertCreateTable(sql, 'mysql', 'hive')
        assert.ok(result.toUpperCase().includes('STRING'), 'ENUM should become STRING')
        assert.ok(!result.toUpperCase().includes('ENUM'), 'ENUM should be gone')
    })

    test('convertCreateTable Hive to MySQL - STRING becomes VARCHAR(255)', () => {
        const sql = 'CREATE TABLE users (id INT, name STRING);'
        const result = converter.convertCreateTable(sql, 'hive', 'mysql')
        assert.ok(result.includes('VARCHAR(255)'), 'STRING should become VARCHAR(255)')
        assert.ok(!result.toUpperCase().includes('STRING'), 'STRING should be gone')
    })

    test('convertCreateTable Hive to MySQL - tryConvertCreateTable handles unsupported types', () => {
        const sql = 'CREATE TABLE flags (id INT, active BOOLEAN);'
        const result = converter.tryConvertCreateTable(sql, 'hive', 'mysql')
        assert.strictEqual(result.success, false, 'Should fail for unsupported Hive type BOOLEAN')
        assert.ok(result.error !== null, 'Error should not be null')
    })

    test('convertCreateTable Hive to MySQL - TIMESTAMP stays TIMESTAMP', () => {
        const sql = 'CREATE TABLE events (id INT, created_at TIMESTAMP);'
        const result = converter.convertCreateTable(sql, 'hive', 'mysql')
        assert.ok(result.toUpperCase().includes('TIMESTAMP'), 'TIMESTAMP should be preserved')
    })

    test('convertCreateTable Hive to MySQL - DATE stays DATE', () => {
        const sql = 'CREATE TABLE events (id INT, event_date DATE);'
        const result = converter.convertCreateTable(sql, 'hive', 'mysql')
        assert.ok(result.toUpperCase().includes('DATE'), 'DATE should be preserved')
    })

    test('convertCreateTable throws when no CREATE TABLE found', () => {
        const sql = 'SELECT * FROM users;'
        assert.throws(
            () => converter.convertCreateTable(sql, 'mysql', 'hive'),
            /No CREATE TABLE statement found/,
        )
    })

    test('tryConvertCreateTable returns success on valid input', () => {
        const sql = 'CREATE TABLE users (id INT, name VARCHAR(255));'
        const result = converter.tryConvertCreateTable(sql, 'mysql', 'hive')
        assert.strictEqual(result.success, true)
        assert.ok(result.result !== null)
        assert.strictEqual(result.error, null)
    })

    test('tryConvertCreateTable returns failure on invalid input', () => {
        const sql = 'SELECT * FROM users;'
        const result = converter.tryConvertCreateTable(sql, 'mysql', 'hive')
        assert.strictEqual(result.success, false)
        assert.strictEqual(result.result, null)
        assert.ok(result.error !== null)
    })

    test('convertCreateTable MySQL to Hive - DECIMAL preserves precision', () => {
        const sql = 'CREATE TABLE products (id INT, price DECIMAL(10, 2));'
        const result = converter.convertCreateTable(sql, 'mysql', 'hive')
        assert.ok(result.toUpperCase().includes('DECIMAL'), 'DECIMAL should be preserved')
    })

    test('convertCreateTable Hive to MySQL - removes Hive-specific table options', () => {
        const sql = "CREATE TABLE users (id INT, name STRING) STORED AS ORC TBLPROPERTIES ('key'='value');"
        const result = converter.tryConvertCreateTable(sql, 'hive', 'mysql')
        if (result.success && result.result) {
            assert.ok(!result.result.toUpperCase().includes('STORED AS'), 'STORED AS should be removed for MySQL')
        }
    })

    test('convertCreateTable MySQL to Hive - removes COLLATE from column', () => {
        const sql = "CREATE TABLE users (id INT, name VARCHAR(100) COLLATE utf8_general_ci);"
        const result = converter.convertCreateTable(sql, 'mysql', 'hive')
        assert.ok(!result.toLowerCase().includes('collate'), 'COLLATE should be removed for Hive')
    })

    test('convertCreateTable MySQL to Hive - removes CHARACTER SET from column', () => {
        const sql = "CREATE TABLE users (id INT, name VARCHAR(100) CHARACTER SET utf8);"
        const result = converter.convertCreateTable(sql, 'mysql', 'hive')
        assert.ok(!result.toLowerCase().includes('character set'), 'CHARACTER SET should be removed for Hive')
    })

    test('convertCreateTable MySQL to Hive - removes UNSIGNED suffix', () => {
        const sql = 'CREATE TABLE users (id INT UNSIGNED, age TINYINT UNSIGNED);'
        const result = converter.convertCreateTable(sql, 'mysql', 'hive')
        assert.ok(!result.toLowerCase().includes('unsigned'), 'UNSIGNED should be removed for Hive')
    })

    test('convertCreateTable preserves table comment for Hive', () => {
        const sql = "CREATE TABLE users (id INT, name VARCHAR(100)) COMMENT='user table';"
        const result = converter.convertCreateTable(sql, 'mysql', 'hive')
        assert.ok(result.includes('user table'), 'Table comment should be preserved')
    })

    test('convertCreateTable Hive to MySQL - tryConvertCreateTable handles ARRAY type', () => {
        const sql = 'CREATE TABLE data (id INT, tags ARRAY<STRING>);'
        const result = converter.tryConvertCreateTable(sql, 'hive', 'mysql')
        assert.strictEqual(result.success, false, 'Should fail for unsupported Hive type ARRAY')
    })
})
