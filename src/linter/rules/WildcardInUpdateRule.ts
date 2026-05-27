import * as vscode from 'vscode'
import type { RuleContext } from './LintRule'
import { BaseRule } from './BaseRule'
import { isAstNode, findNodes } from '../../parser/AstVisitor'
import { getNodeLocation, createDiagnostic } from '../../parser/astUtils'
import type { AstNode } from '../../parser/astTypes'
import { t } from '../../i18n'

export class WildcardInUpdateRule extends BaseRule {
    readonly id = 'wildcard_in_update'
    readonly applicableTypes = ['update']
    readonly name = 'Wildcard In UPDATE'
    readonly description = 'enhanced.starInUpdate'
    readonly category = 'error-check'
    readonly defaultSeverity = vscode.DiagnosticSeverity.Error
    readonly defaultEnabled = true

    check(context: RuleContext): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = []
        const node = context.node

        if (node.type !== 'update') {
            return diagnostics
        }

        const set = node.set
        if (!Array.isArray(set)) {
            return diagnostics
        }

        for (const item of set) {
            if (!isAstNode(item)) {
                continue
            }
            const setItem = item as AstNode
            if (typeof setItem.column === 'string' && setItem.column === '*') {
                const loc = getNodeLocation(setItem)
                if (loc) {
                    diagnostics.push(createDiagnostic(
                        loc, 1, 'WILDCARD_IN_UPDATE',
                        t('enhanced.starInUpdate', String(loc.line)),
                        this.getSeverity(),
                        t('linter.source'),
                    ))
                }
            }
            const value = setItem.value
            if (isAstNode(value)) {
                const starRefs = findNodes(value, (n): n is AstNode => {
                    return isAstNode(n) && (n as AstNode).type === 'column_ref' && (n as AstNode).column === '*'
                })
                for (const ref of starRefs) {
                    const loc = getNodeLocation(ref)
                    if (loc) {
                        diagnostics.push(createDiagnostic(
                            loc, 1, 'WILDCARD_IN_UPDATE',
                            t('enhanced.starInUpdate', String(loc.line)),
                            this.getSeverity(),
                            t('linter.source'),
                        ))
                    }
                }
            }
        }

        return diagnostics
    }
}
