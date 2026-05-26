import * as vscode from 'vscode'
import type { RuleContext } from './LintRule'
import { BaseRule } from './BaseRule'
import { isAstNode } from '../../parser/AstVisitor'
import { getNodeLocation } from '../../parser/astUtils'
import type { AstNode } from '../../parser/astTypes'

export class MissingColumnCommentRule extends BaseRule {
    readonly id = 'missing_column_comment'
    readonly applicableTypes = ['create']

    check(context: RuleContext): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = []
        const node = context.node

        if (node.keyword !== 'table') {
            return diagnostics
        }

        const createDefinitions = node.create_definitions
        if (!Array.isArray(createDefinitions)) {
            return diagnostics
        }

        const missingColumns: { name: string; node: AstNode }[] = []

        for (const def of createDefinitions) {
            if (!isAstNode(def)) {
                continue
            }
            const defNode = def as AstNode

            if (defNode.resource === 'constraint') {
                continue
            }

            const columnName = this.getColumnNameFromDefinition(defNode)
            if (columnName == null) {
                continue
            }

            const hasComment = this.definitionHasComment(defNode)
            if (!hasComment) {
                missingColumns.push({ name: columnName, node: defNode })
            }
        }

        if (missingColumns.length === 0) {
            return diagnostics
        }

        const cfg = vscode.workspace.getConfiguration('SQL-All-in-One')
        const aggregate = cfg.get<boolean>('lint.missing_column_comment_aggregate', true)

        if (aggregate && missingColumns.length > 1) {
            const loc = getNodeLocation(node)
            if (loc) {
                diagnostics.push(this.addDiagnostic(loc, 12, 'linter.createTableMissingComment.description', String(missingColumns.length)))
            }
        } else {
            for (const col of missingColumns) {
                const loc = getNodeLocation(col.node)
                if (loc) {
                    diagnostics.push(this.addDiagnostic(loc, col.name.length, 'linter.columnMissingComment.description', col.name))
                }
            }
        }

        return diagnostics
    }

    private getColumnNameFromDefinition(defNode: AstNode): string | null {
        const column = defNode.column
        if (isAstNode(column)) {
            const colNode = column as AstNode
            if (typeof colNode.value === 'string') {
                return colNode.value
            }
        }
        if (typeof column === 'string') {
            return column
        }
        return null
    }

    private definitionHasComment(defNode: AstNode): boolean {
        if (typeof defNode.comment === 'string') {
            return true
        }

        const suffixes = defNode.suffixes
        if (Array.isArray(suffixes)) {
            for (const suffix of suffixes) {
                if (isAstNode(suffix)) {
                    const suffixNode = suffix as AstNode
                    if (suffixNode.type === 'comment') {
                        return true
                    }
                }
            }
        }

        return false
    }
}
