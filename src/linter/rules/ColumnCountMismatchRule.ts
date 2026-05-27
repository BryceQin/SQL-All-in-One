import * as vscode from 'vscode'
import type { RuleContext } from './LintRule'
import { BaseRule } from './BaseRule'
import { isAstNode } from '../../parser/AstVisitor'
import { getNodeLocation } from '../../parser/astUtils'
import type { AstNode } from '../../parser/astTypes'

export class ColumnCountMismatchRule extends BaseRule {
    readonly id = 'avoid_column_count_mismatch'
    readonly applicableTypes = ['insert']
    readonly name = 'Column Count Mismatch'
    readonly description = 'linter.columnCountMismatch.description'
    readonly category = 'error-check'
    readonly defaultSeverity = vscode.DiagnosticSeverity.Error
    readonly defaultEnabled = true

    check(context: RuleContext): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = []
        const node = context.node

        const columns = node.columns
        const values = node.values

        if (!Array.isArray(columns) || columns.length === 0) {
            return diagnostics
        }

        let valueRows: unknown[] = []
        if (Array.isArray(values)) {
            valueRows = values
        } else if (values != null && typeof values === 'object') {
            const valuesObj = values as Record<string, unknown>
            if (valuesObj.type === 'values' && Array.isArray(valuesObj.values)) {
                valueRows = valuesObj.values
            }
        }

        if (valueRows.length === 0) {
            return diagnostics
        }

        const firstValue = valueRows[0]
        if (!isAstNode(firstValue)) {
            return diagnostics
        }
        const valueNode = firstValue as AstNode
        if (valueNode.type !== 'expr_list' || !Array.isArray(valueNode.value)) {
            return diagnostics
        }

        const colCount = columns.length
        const valCount = (valueNode.value as unknown[]).length

        if (colCount !== valCount) {
            const loc = getNodeLocation(node)
            if (loc) {
                diagnostics.push(this.addDiagnostic(loc, 6, 'linter.columnCountMismatch.description', String(colCount), String(valCount)))
            }
        }

        return diagnostics
    }
}
