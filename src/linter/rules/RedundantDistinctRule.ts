import * as vscode from 'vscode'
import type { RuleContext } from './LintRule'
import { BaseRule } from './BaseRule'
import { isAstNode, findNodes } from '../../parser/AstVisitor'
import { getNodeLocation, createDiagnostic } from '../../parser/astUtils'
import type { AstNode } from '../../parser/astTypes'
import { t } from '../../i18n'

export class RedundantDistinctRule extends BaseRule {
    readonly id = 'redundant_distinct'
    readonly applicableTypes = ['select']
    readonly name = 'Redundant DISTINCT'
    readonly description = 'enhanced.countDistinctStar'
    readonly category = 'performance'
    readonly defaultSeverity = vscode.DiagnosticSeverity.Warning
    readonly defaultEnabled = true

    check(context: RuleContext): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = []
        const node = context.node

        const aggrNodes = findNodes(node, (n): n is AstNode => {
            return isAstNode(n) && (n as AstNode).type === 'aggr_func'
        })

        for (const aggr of aggrNodes) {
            if (aggr.name !== 'count' || aggr.distinct !== true) {
                continue
            }
            const args = aggr.args
            if (this.argsContainStar(args)) {
                const loc = getNodeLocation(aggr)
                if (loc) {
                    diagnostics.push(createDiagnostic(
                        loc, 5, 'REDUNDANT_DISTINCT',
                        t('enhanced.countDistinctStar', String(loc.line)),
                        this.getSeverity(),
                        t('linter.source'),
                    ))
                }
            }
        }

        return diagnostics
    }

    private argsContainStar(args: unknown): boolean {
        if (isAstNode(args)) {
            const argsNode = args as AstNode
            if (argsNode.type === 'column_ref' && argsNode.column === '*') {
                return true
            }
            if (argsNode.type === 'star' || argsNode.type === 'all_columns') {
                return true
            }
            for (const [, value] of Object.entries(argsNode)) {
                if (value === 'type' || value === 'loc') {
                    continue
                }
                if (isAstNode(value) && this.argsContainStar(value)) {
                    return true
                }
                if (Array.isArray(value)) {
                    for (const item of value) {
                        if (this.argsContainStar(item)) {
                            return true
                        }
                    }
                }
            }
        }
        if (Array.isArray(args)) {
            for (const item of args) {
                if (this.argsContainStar(item)) {
                    return true
                }
            }
        }
        return false
    }
}
