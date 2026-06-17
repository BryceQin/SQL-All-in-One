import * as vscode from 'vscode'
import type { SqlLanguage } from '../formatter/sqlFormatter'
import type { HoverResolver } from './HoverResolver'
import { buildFunctionMarkdown } from './hoverUtils'
import type { FunctionSignature } from '../completion/functionSignatures'
import * as allDialects from '../languages/allDialects'

const _functionSigMap: Record<string, () => FunctionSignature[]> = {
    hive: () => allDialects.hiveFunctionSignatures.get(),
    mysql: () => allDialects.mysqlFunctionSignatures.get(),
    spark: () => allDialects.sparkFunctionSignatures.get(),
    sql: () => allDialects.sqlFunctionSignatures.get(),
    postgresql: () => allDialects.pgFunctionSignatures.get(),
    bigquery: () => allDialects.bqFunctionSignatures.get(),
    sqlite: () => allDialects.sqliteFunctionSignatures.get(),
}

const resolvedCache = new Map<string, FunctionSignature[]>()

function getSignatures(dialect: string): FunctionSignature[] | undefined {
    const cached = resolvedCache.get(dialect)
    if (cached !== undefined) return cached
    const loader = _functionSigMap[dialect]
    if (!loader) return undefined
    const resolved = loader()
    resolvedCache.set(dialect, resolved)
    return resolved
}

export class FunctionHoverResolver implements HoverResolver {
    resolve(word: string, dialect: SqlLanguage, _document: vscode.TextDocument, _position: vscode.Position): vscode.Hover | null {
        const signatures = getSignatures(dialect)
        if (!signatures) return null

        const upperWord = word.toUpperCase()
        const fn = signatures.find(s => s.name.toUpperCase() === upperWord)
        if (!fn) return null

        const md = buildFunctionMarkdown(fn)
        return new vscode.Hover(md)
    }
}
