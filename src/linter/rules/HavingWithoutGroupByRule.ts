import * as vscode from 'vscode'
import type { RuleContext } from './LintRule'
import { BaseRule } from './BaseRule'
import { getNodeLocation, createDiagnostic } from '../../parser/astUtils'
import type { AstNode } from '../../parser/astTypes'
import { t } from '../../i18n'

export class HavingWithoutGroupByRule extends BaseRule {
    readonly id = 'having_without_group_by'
    readonly applicableTypes = ['select']
    readonly name = 'HAVING Without GROUP BY'
    readonly description = 'enhanced.havingWithoutGroupBy'
    readonly category = 'error-check'
    readonly defaultSeverity = vscode.DiagnosticSeverity.Error
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
                diagnostics.push(createDiagnostic(
                    loc, 6, 'HAVING_WITHOUT_GROUPBY',
                    t('enhanced.havingWithoutGroupBy', String(loc.line)),
                    this.getSeverity(),
                    t('linter.source'),
                ))
            }
        }

        return diagnostics
    }
}
