import * as vscode from 'vscode'
import type { RuleContext } from './LintRule'
import { BaseRule } from './BaseRule'
import { isAstNode } from '../../parser/AstVisitor'
import { getNodeLocation } from '../../parser/astUtils'
import type { AstNode } from '../../parser/astTypes'

export class JoinMissingOnRule extends BaseRule {
    readonly id = 'join_missing_on'
    readonly applicableTypes = ['select']
    readonly name = 'linter.joinMissingOn.name'
    readonly description = 'linter.joinMissingOn.description'
    readonly category = 'error-check'
    readonly defaultSeverity = vscode.DiagnosticSeverity.Warning
    readonly defaultEnabled = true

    check(context: RuleContext): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = []
        const node = context.node

        const from = node.from
        if (!Array.isArray(from)) {
            return diagnostics
        }

        for (const entry of from) {
            if (!isAstNode(entry)) {
                continue
            }
            const fromEntry = entry as AstNode
            const join = fromEntry.join
            if (typeof join !== 'string') {
                continue
            }
            const joinUpper = join.toUpperCase()
            if (joinUpper.includes('CROSS') || joinUpper.includes('NATURAL')) {
                continue
            }
            if (fromEntry.on == null && fromEntry.using == null) {
                const loc = getNodeLocation(fromEntry)
                if (loc) {
                    diagnostics.push(this.addDiagnostic(loc, join.length, 'enhanced.joinMissingOn', String(loc.line)))
                }
            }
        }

        return diagnostics
    }
}
