import type { SqlDialect } from './dialectMapper'

export class ParseError extends Error {
    readonly dialect: SqlDialect
    readonly sql: string
    readonly cause: unknown

    constructor(dialect: SqlDialect, sql: string, cause: unknown) {
        const message = cause instanceof Error ? cause.message : String(cause)
        super(`Failed to parse SQL (${dialect}): ${message}`)
        this.name = 'ParseError'
        this.dialect = dialect
        this.sql = sql
        this.cause = cause
    }
}
