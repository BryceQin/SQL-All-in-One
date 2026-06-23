import * as vscode from 'vscode'
import { BaseRule } from './BaseRule'
import type { RuleContext } from './LintRule'
import { getColumnLoc } from '../../parser/astUtils'

export class ExplicitColumnAliasingRule extends BaseRule {
    readonly id = 'explicit_column_aliasing'
    readonly applicableTypes = ['select']
    readonly name = 'linter.missingAsKeyword.name'
    readonly description = 'linter.missingAsKeyword.description'
    readonly category = 'code-style'
    readonly defaultSeverity = vscode.DiagnosticSeverity.Information
    readonly defaultEnabled = false

    check(context: RuleContext): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = []
        const node = context.node
        const columns = node.columns
        if (!Array.isArray(columns)) {
            return diagnostics
        }

        const sql = context.sql
        const lines = sql.split('\n')

        for (const col of columns) {
            if (col == null || typeof col !== 'object') {
                continue
            }
            const colObj = col as Record<string, unknown>
            const as = colObj.as
            if (as === undefined || as === null) {
                continue
            }

            let aliasStr: string | null = null
            if (typeof as === 'string' && as.length > 0) {
                aliasStr = as
            } else if (typeof as === 'object') {
                const asObj = as as Record<string, unknown>
                if (typeof asObj.value === 'string' && asObj.value.length > 0) {
                    aliasStr = asObj.value
                }
            }

            if (aliasStr === null) {
                continue
            }

            const loc = getColumnLoc(colObj)
            if (!loc) {
                continue
            }

            const lineIdx = loc.line - 1
            if (lineIdx < 0 || lineIdx >= lines.length) {
                continue
            }
            const line = lines[lineIdx]
            const beforeAlias = line.substring(0, loc.column - 1 + (line.substring(loc.column - 1).indexOf(aliasStr) !== -1 ? line.substring(loc.column - 1).indexOf(aliasStr) : 0))
            const trimmed = beforeAlias.trimEnd()
            const lastTwoChars = trimmed.slice(-2).toLowerCase()

            if (lastTwoChars !== 'as' && !trimmed.endsWith('AS')) {
                diagnostics.push(this.addDiagnostic(loc, aliasStr.length, 'linter.missingAsKeyword.description', aliasStr))
            }
        }

        return diagnostics
    }
}