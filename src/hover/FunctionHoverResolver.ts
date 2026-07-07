import * as vscode from 'vscode'
import type { SqlLanguage } from '../formatter/sqlFormatter'
import type { HoverResolver } from './HoverResolver'
import { buildFunctionMarkdown } from './hoverUtils'
import type { FunctionSignature } from '../completion/functionSignatures'
import * as allDialects from '../dialects/allDialects'

const _functionSigMap: Record<string, FunctionSignature[]> = {
    hive: allDialects.hiveFunctionSignatures,
    mysql: allDialects.mysqlFunctionSignatures,
    spark: allDialects.sparkFunctionSignatures,
    flinksql: allDialects.flinksqlFunctionSignatures,
    sql: allDialects.sqlFunctionSignatures,
    postgresql: allDialects.pgFunctionSignatures,
    bigquery: allDialects.bqFunctionSignatures,
    sqlite: allDialects.sqliteFunctionSignatures,
}

function getSignatures(dialect: string): FunctionSignature[] | undefined {
    return _functionSigMap[dialect]
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
