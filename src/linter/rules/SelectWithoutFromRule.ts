import * as vscode from 'vscode'
import type { RuleContext } from './LintRule'
import { BaseRule } from './BaseRule'
import { isAstNode } from '../../parser/AstVisitor'
import { getNodeLocation, getFunctionName, createDiagnostic } from '../../parser/astUtils'
import type { AstNode } from '../../parser/astTypes'
import { t } from '../../i18n'

const NO_FROM_FUNCTIONS = new Set([
    'now', 'current_date', 'current_timestamp', 'sysdate', 'uuid', 'getdate', 'current_time',
])

export class SelectWithoutFromRule extends BaseRule {
    readonly id = 'select_without_from'
    readonly applicableTypes = ['select']
    readonly name = 'SELECT Without FROM'
    readonly description = 'enhanced.selectWithoutFrom'
    readonly category = 'error-check'
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
            diagnostics.push(createDiagnostic(
                loc, 6, 'SELECT_WITHOUT_FROM',
                t('enhanced.selectWithoutFrom', String(loc.line)),
                this.getSeverity(),
                t('linter.source'),
            ))
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
        for (const [, value] of Object.entries(node)) {
            if (value === 'type' || value === 'loc') {
                continue
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
