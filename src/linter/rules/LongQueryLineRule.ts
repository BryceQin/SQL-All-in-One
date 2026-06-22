import * as vscode from 'vscode'
import { BaseRule } from './BaseRule'
import type { RuleContext } from './LintRule'
import { getConfigManager } from '../../core/configManager'

export class LongQueryLineRule extends BaseRule {
    readonly id = 'long_query_line'
    readonly applicableTypes: string[] = []
    readonly name = 'linter.longSingleLine.name'
    readonly description = 'linter.longSingleLine.description'
    readonly category = 'code-style'
    readonly defaultSeverity = vscode.DiagnosticSeverity.Information
    readonly defaultEnabled = false

    check(context: RuleContext): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = []
        const sql = context.sql
        const cfgMgr = getConfigManager()
        const maxLength = cfgMgr.get<number>('singleLineMaxLength', 80)

        let lineStart = 0
        let lineNum = 1
        const len = sql.length

        for (let i = 0; i <= len; i++) {
            if (i === len || sql.charCodeAt(i) === 10) {
                const lineLength = i - lineStart
                if (lineLength > maxLength) {
                    const trimmedStart = lineStart
                    let trimEnd = trimmedStart
                    while (trimEnd < i && (sql.charCodeAt(trimEnd) === 32 || sql.charCodeAt(trimEnd) === 9)) {
                        trimEnd++
                    }
                    const firstTwo = sql.substring(trimEnd, trimEnd + 2)
                    if (firstTwo !== '--' && sql.charCodeAt(trimEnd) !== 35) {
                        const loc = { line: lineNum, column: 0 }
                        diagnostics.push(this.addDiagnostic(loc, lineLength, 'linter.longSingleLine', String(lineNum), String(maxLength)))
                    }
                }
                lineStart = i + 1
                lineNum++
            }
        }
        return diagnostics
    }
}