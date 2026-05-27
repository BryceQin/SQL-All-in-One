import * as vscode from 'vscode'
import type { RuleContext } from './LintRule'
import { BaseRule } from './BaseRule'
import { isAstNode } from '../../parser/AstVisitor'
import { getNodeLocation, createDiagnostic } from '../../parser/astUtils'
import type { AstNode } from '../../parser/astTypes'
import { t } from '../../i18n'

export class MisplacedDistinctRule extends BaseRule {
    readonly id = 'misplaced_distinct'
    readonly applicableTypes = ['select']
    readonly name = 'Misplaced DISTINCT'
    readonly description = 'enhanced.distinctMisplaced'
    readonly category = 'error-check'
    readonly defaultSeverity = vscode.DiagnosticSeverity.Warning
    readonly defaultEnabled = true

    check(context: RuleContext): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = []
        const node = context.node

        const columns = node.columns
        if (!Array.isArray(columns) || columns.length < 2) {
            return diagnostics
        }

        if (node.distinct != null && node.distinct !== false) {
            return diagnostics
        }

        for (let i = 1; i < columns.length; i++) {
            const col = columns[i]
            if (!isAstNode(col)) {
                continue
            }
            const colNode = col as AstNode
            if (colNode.distinct === true) {
                const loc = getNodeLocation(colNode)
                if (loc) {
                    diagnostics.push(createDiagnostic(
                        loc, 8, 'MISPLACED_DISTINCT',
                        t('enhanced.distinctMisplaced', String(loc.line)),
                        this.getSeverity(),
                        t('linter.source'),
                    ))
                }
            }
        }

        return diagnostics
    }
}
