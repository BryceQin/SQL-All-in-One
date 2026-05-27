import * as vscode from 'vscode'
import type { RuleContext } from './LintRule'
import { BaseRule } from './BaseRule'
import { getLocFromAny } from '../../parser/astUtils'

export class ExplicitJoinTypeRule extends BaseRule {
    readonly id = 'explicit_join_type'
    readonly applicableTypes = ['select']
    readonly name = 'Explicit Join Type'
    readonly description = 'linter.explicitJoinType.description'
    readonly category = 'code-style'
    readonly defaultSeverity = vscode.DiagnosticSeverity.Information
    readonly defaultEnabled = true

    check(context: RuleContext): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = []
        const from = context.node.from
        if (!Array.isArray(from)) {
            return diagnostics
        }

        for (const entry of from) {
            if (entry == null || typeof entry !== 'object') {
                continue
            }
            const fromEntry = entry as Record<string, unknown>
            const join = fromEntry.join
            if (typeof join !== 'string') {
                continue
            }
            const joinUpper = join.toUpperCase()
            if (joinUpper === 'JOIN' || joinUpper === 'INNER JOIN') {
                const loc = getLocFromAny(fromEntry)
                if (loc) {
                    diagnostics.push(this.addDiagnostic(loc, 4, 'linter.explicitJoinType.description'))
                }
            }
        }

        return diagnostics
    }
}
