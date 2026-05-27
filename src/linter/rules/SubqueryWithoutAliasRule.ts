import * as vscode from 'vscode'
import type { RuleContext } from './LintRule'
import { BaseRule } from './BaseRule'
import { isAstNode } from '../../parser/AstVisitor'
import { getNodeLocation, createDiagnostic } from '../../parser/astUtils'
import type { AstNode } from '../../parser/astTypes'
import { t } from '../../i18n'

export class SubqueryWithoutAliasRule extends BaseRule {
    readonly id = 'subquery_without_alias'
    readonly applicableTypes = ['select']
    readonly name = 'Subquery Without Alias'
    readonly description = 'enhanced.subqueryMissingAlias'
    readonly category = 'best-practices'
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
            const expr = fromEntry.expr
            if (isAstNode(expr) && (expr as AstNode).type === 'select') {
                const as = fromEntry.as
                if (as == null || (typeof as === 'string' && as.length === 0)) {
                    const loc = getNodeLocation(fromEntry)
                    if (loc) {
                        diagnostics.push(createDiagnostic(
                            loc, 4, 'SUBQUERY_WITHOUT_ALIAS',
                            t('enhanced.subqueryMissingAlias', String(loc.line)),
                            this.getSeverity(),
                            t('linter.source'),
                        ))
                    }
                }
            }
        }

        return diagnostics
    }
}
