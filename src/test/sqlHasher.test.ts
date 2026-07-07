import * as assert from 'assert'
import { hashSql, hashSqlFast } from '../parser/sqlHasher'

suite('SQL Hasher Tests', () => {

    test('hashSql 返回 64 位十六进制字符串', () => {
        const h = hashSql('SELECT 1')
        assert.match(h, /^[0-9a-f]{64}$/)
    })

    test('相同输入产生相同哈希', () => {
        assert.strictEqual(hashSql('SELECT 1'), hashSql('SELECT 1'))
    })

    test('中间修改产生不同哈希（关键特性）', () => {
        const sql1 = 'SELECT a, b, c, d, e FROM t WHERE id = 1 AND name = "test"'
        const sql2 = 'SELECT a, b, X, d, e FROM t WHERE id = 1 AND name = "test"'
        assert.notStrictEqual(hashSql(sql1), hashSql(sql2))
    })

    test('尾部修改产生不同哈希', () => {
        const sql1 = 'SELECT * FROM t LIMIT 10'
        const sql2 = 'SELECT * FROM t LIMIT 100'
        assert.notStrictEqual(hashSql(sql1), hashSql(sql2))
    })

    test('hashSqlFast 返回 32 位十六进制字符串', () => {
        const h = hashSqlFast('SELECT 1')
        assert.match(h, /^[0-9a-f]{32}$/)
    })

    test('hashSqlFast 相同输入产生相同哈希', () => {
        assert.strictEqual(hashSqlFast('SELECT 1'), hashSqlFast('SELECT 1'))
    })

    test('hashSqlFast 中间修改产生不同哈希', () => {
        const sql1 = 'SELECT a, b, c FROM t'
        const sql2 = 'SELECT a, X, c FROM t'
        assert.notStrictEqual(hashSqlFast(sql1), hashSqlFast(sql2))
    })

    test('空字符串哈希稳定', () => {
        assert.strictEqual(hashSql(''), hashSql(''))
        assert.strictEqual(hashSqlFast(''), hashSqlFast(''))
    })
})
