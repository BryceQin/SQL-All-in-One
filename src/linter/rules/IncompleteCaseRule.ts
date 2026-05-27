import * as vscode from 'vscode'
import type { RuleContext } from './LintRule'
import { BaseRule } from './BaseRule'
import { isAstNode, findNodes } from '../../parser/AstVisitor'
import { getNodeLocation, createDiagnostic } from '../../parser/astUtils'
import type { AstNode } from '../../parser/astTypes'
import { t } from '../../i18n'

export class IncompleteCaseRule extends BaseRule {
    readonly id = 'incomplete_case'
    readonly applicableTypes = ['select']
    readonly name = 'Incomplete CASE'
    readonly description = 'enhanced.caseMissingEnd'
    readonly category = 'error-check'
    readonly defaultSeverity = vscode.DiagnosticSeverity.Warning
    readonly defaultEnabled = true

    check(context: RuleContext): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = []
        const node = context.node

        const caseNodes = findNodes(node, (n): n is AstNode => {
            return isAstNode(n) && (n as AstNode).type === 'case'
        })

        for (const caseNode of caseNodes) {
            const when = caseNode.when
            if (when == null || (Array.isArray(when) && when.length === 0)) {
                const loc = getNodeLocation(caseNode)
                if (loc) {
                    diagnostics.push(createDiagnostic(
                        loc, 4, 'INCOMPLETE_CASE',
                        t('enhanced.caseMissingEnd', String(loc.line)),
                        this.getSeverity(),
                        t('linter.source'),
                    ))
                }
            }
        }

        return diagnostics
    }
}
