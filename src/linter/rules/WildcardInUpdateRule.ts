import * as vscode from 'vscode'
import type { RuleContext } from './LintRule'
import { BaseRule } from './BaseRule'
import { isAstNode, findNodes } from '../../parser/AstVisitor'
import { getNodeLocation } from '../../parser/astUtils'
import type { AstNode } from '../../parser/astTypes'

export class WildcardInUpdateRule extends BaseRule {
    readonly id = 'wildcard_in_update'
    readonly applicableTypes = ['update']
    readonly name = 'linter.wildcardInUpdate.name'
    readonly description = 'linter.wildcardInUpdate.description'
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
                    diagnostics.push(this.addDiagnostic(loc, 1, 'enhanced.starInUpdate', String(loc.line)))
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
                        diagnostics.push(this.addDiagnostic(loc, 1, 'enhanced.starInUpdate', String(loc.line)))
                    }
                }
            }
        }

        return diagnostics
    }
}
