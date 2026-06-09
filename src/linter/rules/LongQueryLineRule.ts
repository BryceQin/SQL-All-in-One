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
        const lines = context.sql.split('\n')
        const cfgMgr = getConfigManager()
        const maxLength = cfgMgr.get<number>('singleLineMaxLength', 80)

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i]
            if (line.length > maxLength && !line.trimStart().startsWith('--') && !line.trimStart().startsWith('#')) {
                const loc = { line: i + 1, column: 0 }
                diagnostics.push(this.addDiagnostic(loc, line.length, 'linter.longSingleLine', String(i + 1), String(maxLength)))
            }
        }
        return diagnostics
    }
}