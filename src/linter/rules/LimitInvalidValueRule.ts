import * as vscode from 'vscode'
import type { RuleContext } from './LintRule'
import { BaseRule } from './BaseRule'
import { isAstNode } from '../../parser/AstVisitor'
import { getNodeLocation } from '../../parser/astUtils'
import type { AstNode } from '../../parser/astTypes'

export class LimitInvalidValueRule extends BaseRule {
    readonly id = 'limit_invalid_value'
    readonly applicableTypes = ['select']
    readonly name = 'linter.limitInvalidValue.name'
    readonly description = 'linter.limitInvalidValue.description'
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
                diagnostics.push(this.addDiagnostic(loc, 5, 'enhanced.limitWithoutNumber', String(loc.line)))
            }
        }

        return diagnostics
    }
}
