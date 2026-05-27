import * as vscode from 'vscode'
import type { RuleContext } from './LintRule'
import { BaseRule } from './BaseRule'
import { isAstNode } from '../../parser/AstVisitor'
import { getNodeLocation, createDiagnostic } from '../../parser/astUtils'
import type { AstNode } from '../../parser/astTypes'
import { t } from '../../i18n'

export class LimitInvalidValueRule extends BaseRule {
    readonly id = 'limit_invalid_value'
    readonly applicableTypes = ['select']
    readonly name = 'LIMIT Invalid Value'
    readonly description = 'enhanced.limitWithoutNumber'
    readonly category = 'error-check'
    readonly defaultSeverity = vscode.DiagnosticSeverity.Error
    readonly defaultEnabled = true

    check(context: RuleContext): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = []
        const node = context.node

        const limit = node.limit
        if (!isAstNode(limit)) {
            return diagnostics
        }

        const limitNode = limit as AstNode
        const value = limitNode.value
        if (typeof value === 'number' && value < 0) {
            const loc = getNodeLocation(limitNode) ?? getNodeLocation(node)
            if (loc) {
                diagnostics.push(createDiagnostic(
                    loc, 5, 'LIMIT_WITHOUT_NUMBER',
                    t('enhanced.limitWithoutNumber', String(loc.line)),
                    this.getSeverity(),
                    t('linter.source'),
                ))
            }
        }

        return diagnostics
    }
}
