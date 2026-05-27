import * as vscode from 'vscode'
import type { RuleContext } from './LintRule'
import { BaseRule } from './BaseRule'
import { isAstNode, findNodesOfType } from '../../parser/AstVisitor'
import { getNodeLocation, getColumnLoc } from '../../parser/astUtils'
import type { AstNode } from '../../parser/astTypes'

export class AvoidSelectStarRule extends BaseRule {
    readonly id = 'avoid_select_star'
    readonly applicableTypes = ['select']
    readonly name = 'Avoid SELECT *'
    readonly description = 'linter.avoidSelectStar.description'
    readonly category = 'code-style'
    readonly defaultSeverity = vscode.DiagnosticSeverity.Warning
    readonly defaultEnabled = true

    check(context: RuleContext): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = []
        const node = context.node
        const columns = node.columns
        if (!Array.isArray(columns)) {
            return diagnostics
        }

        for (const col of columns) {
            if (col == null || typeof col !== 'object') {
                continue
            }
            const colObj = col as Record<string, unknown>

            if (isAstNode(col)) {
                const colNode = col as AstNode
                if (colNode.type === 'column_ref' && colNode.column === '*') {
                    const loc = getNodeLocation(colNode)
                    if (loc) {
                        diagnostics.push(this.addDiagnostic(loc, 1, 'linter.avoidSelectStar.description'))
                    }
                    continue
                }
                if (colNode.type === 'star') {
                    const loc = getNodeLocation(colNode)
                    if (loc) {
                        diagnostics.push(this.addDiagnostic(loc, 1, 'linter.avoidSelectStar.description'))
                    }
                    continue
                }
            }

            const expr = colObj.expr
            if (expr != null && typeof expr === 'object') {
                const exprObj = expr as Record<string, unknown>
                if (exprObj.type === 'column_ref' && exprObj.column === '*') {
                    const loc = getColumnLoc(colObj)
                    if (loc) {
                        diagnostics.push(this.addDiagnostic(loc, 1, 'linter.avoidSelectStar.description'))
                    }
                    continue
                }
                if (exprObj.type === 'star') {
                    const loc = getColumnLoc(colObj)
                    if (loc) {
                        diagnostics.push(this.addDiagnostic(loc, 1, 'linter.avoidSelectStar.description'))
                    }
                    continue
                }
            }
        }

        const starNodes = findNodesOfType<AstNode>(node, 'star')
        for (const star of starNodes) {
            if (columns.includes(star as unknown)) {
                continue
            }
            const loc = getNodeLocation(star)
            if (loc) {
                diagnostics.push(this.addDiagnostic(loc, 1, 'linter.avoidSelectStar.description'))
            }
        }

        return diagnostics
    }
}
