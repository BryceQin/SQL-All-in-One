import { Parser } from 'node-sql-parser'
import type { AST, TableColumnAst } from 'node-sql-parser'
import type { SqlDialect } from './dialectMapper'
import { toNodeSqlParserDialect } from './dialectMapper'
import { ParseError } from './ParseError'
import { getContainer, Tokens } from '../core/diContainer'

export interface ParseResult {
    ast: AST[] | AST
    tableList: string[]
    columnList: string[]
}

export class SqlParserEngine {
    private parser: Parser

    constructor() {
        this.parser = new Parser()
    }

    astify(sql: string, dialect: SqlDialect): AST[] | AST {
        try {
            return this.parser.astify(sql, {
                database: toNodeSqlParserDialect(dialect),
                parseOptions: { includeLocations: true },
            })
        } catch (e) {
            throw new ParseError(dialect, sql, e)
        }
    }

    sqlify(ast: AST[] | AST, dialect: SqlDialect): string {
        return this.parser.sqlify(ast, {
            database: toNodeSqlParserDialect(dialect),
        })
    }

    parse(sql: string, dialect: SqlDialect): ParseResult {
        try {
            const result: TableColumnAst = this.parser.parse(sql, {
                database: toNodeSqlParserDialect(dialect),
                parseOptions: { includeLocations: true },
            })
            return {
                ast: result.ast,
                tableList: result.tableList,
                columnList: result.columnList,
            }
        } catch (e) {
            throw new ParseError(dialect, sql, e)
        }
    }

    tryAstify(sql: string, dialect: SqlDialect): { success: boolean; ast: AST[] | AST | null; error: ParseError | null } {
        try {
            const ast = this.astify(sql, dialect)
            return { success: true, ast, error: null }
        } catch (e) {
            const error = e instanceof ParseError ? e : new ParseError(dialect, sql, e)
            return { success: false, ast: null, error }
        }
    }
}

export function createParserEngine(): SqlParserEngine {
    return new SqlParserEngine()
}

let engineInstance: SqlParserEngine | null = null

export function getParserEngine(): SqlParserEngine {
    const container = getContainer()
    if (container.has(Tokens.ParserEngine)) {
        return container.get<SqlParserEngine>(Tokens.ParserEngine)
    }
    if (!engineInstance) {
        engineInstance = new SqlParserEngine()
    }
    return engineInstance
}

export function resetParserEngine(): void {
    engineInstance = null
}
