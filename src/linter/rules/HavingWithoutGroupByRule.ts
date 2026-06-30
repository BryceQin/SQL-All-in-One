import * as vscode from 'vscode'
import type { RuleContext } from './LintRule'
import { BaseRule } from './BaseRule'
import { getNodeLocation } from '../../parser/astUtils'
import type { AstNode } from '../../parser/astTypes'

export class HavingWithoutGroupByRule extends BaseRule {
    readonly id = 'having_without_group_by'
    readonly applicableTypes = ['select']
    readonly name = 'linter.havingWithoutGroupBy.name'
    readonly description = 'linter.havingWithoutGroupBy.description'
    readonly category = 'best-practices'
    readonly defaultSeverity = vscode.DiagnosticSeverity.Warning
    readonly defaultEnabled = true

    check(context: RuleContext): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = []
        const node = context.node

        if (node.having == null) {
            return diagnostics
        }

        const groupby = node.groupby
        if (groupby == null || (Array.isArray(groupby) && groupby.length === 0)) {
            const loc = getNodeLocation(node.having as AstNode) ?? getNodeLocation(node)
            if (loc) {
                diagnostics.push(this.addDiagnostic(loc, 6, 'enhanced.havingWithoutGroupBy', String(loc.line)))
            }
        }

        return diagnostics
    }
}
