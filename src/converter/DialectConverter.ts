import type { AST } from 'node-sql-parser'
import { getParserEngine } from '../parser/SqlParserEngine'
import type { SqlDialect } from '../parser/dialectMapper'
import { AstTransformEngine } from './AstTransformEngine'
import { RegexFallbackConverter } from './RegexFallbackConverter'

export interface ConvertOptions {
    allowRegexFallback: boolean
}

export interface ConvertResult {
    success: boolean
    result: string | null
    error: Error | null
    usedFallback: boolean
    warnings: string[]
    /**
     * The AST produced while converting, when available. Carrying it on the
     * result lets callers that already need the AST (e.g.
     * {@link AstConverter} checking for CREATE TABLE) reuse it instead of
     * re-parsing the SQL a second time.
     *
     * Undefined when: the source and target dialect are identical (no parse
     * happened), the regex fallback was used, or astify/sqlify failed before
     * the AST was materialized.
     */
    ast?: AST[] | AST
}

function deepCloneAst(ast: AST[] | AST): AST[] | AST {
    return JSON.parse(JSON.stringify(ast)) as AST[] | AST
}

export class DialectConverter {
    private transformEngine = new AstTransformEngine()
    private fallbackConverter = new RegexFallbackConverter()

    convert(sql: string, from: SqlDialect, to: SqlDialect, options?: ConvertOptions): ConvertResult {
        if (from === to) {
            return { success: true, result: sql, error: null, usedFallback: false, warnings: [] }
        }

        try {
            const ast = getParserEngine().astify(sql, from)
            const astCopy = deepCloneAst(ast)
            const { warnings } = this.transformEngine.transform(astCopy, from, to)
            const result = getParserEngine().sqlify(astCopy, to)
            return { success: true, result, error: null, usedFallback: false, warnings, ast }
        } catch (e) {
            const error = e instanceof Error ? e : new Error(String(e))

            if (options?.allowRegexFallback) {
                try {
                    const fallbackResult = this.fallbackConverter.convert(sql, from, to)
                    return { success: true, result: fallbackResult, error: null, usedFallback: true, warnings: [] }
                } catch (fallbackErr) {
                    const fallbackError = fallbackErr instanceof Error ? fallbackErr : new Error(String(fallbackErr))
                    return { success: false, result: null, error: fallbackError, usedFallback: false, warnings: [] }
                }
            }

            return { success: false, result: null, error, usedFallback: false, warnings: [] }
        }
    }

    tryConvert(sql: string, from: SqlDialect, to: SqlDialect): ConvertResult {
        return this.convert(sql, from, to, { allowRegexFallback: false })
    }
}

let converterInstance: DialectConverter | null = null

export function getDialectConverter(): DialectConverter {
    if (!converterInstance) {
        converterInstance = new DialectConverter()
    }
    return converterInstance
}

export type { AST }
