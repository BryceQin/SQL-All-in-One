import * as vscode from 'vscode'
import type { RuleContext } from './LintRule'
import { BaseRule } from './BaseRule'
import { isAstNode, findNodes, walkAst } from '../../parser/AstVisitor'
import { getNodeLocation, createDiagnostic } from '../../parser/astUtils'
import type { AstNode } from '../../parser/astTypes'
import { t } from '../../i18n'

export class AggregateInWhereRule extends BaseRule {
    readonly id = 'aggregate_in_where'
    readonly applicableTypes = ['select']
    readonly name = 'Aggregate In WHERE'
    readonly description = 'enhanced.aggregateInWhere'
    readonly category = 'error-check'
    readonly defaultSeverity = vscode.DiagnosticSeverity.Error
    readonly defaultEnabled = true

    check(context: RuleContext): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = []
        const node = context.node

        const where = node.where
        if (where == null || !isAstNode(where)) {
            return diagnostics
        }

        const aggrNodes = findNodes(where, (n): n is AstNode => {
            return isAstNode(n) && (n as AstNode).type === 'aggr_func'
        })

        for (const aggr of aggrNodes) {
            if (this.isInsideSubquery(aggr, where)) {
                continue
            }
            const loc = getNodeLocation(aggr)
            if (loc) {
                const name = typeof aggr.name === 'string' ? aggr.name : 'aggregate'
                diagnostics.push(createDiagnostic(
                    loc, name.length, 'AGGREGATE_IN_WHERE',
                    t('enhanced.aggregateInWhere', String(loc.line)),
                    this.getSeverity(),
                    t('linter.source'),
                ))
            }
        }

        return diagnostics
    }

    private isInsideSubquery(target: AstNode, root: unknown): boolean {
        const subquerySelects = findNodes(root, (n): n is AstNode => {
            return isAstNode(n) && (n as AstNode).type === 'select'
        })

        for (const subSelect of subquerySelects) {
            if (subSelect === target) {
                continue
            }
            if (this.isDescendantOf(target, subSelect)) {
                return true
            }
        }
        return false
    }

    private isDescendantOf(target: AstNode, ancestor: AstNode): boolean {
        let found = false
        walkAst(ancestor, {
            enter(child) {
                if (child === target) {
                    found = true
                }
            },
        })
        return found && target !== ancestor
    }
}
