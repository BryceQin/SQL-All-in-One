import * as vscode from 'vscode'
import { t } from '../i18n'
import { getConfigManager } from '../core/configManager'

export interface LintRuleDefinition {
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

const BUILT_IN_RULES: LintRuleDefinition[] = [
    { id: 'avoid_select_star', name: t('linter.avoidSelectStar.name'), description: t('linter.avoidSelectStar.description'), defaultSeverity: vscode.DiagnosticSeverity.Warning, defaultEnabled: true, category: 'code-style' },
    { id: 'explicit_join_type', name: t('linter.explicitJoinType.name'), description: t('linter.explicitJoinType.description'), defaultSeverity: vscode.DiagnosticSeverity.Information, defaultEnabled: true, category: 'code-style' },
    { id: 'uppercase_keywords', name: t('linter.uppercaseKeywords.name'), description: t('linter.uppercaseKeywords.description'), defaultSeverity: vscode.DiagnosticSeverity.Information, defaultEnabled: false, category: 'code-style' },
    { id: 'consistent_aliasing', name: t('linter.consistentAliasing.name'), description: t('linter.consistentAliasing.description'), defaultSeverity: vscode.DiagnosticSeverity.Information, defaultEnabled: false, category: 'code-style' },
    { id: 'limit_with_order_by', name: t('linter.limitWithoutOrderBy.name'), description: t('linter.limitWithoutOrderBy.description'), defaultSeverity: vscode.DiagnosticSeverity.Warning, defaultEnabled: true, category: 'best-practices' },
    { id: 'avoid_column_count_mismatch', name: t('linter.columnCountMismatch.name'), description: t('linter.columnCountMismatch.description'), defaultSeverity: vscode.DiagnosticSeverity.Error, defaultEnabled: true, category: 'error-check' },
    { id: 'use_coalesce_over_isnull', name: t('linter.useCoalesce.name'), description: t('linter.useCoalesce.description'), defaultSeverity: vscode.DiagnosticSeverity.Information, defaultEnabled: false, category: 'best-practices' },
    { id: 'explicit_column_aliasing', name: t('linter.missingAsKeyword.name'), description: t('linter.missingAsKeyword.description'), defaultSeverity: vscode.DiagnosticSeverity.Information, defaultEnabled: false, category: 'code-style' },
    { id: 'avoid_correlated_subqueries', name: t('linter.subqueryPerformance.name'), description: t('linter.subqueryPerformance.description'), defaultSeverity: vscode.DiagnosticSeverity.Warning, defaultEnabled: false, category: 'performance' },
    { id: 'missing_primary_key', name: t('linter.createTableWithoutPK.name'), description: t('linter.createTableWithoutPK.description'), defaultSeverity: vscode.DiagnosticSeverity.Warning, defaultEnabled: true, category: 'best-practices' },
    { id: 'use_current_timestamp', name: t('linter.useCurrentTimestamp.name'), description: t('linter.useCurrentTimestamp.description'), defaultSeverity: vscode.DiagnosticSeverity.Information, defaultEnabled: true, category: 'best-practices' },
    { id: 'avoid_select_in_insert', name: t('linter.insertWithoutColumns.name'), description: t('linter.insertWithoutColumns.description'), defaultSeverity: vscode.DiagnosticSeverity.Warning, defaultEnabled: true, category: 'best-practices' },
    { id: 'long_query_line', name: t('linter.longSingleLine.name'), description: t('linter.longSingleLine.description'), defaultSeverity: vscode.DiagnosticSeverity.Information, defaultEnabled: false, category: 'code-style' },
    { id: 'duplicate_column_aliases', name: t('linter.duplicateAlias.name'), description: t('linter.duplicateAlias.description'), defaultSeverity: vscode.DiagnosticSeverity.Warning, defaultEnabled: true, category: 'code-style' },
    { id: 'missing_query_comment', name: t('linter.complexQueryComment.name'), description: t('linter.complexQueryComment.description'), defaultSeverity: vscode.DiagnosticSeverity.Warning, defaultEnabled: true, category: 'best-practices' },
    { id: 'missing_column_comment', name: t('linter.createTableMissingComment.name'), description: t('linter.createTableMissingComment.description'), defaultSeverity: vscode.DiagnosticSeverity.Warning, defaultEnabled: true, category: 'best-practices' },
    { id: 'commented_out_code', name: t('linter.commentedOutCode.name'), description: t('linter.commentedOutCode.description'), defaultSeverity: vscode.DiagnosticSeverity.Information, defaultEnabled: true, category: 'code-style' },
    { id: 'expired_todo', name: t('linter.expiredTodo.name'), description: t('linter.expiredTodo.description'), defaultSeverity: vscode.DiagnosticSeverity.Information, defaultEnabled: true, category: 'best-practices' },
]

export function getAllRuleDefinitions(): LintRuleDefinition[] {
    return BUILT_IN_RULES
}

export function getRuleDefinition(id: string): LintRuleDefinition | undefined {
    return BUILT_IN_RULES.find(r => r.id === id)
}

export function loadRuleConfigs(): Map<string, LintRuleConfig> {
    const cfgMgr = getConfigManager()
    const result = new Map<string, LintRuleConfig>()

    for (const rule of BUILT_IN_RULES) {
        const ruleConfig = cfgMgr.get<{ enabled?: boolean; severity?: string }>(`lint.${rule.id}`, { enabled: rule.defaultEnabled, severity: undefined })
        const enabled = ruleConfig?.enabled ?? rule.defaultEnabled
        const severityStr = ruleConfig?.severity
        let severity = rule.defaultSeverity

        if (severityStr) {
            switch (severityStr.toLowerCase()) {
                case 'error': severity = vscode.DiagnosticSeverity.Error; break
                case 'warning': severity = vscode.DiagnosticSeverity.Warning; break
                case 'information': severity = vscode.DiagnosticSeverity.Information; break
                case 'hint': severity = vscode.DiagnosticSeverity.Hint; break
            }
        }

        result.set(rule.id, { enabled, severity })
    }

    return result
}
