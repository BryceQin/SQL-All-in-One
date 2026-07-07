import type { AST } from 'node-sql-parser'
import type { SqlDialect } from './dialectMapper'
import { getParserEngine } from './SqlParserEngine'
import { splitSqlStatements } from './DocumentAstCache'
import type { ParseError } from './ParseError'

export interface StatementParseResult {
    /** 语句文本（含结尾分号） */
    text: string
    /** 在原 SQL 中的字符偏移范围 */
    startOffset: number
    endOffset: number
    /** 解析是否成功 */
    success: boolean
    /** 成功时的 AST（失败为 null） */
    ast: AST[] | AST | null
    /** 失败时的错误（成功为 null） */
    error: ParseError | null
}

/**
 * 将 SQL 文本按分号切分为多条语句，逐条解析。
 *
 * 与 SqlParserEngine.astify 的区别：
 * - 单条语句解析失败不会导致整体抛错
 * - 失败语句返回 error，其他语句正常返回 ast
 * - 用于支持多语句 SQL 文件的错误恢复（hover/completion/lint 不受单条错误影响）
 *
 * 语句切分复用 splitSqlStatements，已处理字符串/注释内的分号。
 */
export function parseMultiStatement(sql: string, dialect: SqlDialect): StatementParseResult[] {
    const statements = splitSqlStatements(sql)
    const engine = getParserEngine()
    const results: StatementParseResult[] = []

    for (const stmt of statements) {
        const trimmed = stmt.text.trim()
        if (!trimmed) continue

        const result = engine.tryAstify(trimmed, dialect)
        results.push({
            text: stmt.text,
            startOffset: stmt.start,
            endOffset: stmt.end,
            success: result.success,
            ast: result.ast,
            error: result.error,
        })
    }

    return results
}
