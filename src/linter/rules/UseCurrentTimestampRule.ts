import * as vscode from 'vscode'
import type { RuleContext } from './LintRule'
import { BaseRule } from './BaseRule'
import { findNodesOfType } from '../../parser/AstVisitor'
import { getNodeLocation, getFunctionName } from '../../parser/astUtils'
import type { AstNode } from '../../parser/astTypes'

export class UseCurrentTimestampRule extends BaseRule {
    readonly id = 'use_current_timestamp'
    readonly applicableTypes = ['select']
    readonly name = 'Use CURRENT_TIMESTAMP'
    readonly description = 'linter.useCurrentTimestamp.description'
    readonly category = 'best-practices'
    readonly defaultSeverity = vscode.DiagnosticSeverity.Information
    readonly defaultEnabled = true

    private static readonly CURRENT_TIMESTAMP_FUNCTION_NAMES = new Set(['now', 'sysdate', 'getdate', 'current_date'])

    check(context: RuleContext): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = []
        const funcNodes = findNodesOfType<AstNode>(context.node, 'function')

        for (const func of funcNodes) {
            const name = getFunctionName(func)
            if (name && UseCurrentTimestampRule.CURRENT_TIMESTAMP_FUNCTION_NAMES.has(name.toLowerCase())) {
                const loc = getNodeLocation(func)
                if (loc) {
                    diagnostics.push(this.addDiagnostic(loc, name.length, 'linter.useCurrentTimestamp.description'))
                }
            }
        }

        return diagnostics
    }
}
