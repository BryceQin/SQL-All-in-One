import * as vscode from 'vscode'
import { BaseRule } from './BaseRule'
import type { RuleContext } from './LintRule'

export class ExplicitColumnAliasingRule extends BaseRule {
    readonly id = 'explicit_column_aliasing'
    readonly applicableTypes: string[] = []
    readonly name = 'linter.missingAsKeyword.name'
    readonly description = 'linter.missingAsKeyword.description'
    readonly category = 'code-style'
    readonly defaultSeverity = vscode.DiagnosticSeverity.Information
    readonly defaultEnabled = false

    check(_context: RuleContext): vscode.Diagnostic[] {
        return []
    }
}