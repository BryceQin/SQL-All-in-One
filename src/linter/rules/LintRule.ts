import * as vscode from 'vscode'
import type { AstNode } from '../../parser/astTypes'
import type { SqlDialect } from '../../parser/dialectMapper'

export interface RuleContext {
    sql: string
    dialect: SqlDialect
    document?: vscode.TextDocument
    node: AstNode
}

export interface LintRule {
    readonly id: string
    readonly applicableTypes: string[]
    isEnabled(): boolean
    getSeverity(): vscode.DiagnosticSeverity
    check(context: RuleContext): vscode.Diagnostic[]
}
