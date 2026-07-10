import * as vscode from "vscode";
import { AstLinter, type LintCancellationToken } from "./AstLinter";
import { toSqlDialect } from "../core/sqlDialects";
import { getAllRuleDefinitions, type LintRuleDefinition, type LintRuleConfig } from "../linter/lintRules";
import { getRuleRegistry } from "../linter/RuleRegistry";

export type { LintRuleDefinition, LintRuleConfig, LintCancellationToken };

export class SqlLinter {
    private astLinter = new AstLinter();

    public getRules(): LintRuleDefinition[] {
        return getAllRuleDefinitions();
    }

    public isRuleEnabled(ruleId: string): boolean {
        const rule = getRuleRegistry().getRuleById(ruleId);
        return rule?.isEnabled() ?? false;
    }

    public getRuleSeverity(ruleId: string): vscode.DiagnosticSeverity {
        const rule = getRuleRegistry().getRuleById(ruleId);
        return rule?.getSeverity() ?? vscode.DiagnosticSeverity.Warning;
    }

    public lint(text: string, document: vscode.TextDocument, preParsedAst?: unknown[]): vscode.Diagnostic[] {
        const dialect = toSqlDialect(document.languageId);
        return this.astLinter.lint(text, dialect, document, preParsedAst);
    }

    /**
     * Async variant of {@link lint} that periodically yields to the event loop
     * (via `setImmediate`) so that linting large SQL files does not block the
     * extension host / main thread.
     *
     * The diagnostic output is identical to {@link lint}. Pass a
     * `vscode.CancellationToken` (or any object with an
     * `isCancellationRequested` flag) to enable cooperative cancellation:
     * when cancelled, the rules collected so far are returned and the caller
     * is expected to discard them.
     */
    public async lintAsync(
        text: string,
        document: vscode.TextDocument,
        preParsedAst?: unknown[],
        token?: LintCancellationToken,
    ): Promise<vscode.Diagnostic[]> {
        const dialect = toSqlDialect(document.languageId);
        return this.astLinter.lintAsync(text, dialect, document, preParsedAst, token);
    }

    public resetConfig(): void {
        getRuleRegistry().reloadConfig();
    }
}
