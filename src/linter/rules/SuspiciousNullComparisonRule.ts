import * as vscode from 'vscode'
import type { RuleContext } from './LintRule'
import { BaseRule } from './BaseRule'
import { isAstNode, findNodes } from '../../parser/AstVisitor'
import { getNodeLocation, createDiagnostic } from '../../parser/astUtils'
import type { AstNode } from '../../parser/astTypes'
import { t } from '../../i18n'

export class SuspiciousNullComparisonRule extends BaseRule {
    readonly id = 'suspicious_null_comparison'
    readonly applicableTypes = ['select']
    readonly name = 'Suspicious NULL Comparison'
    readonly description = 'enhanced.nullComparison'
    readonly category = 'error-check'
    readonly defaultSeverity = vscode.DiagnosticSeverity.Warning
    readonly defaultEnabled = true

    check(context: RuleContext): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = []
        const node = context.node

        const binaryNodes = findNodes(node, (n): n is AstNode => {
            return isAstNode(n) && (n as AstNode).type === 'binary_expr'
        })

        for (const binary of binaryNodes) {
            const op = binary.operator
            if (op !== '=' && op !== '!=' && op !== '<>') {
                continue
            }
            const right = binary.right
            if (isAstNode(right) && (right as AstNode).type === 'null') {
                const loc = getNodeLocation(binary)
                if (loc) {
                    const suggestion = op === '=' ? 'IS NULL' : 'IS NOT NULL'
                    diagnostics.push(createDiagnostic(
                        loc, 4, 'SUSPICIOUS_NULL_COMPARISON',
                        t('enhanced.nullComparison', String(loc.line), suggestion, op),
                        this.getSeverity(),
                        t('linter.source'),
                    ))
                }
            }
        }

        return diagnostics
    }
}
