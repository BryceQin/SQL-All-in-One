import * as vscode from 'vscode'
import { BaseRule } from './BaseRule'
import type { RuleContext } from './LintRule'

export class ExplicitColumnAliasingRule extends BaseRule {
    readonly id = 'explicit_column_aliasing'
    readonly applicableTypes: string[] = []
    readonly name = 'Explicit Column Aliasing'
    readonly description = 'Use AS keyword for column aliases'
    readonly category = 'code-style'
    readonly defaultSeverity = vscode.DiagnosticSeverity.Information
    readonly defaultEnabled = false

    check(_context: RuleContext): vscode.Diagnostic[] {
        return []
    }
}