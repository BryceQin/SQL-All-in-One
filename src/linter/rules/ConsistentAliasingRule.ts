import * as vscode from 'vscode'
import { BaseRule } from './BaseRule'
import type { RuleContext } from './LintRule'

export class ConsistentAliasingRule extends BaseRule {
    readonly id = 'consistent_aliasing'
    readonly applicableTypes: string[] = []
    readonly name = 'Consistent Aliasing'
    readonly description = 'Use consistent aliasing patterns across queries'
    readonly category = 'code-style'
    readonly defaultSeverity = vscode.DiagnosticSeverity.Information
    readonly defaultEnabled = false

    check(_context: RuleContext): vscode.Diagnostic[] {
        return []
    }
}