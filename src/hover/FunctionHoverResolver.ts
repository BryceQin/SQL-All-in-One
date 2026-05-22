import * as vscode from 'vscode'
import type { SqlLanguage } from '../formatter/sqlFormatter'
import type { HoverResolver } from './HoverResolver'
import { buildFunctionMarkdown } from './hoverUtils'
import type { FunctionSignature } from '../completion/functionSignatures'
import * as allDialects from '../languages/allDialects'

const functionSigMap: Record<string, FunctionSignature[]> = {
    hive: allDialects.hiveFunctionSignatures,
    mysql: allDialects.mysqlFunctionSignatures,
    spark: allDialects.sparkFunctionSignatures,
    sql: allDialects.sqlFunctionSignatures,
    postgresql: allDialects.pgFunctionSignatures,
    bigquery: allDialects.bqFunctionSignatures,
    snowflake: allDialects.sfFunctionSignatures,
    sqlite: allDialects.sqliteFunctionSignatures,
}

export class FunctionHoverResolver implements HoverResolver {
    resolve(word: string, dialect: SqlLanguage, _document: vscode.TextDocument, _position: vscode.Position): vscode.Hover | null {
        const signatures = functionSigMap[dialect]
        if (!signatures) return null

        const upperWord = word.toUpperCase()
        const fn = signatures.find(s => s.name.toUpperCase() === upperWord)
        if (!fn) return null

        const md = buildFunctionMarkdown(fn)
        return new vscode.Hover(md)
    }
}
