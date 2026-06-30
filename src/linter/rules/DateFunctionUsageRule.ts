import * as vscode from 'vscode'
import type { RuleContext } from './LintRule'
import { BaseRule } from './BaseRule'
import { isAstNode, findNodes } from '../../parser/AstVisitor'
import { getNodeLocation, getFunctionName } from '../../parser/astUtils'
import type { AstNode } from '../../parser/astTypes'

const DATE_FUNCTION_NAMES = new Set(['date_add', 'date_sub', 'now', 'sysdate'])

export class DateFunctionUsageRule extends BaseRule {
    readonly id = 'date_function_usage'
    readonly applicableTypes = ['select']
    readonly name = 'linter.dateFunctionUsage.name'
    readonly description = 'linter.dateFunctionUsage.description'
    readonly category = 'best-practices'
    readonly defaultSeverity = vscode.DiagnosticSeverity.Information
    readonly defaultEnabled = true

    check(context: RuleContext): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = []
        const node = context.node

        const funcNodes = findNodes(node, (n): n is AstNode => {
            return isAstNode(n) && (n as AstNode).type === 'function'
        })

        for (const func of funcNodes) {
            const name = getFunctionName(func)
            if (name && DATE_FUNCTION_NAMES.has(name.toLowerCase())) {
                const loc = getNodeLocation(func)
                if (loc) {
                    diagnostics.push(this.addDiagnostic(loc, name.length, 'enhanced.dateFunctionHint', name))
                }
            }
        }

        return diagnostics
    }
}
