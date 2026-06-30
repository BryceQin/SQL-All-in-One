import type { AST, Create } from 'node-sql-parser'
import { getParserEngine } from '../parser/SqlParserEngine'
import type { SqlDialect } from '../parser/dialectMapper'
import { getDialectConverter } from './DialectConverter'

export interface ConvertResult {
    success: boolean
    result: string | null
    error: Error | null
    usedFallback: boolean
    warnings: string[]
}

class AstConverter {
    convertCreateTable(sql: string, fromDialect: SqlDialect, toDialect: SqlDialect): string {
        const result = getDialectConverter().convert(sql, fromDialect, toDialect)
        if (!result.success || result.result === null) {
            if (result.error) {
                throw result.error
            }
            throw new Error('Conversion failed')
        }

        // Reuse the AST produced by DialectConverter.convert when available;
        // only re-parse when convert did not surface one (e.g. same-dialect
        // short-circuit or fallback path).
        const ast = result.ast ?? getParserEngine().astify(sql, fromDialect)
        const astArray = Array.isArray(ast) ? ast : [ast]
        const hasCreateTable = astArray.some((node) => this.isCreateTableNode(node))
        if (!hasCreateTable) {
            throw new Error('No CREATE TABLE statement found in the input SQL')
        }

        return result.result
    }

    tryConvertCreateTable(sql: string, fromDialect: SqlDialect, toDialect: SqlDialect): ConvertResult {
        const result = getDialectConverter().tryConvert(sql, fromDialect, toDialect)
        if (!result.success) {
            return result
        }
        // Reuse the AST produced by DialectConverter.convert when available;
        // only re-parse when convert did not surface one.
        const ast = result.ast ?? getParserEngine().astify(sql, fromDialect)
        const nodes = Array.isArray(ast) ? ast : [ast]
        const hasCreateTable = nodes.some((node) => this.isCreateTableNode(node))
        if (!hasCreateTable) {
            return {
                success: false,
                result: null,
                error: new Error('No CREATE TABLE statement found in the input SQL'),
                usedFallback: false,
                warnings: [],
            }
        }
        return result
    }

    private isCreateTableNode(node: AST): node is Create {
        return (
            typeof node === 'object' &&
            node !== null &&
            'type' in node &&
            (node as Create).type === 'create' &&
            'keyword' in node &&
            (node as Create).keyword === 'table'
        )
    }
}

let converterInstance: AstConverter | null = null

export function getAstConverter(): AstConverter {
    if (!converterInstance) {
        converterInstance = new AstConverter()
    }
    return converterInstance
}

export { AstConverter }
