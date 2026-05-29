import * as vscode from 'vscode'
import { BaseRule } from './BaseRule'
import type { RuleContext } from './LintRule'

export class UppercaseKeywordsRule extends BaseRule {
    readonly id = 'uppercase_keywords'
    readonly applicableTypes: string[] = []
    readonly name = 'Uppercase Keywords'
    readonly description = 'Keywords should be written in uppercase'
    readonly category = 'code-style'
    readonly defaultSeverity = vscode.DiagnosticSeverity.Information
    readonly defaultEnabled = false

    check(_context: RuleContext): vscode.Diagnostic[] {
        return []
    }
}