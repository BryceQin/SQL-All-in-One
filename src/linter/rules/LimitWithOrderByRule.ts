import * as vscode from 'vscode'
import type { RuleContext } from './LintRule'
import { BaseRule } from './BaseRule'
import { getNodeLocation } from '../../parser/astUtils'

export class LimitWithOrderByRule extends BaseRule {
    readonly id = 'limit_with_order_by'
    readonly applicableTypes = ['select']

    check(context: RuleContext): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = []
        const limit = context.node.limit
        if (limit == null) {
            return diagnostics
        }
        const orderby = context.node.orderby
        if (orderby == null || (Array.isArray(orderby) && orderby.length === 0)) {
            const loc = getNodeLocation(context.node)
            if (loc) {
                diagnostics.push(this.addDiagnostic(loc, 5, 'linter.limitWithoutOrderBy.description'))
            }
        }
        return diagnostics
    }
}
