import * as vscode from "vscode"
import { AstLinter } from "./AstLinter"
import { toSqlDialect } from "../core/sqlDialects"
import { getAllRuleDefinitions, loadRuleConfigs, type LintRuleDefinition, type LintRuleConfig } from "../linter/lintRules"
import { resetRuleRegistry } from "../linter/RuleRegistry"

export type { LintRuleDefinition, LintRuleConfig }

export class SqlLinter {
    private config = loadRuleConfigs()
    private astLinter = new AstLinter()

    public getRules(): LintRuleDefinition[] {
        return getAllRuleDefinitions()
    }

    public isRuleEnabled(ruleId: string): boolean {
        return this.config.get(ruleId)?.enabled ?? false
    }

    public getRuleSeverity(ruleId: string): vscode.DiagnosticSeverity {
        return this.config.get(ruleId)?.severity ?? vscode.DiagnosticSeverity.Warning
    }

    public lint(text: string, document: vscode.TextDocument, preParsedAst?: unknown[]): vscode.Diagnostic[] {
        const dialect = toSqlDialect(document.languageId)
        return this.astLinter.lint(text, dialect, document, preParsedAst)
    }

    public resetConfig(): void {
        this.config = loadRuleConfigs()
        resetRuleRegistry()
        this.astLinter = new AstLinter()
    }
}
