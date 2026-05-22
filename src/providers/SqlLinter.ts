import * as vscode from "vscode"
import { AstLinter } from "./AstLinter"
import { toSqlDialect } from "../core/sqlDialects"
import { t } from "../i18n"

export interface LintRule {
    id: string
    name: string
    description: string
    defaultSeverity: vscode.DiagnosticSeverity
    defaultEnabled: boolean
    category: string
}

export interface LintRuleConfig {
    enabled: boolean
    severity: vscode.DiagnosticSeverity
}

export class SqlLinter {
    private rules = new Map<string, LintRule>()
    private config = new Map<string, LintRuleConfig>()

    constructor() {
        this.registerBuiltInRules()
        this.loadConfig()
    }

    private registerBuiltInRules(): void {
        const builtInRules: LintRule[] = [
            { id: "avoid_select_star", name: t('linter.avoidSelectStar.name'), description: t('linter.avoidSelectStar.description'), defaultSeverity: vscode.DiagnosticSeverity.Warning, defaultEnabled: true, category: "code-style" },
            { id: "explicit_join_type", name: t('linter.explicitJoinType.name'), description: t('linter.explicitJoinType.description'), defaultSeverity: vscode.DiagnosticSeverity.Information, defaultEnabled: true, category: "code-style" },
            { id: "uppercase_keywords", name: "关键字大写", description: "建议 SQL 关键字使用大写", defaultSeverity: vscode.DiagnosticSeverity.Information, defaultEnabled: false, category: "code-style" },
            { id: "consistent_aliasing", name: "一致的别名", description: "建议使用有意义的表别名", defaultSeverity: vscode.DiagnosticSeverity.Information, defaultEnabled: false, category: "code-style" },
            { id: "limit_with_order_by", name: t('linter.limitWithoutOrderBy.name'), description: t('linter.limitWithoutOrderBy.description'), defaultSeverity: vscode.DiagnosticSeverity.Warning, defaultEnabled: true, category: "best-practices" },
            { id: "avoid_column_count_mismatch", name: t('linter.columnCountMismatch.name'), description: t('linter.columnCountMismatch.description'), defaultSeverity: vscode.DiagnosticSeverity.Error, defaultEnabled: true, category: "error-check" },
            { id: "use_coalesce_over_isnull", name: t('linter.useCoalesce.name'), description: t('linter.useCoalesce.description'), defaultSeverity: vscode.DiagnosticSeverity.Information, defaultEnabled: false, category: "best-practices" },
            { id: "explicit_column_aliasing", name: t('linter.missingAsKeyword.name'), description: t('linter.missingAsKeyword.description'), defaultSeverity: vscode.DiagnosticSeverity.Information, defaultEnabled: false, category: "code-style" },
            { id: "avoid_correlated_subqueries", name: t('linter.subqueryPerformance.name'), description: t('linter.subqueryPerformance.description'), defaultSeverity: vscode.DiagnosticSeverity.Warning, defaultEnabled: false, category: "performance" },
            { id: "missing_primary_key", name: t('linter.createTableWithoutPK.name'), description: t('linter.createTableWithoutPK.description'), defaultSeverity: vscode.DiagnosticSeverity.Warning, defaultEnabled: true, category: "best-practices" },
            { id: "use_current_timestamp", name: t('linter.useCurrentTimestamp.name'), description: t('linter.useCurrentTimestamp.description'), defaultSeverity: vscode.DiagnosticSeverity.Information, defaultEnabled: true, category: "best-practices" },
            { id: "avoid_select_in_insert", name: t('linter.insertWithoutColumns.name'), description: t('linter.insertWithoutColumns.description'), defaultSeverity: vscode.DiagnosticSeverity.Warning, defaultEnabled: true, category: "best-practices" },
            { id: "long_query_line", name: t('linter.longSingleLine.name'), description: t('linter.longSingleLine.description'), defaultSeverity: vscode.DiagnosticSeverity.Information, defaultEnabled: false, category: "code-style" },
            { id: "duplicate_column_aliases", name: t('linter.duplicateAlias.name'), description: t('linter.duplicateAlias.description'), defaultSeverity: vscode.DiagnosticSeverity.Warning, defaultEnabled: true, category: "code-style" },
            { id: "missing_query_comment", name: t('linter.complexQueryComment.name'), description: t('linter.complexQueryComment.description'), defaultSeverity: vscode.DiagnosticSeverity.Warning, defaultEnabled: true, category: "best-practices" },
            { id: "missing_column_comment", name: t('linter.createTableMissingComment.name'), description: t('linter.createTableMissingComment.description'), defaultSeverity: vscode.DiagnosticSeverity.Warning, defaultEnabled: true, category: "best-practices" },
            { id: "commented_out_code", name: t('linter.commentedOutCode.name'), description: t('linter.commentedOutCode.description'), defaultSeverity: vscode.DiagnosticSeverity.Information, defaultEnabled: true, category: "code-style" },
            { id: "expired_todo", name: t('linter.expiredTodo.name'), description: t('linter.expiredTodo.description'), defaultSeverity: vscode.DiagnosticSeverity.Information, defaultEnabled: true, category: "best-practices" },
        ]

        builtInRules.forEach(rule => {
            this.rules.set(rule.id, rule)
        })
    }

    private loadConfig(): void {
        const config = vscode.workspace.getConfiguration('Hive-Formatter')

        this.rules.forEach((rule, id) => {
            const ruleConfig = config.get<{ enabled?: boolean, severity?: string }>(`lint.${id}`)
            const enabled = ruleConfig?.enabled ?? rule.defaultEnabled
            const severityStr = ruleConfig?.severity
            let severity: vscode.DiagnosticSeverity = rule.defaultSeverity

            if (severityStr) {
                switch (severityStr.toLowerCase()) {
                    case 'error': severity = vscode.DiagnosticSeverity.Error; break
                    case 'warning': severity = vscode.DiagnosticSeverity.Warning; break
                    case 'information': severity = vscode.DiagnosticSeverity.Information; break
                    case 'hint': severity = vscode.DiagnosticSeverity.Hint; break
                }
            }

            this.config.set(id, { enabled, severity })
        })
    }

    public getRules(): LintRule[] {
        return Array.from(this.rules.values())
    }

    public isRuleEnabled(ruleId: string): boolean {
        return this.config.get(ruleId)?.enabled ?? false
    }

    public getRuleSeverity(ruleId: string): vscode.DiagnosticSeverity {
        return this.config.get(ruleId)?.severity ?? this.rules.get(ruleId)?.defaultSeverity ?? vscode.DiagnosticSeverity.Warning
    }

    public lint(text: string, document: vscode.TextDocument): vscode.Diagnostic[] {
        const dialect = toSqlDialect(document.languageId)
        const astLinter = new AstLinter()
        return astLinter.lint(text, dialect, document)
    }
}
