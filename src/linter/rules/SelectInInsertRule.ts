import * as vscode from 'vscode'
import type { RuleContext } from './LintRule'
import { BaseRule } from './BaseRule'
import { isAstNode } from '../../parser/AstVisitor'
import { getNodeLocation } from '../../parser/astUtils'
import type { AstNode } from '../../parser/astTypes'

export class SelectInInsertRule extends BaseRule {
    readonly id = 'avoid_select_in_insert'
    readonly applicableTypes = ['insert']

    check(context: RuleContext): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = []
        const node = context.node

        let selectNode: AstNode | null = null

        const selectProp = node.select
        if (isAstNode(selectProp)) {
            const sn = selectProp as AstNode
            if (sn.type === 'select') {
                selectNode = sn
            }
        }

        if (!selectNode) {
            const values = node.values
            if (values != null && typeof values === 'object' && !Array.isArray(values)) {
                const valuesObj = values as Record<string, unknown>
                if (isAstNode(valuesObj) && (valuesObj as AstNode).type === 'select') {
                    selectNode = valuesObj as AstNode
                }
            }
        }

        if (!selectNode) {
            return diagnostics
        }

        const hasStar = this.selectHasStar(selectNode)
        if (hasStar) {
            const loc = getNodeLocation(selectNode)
            if (loc) {
                diagnostics.push(this.addDiagnostic(loc, 1, 'linter.insertWithoutColumns.description'))
            }
        }

        return diagnostics
    }

    private selectHasStar(node: AstNode): boolean {
        const columns = node.columns
        if (!Array.isArray(columns)) {
            return false
        }
        for (const col of columns) {
            if (col == null || typeof col !== 'object') {
                continue
            }
            const colObj = col as Record<string, unknown>
            if (isAstNode(col)) {
                const colNode = col as AstNode
                if (colNode.type === 'column_ref' && colNode.column === '*') {
                    return true
                }
                if (colNode.type === 'star') {
                    return true
                }
            }
            const expr = colObj.expr
            if (expr != null && typeof expr === 'object') {
                const exprObj = expr as Record<string, unknown>
                if (exprObj.type === 'column_ref' && exprObj.column === '*') {
                    return true
                }
                if (exprObj.type === 'star') {
                    return true
                }
            }
        }
        return false
    }
}
