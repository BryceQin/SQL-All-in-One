import * as vscode from 'vscode'
import type { RuleContext } from './LintRule'
import { BaseRule } from './BaseRule'
import { findNodesOfType } from '../../parser/AstVisitor'
import { getNodeLocation, getFunctionName } from '../../parser/astUtils'
import type { AstNode } from '../../parser/astTypes'

export class UseCoalesceOverIsNullRule extends BaseRule {
    readonly id = 'use_coalesce_over_isnull'
    readonly applicableTypes = ['select']
    readonly name = 'Use COALESCE Over ISNULL'
    readonly description = 'linter.useCoalesce.description'
    readonly category = 'best-practices'
    readonly defaultSeverity = vscode.DiagnosticSeverity.Information
    readonly defaultEnabled = false

    private static readonly ISNULL_FUNCTION_NAMES = new Set(['ifnull', 'isnull'])

    check(context: RuleContext): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = []
        const funcNodes = findNodesOfType<AstNode>(context.node, 'function')

        for (const func of funcNodes) {
            const name = getFunctionName(func)
            if (name && UseCoalesceOverIsNullRule.ISNULL_FUNCTION_NAMES.has(name.toLowerCase())) {
                const loc = getNodeLocation(func)
                if (loc) {
                    diagnostics.push(this.addDiagnostic(loc, name.length, 'linter.useCoalesce.description'))
                }
            }
        }

        return diagnostics
    }
}
