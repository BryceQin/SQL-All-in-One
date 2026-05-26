import * as vscode from 'vscode'
import type { RuleContext } from './LintRule'
import { BaseRule } from './BaseRule'
import { walkAst, findNodes, isAstNode } from '../../parser/AstVisitor'
import { getNodeLocation } from '../../parser/astUtils'
import type { AstNode } from '../../parser/astTypes'

export class AvoidCorrelatedSubqueriesRule extends BaseRule {
    readonly id = 'avoid_correlated_subqueries'
    readonly applicableTypes = ['select']

    check(context: RuleContext): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = []
        const node = context.node
        const where = node.where
        if (where == null || !isAstNode(where)) {
            return diagnostics
        }

        const outerTables = this.collectFromTables(node)

        const subquerySelects = findNodes(where, (n): n is AstNode => {
            return isAstNode(n) && (n as AstNode).type === 'select'
        })

        for (const subSelect of subquerySelects) {
            if (this.isCorrelatedSubquery(subSelect, outerTables)) {
                const loc = getNodeLocation(subSelect)
                if (loc) {
                    diagnostics.push(this.addDiagnostic(loc, 6, 'linter.subqueryPerformance.description'))
                }
            }
        }

        return diagnostics
    }

    private isCorrelatedSubquery(subSelect: AstNode, outerTables: Set<string>): boolean {
        let correlated = false
        walkAst(subSelect, {
            enter(child) {
                if (correlated) return
                if (isAstNode(child)) {
                    const childNode = child as AstNode
                    if (childNode.type === 'column_ref' && typeof childNode.table === 'string') {
                        if (outerTables.has(childNode.table.toLowerCase())) {
                            correlated = true
                        }
                    }
                }
            },
        })
        return correlated
    }

    private collectFromTables(node: AstNode): Set<string> {
        const tables = new Set<string>()
        const from = node.from
        if (!Array.isArray(from)) {
            return tables
        }

        for (const entry of from) {
            if (!isAstNode(entry)) {
                continue
            }
            const fromEntry = entry as AstNode
            const table = fromEntry.table
            if (typeof table === 'string') {
                tables.add(table.toLowerCase())
            }
            const as = fromEntry.as
            if (typeof as === 'string' && as.length > 0) {
                tables.add(as.toLowerCase())
            }
        }
        return tables
    }
}
