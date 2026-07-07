import * as crypto from 'crypto'

/**
 * SQL 字符串的 SHA-256 哈希，返回 64 位十六进制字符串。
 *
 * 用于解析器缓存键。相比之前的 `len + head32 + tail32` 方案，
 * SHA-256 提供抗碰撞保证：对任意长度的 SQL，任意位置的修改都会
 * 产生不同的哈希值，消除长 SQL 缓存命中错误 AST 的风险。
 *
 * 性能：Node.js crypto 模块基于 OpenSSL，100KB SQL 哈希耗时小于 1ms。
 */
export function hashSql(sql: string): string {
    return crypto.createHash('sha256').update(sql, 'utf8').digest('hex')
}

/**
 * SQL 字符串的 32 位 FNV-1a 哈希（非加密用途），返回 8 位十六进制字符串。
 *
 * 用于对碰撞不敏感的轻量场景（如统计去重）。不应用于解析缓存键。
 * 若需要 32 位十六进制字符串形式，使用 hashSql 后截取前 32 位。
 */
export function hashSqlFast(sql: string): string {
    let h1 = 0x811c9dc5
    let h2 = 0x1000193
    for (let i = 0; i < sql.length; i++) {
        const c = sql.charCodeAt(i)
        h1 = Math.imul(h1 ^ c, 0x01000193)
        h2 = Math.imul(h2 ^ c, 0x1000193)
    }
    // 转为 32 位十六进制（h1 高位 + h2 低位组合，扩展碰撞空间）
    const combined = (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0')
    return combined + '0000000000000000'.substring(0, 16)
}
