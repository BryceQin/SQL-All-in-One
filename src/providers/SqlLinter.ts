import * as vscode from "vscode"
import { AstLinter } from "./AstLinter"
import { toSqlDialect } from "../core/sqlDialects"
import { getAllRuleDefinitions, type LintRuleDefinition, type LintRuleConfig } from "../linter/lintRules"
import { getRuleRegistry } from "../linter/RuleRegistry"

export type { LintRuleDefinition, LintRuleConfig }

export class SqlLinter {
    private astLinter = new AstLinter()

    public getRules(): LintRuleDefinition[] {
        return getAllRuleDefinitions()
    }

    public isRuleEnabled(ruleId: string): boolean {
        const rule = getRuleRegistry().getRuleById(ruleId)
        return rule?.isEnabled() ?? false
    }

    public getRuleSeverity(ruleId: string): vscode.DiagnosticSeverity {
        const rule = getRuleRegistry().getRuleById(ruleId)
        return rule?.getSeverity() ?? vscode.DiagnosticSeverity.Warning
    }

    public lint(text: string, document: vscode.TextDocument, preParsedAst?: unknown[]): vscode.Diagnostic[] {
        const dialect = toSqlDialect(document.languageId)
        return this.astLinter.lint(text, dialect, document, preParsedAst)
    }

    public resetConfig(): void {
        getRuleRegistry().reloadConfig()
    }
}
