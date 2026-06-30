import * as vscode from 'vscode'
import type { RuleContext } from './LintRule'
import { BaseRule } from './BaseRule'
import { isAstNode } from '../../parser/AstVisitor'
import { getNodeLocation, getFunctionName } from '../../parser/astUtils'
import type { AstNode } from '../../parser/astTypes'

const NO_FROM_FUNCTIONS = new Set([
    'now', 'current_date', 'current_timestamp', 'sysdate', 'uuid', 'getdate', 'current_time',
])

export class SelectWithoutFromRule extends BaseRule {
    readonly id = 'select_without_from'
    readonly applicableTypes = ['select']
    readonly name = 'linter.selectWithoutFrom.name'
    readonly description = 'linter.selectWithoutFrom.description'
    readonly category = 'best-practices'
    readonly defaultSeverity = vscode.DiagnosticSeverity.Warning
    readonly defaultEnabled = true

    check(context: RuleContext): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = []
        const node = context.node

        const from = node.from
        if (from != null && !(Array.isArray(from) && from.length === 0)) {
            return diagnostics
        }

        if (this.hasNoFromFunction(node)) {
            return diagnostics
        }

        const loc = getNodeLocation(node)
        if (loc) {
            diagnostics.push(this.addDiagnostic(loc, 6, 'enhanced.selectWithoutFrom', String(loc.line)))
        }

        return diagnostics
    }

    private hasNoFromFunction(node: AstNode): boolean {
        const columns = node.columns
        if (!Array.isArray(columns)) {
            return false
        }

        for (const col of columns) {
            if (isAstNode(col)) {
                const colNode = col as AstNode
                if (this.nodeContainsNoFromFunction(colNode)) {
                    return true
                }
            }
        }
        return false
    }

    private nodeContainsNoFromFunction(node: AstNode): boolean {
        if (node.type === 'function') {
            const name = getFunctionName(node)
            if (name && NO_FROM_FUNCTIONS.has(name.toLowerCase())) {
                return true
            }
        }
        for (const [key, value] of Object.entries(node)) {
            if (key === 'type' || key === 'loc') {
                continue;
            }
            if (isAstNode(value) && this.nodeContainsNoFromFunction(value as AstNode)) {
                return true
            }
            if (Array.isArray(value)) {
                for (const item of value) {
                    if (isAstNode(item) && this.nodeContainsNoFromFunction(item as AstNode)) {
                        return true
                    }
                }
            }
        }
        return false
    }
}
