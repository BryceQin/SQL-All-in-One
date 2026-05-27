import * as vscode from 'vscode'
import type { LintRule, RuleContext } from './rules/LintRule'
import { loadRuleConfigs, type LintRuleConfig, type LintRuleDefinition } from './lintRules'
import { AvoidSelectStarRule } from './rules/AvoidSelectStarRule'
import { ExplicitJoinTypeRule } from './rules/ExplicitJoinTypeRule'
import { LimitWithOrderByRule } from './rules/LimitWithOrderByRule'
import { ColumnCountMismatchRule } from './rules/ColumnCountMismatchRule'
import { MissingPrimaryKeyRule } from './rules/MissingPrimaryKeyRule'
import { SelectInInsertRule } from './rules/SelectInInsertRule'
import { DuplicateColumnAliasesRule } from './rules/DuplicateColumnAliasesRule'
import { UseCoalesceOverIsNullRule } from './rules/UseCoalesceOverIsNullRule'
import { UseCurrentTimestampRule } from './rules/UseCurrentTimestampRule'
import { AvoidCorrelatedSubqueriesRule } from './rules/AvoidCorrelatedSubqueriesRule'
import { MissingQueryCommentRule } from './rules/MissingQueryCommentRule'
import { MissingColumnCommentRule } from './rules/MissingColumnCommentRule'
import { CommentedOutCodeRule } from './rules/CommentedOutCodeRule'
import { ExpiredTodoRule } from './rules/ExpiredTodoRule'
import { HavingWithoutGroupByRule } from './rules/HavingWithoutGroupByRule'
import { LimitInvalidValueRule } from './rules/LimitInvalidValueRule'
import { ReservedWordIdentifierRule } from './rules/ReservedWordIdentifierRule'
import { JoinMissingOnRule } from './rules/JoinMissingOnRule'
import { SelectWithoutFromRule } from './rules/SelectWithoutFromRule'
import { MisplacedDistinctRule } from './rules/MisplacedDistinctRule'
import { AggregateInWhereRule } from './rules/AggregateInWhereRule'
import { SubqueryWithoutAliasRule } from './rules/SubqueryWithoutAliasRule'
import { SuspiciousNullComparisonRule } from './rules/SuspiciousNullComparisonRule'
import { IncompleteCaseRule } from './rules/IncompleteCaseRule'
import { RedundantDistinctRule } from './rules/RedundantDistinctRule'
import { DateFunctionUsageRule } from './rules/DateFunctionUsageRule'
import { WildcardInUpdateRule } from './rules/WildcardInUpdateRule'

const DEFAULT_CONFIG: LintRuleConfig = { enabled: false, severity: vscode.DiagnosticSeverity.Warning }

export class RuleRegistry {
    private rules = new Map<string, LintRule>()
    private rulesByType = new Map<string, LintRule[]>()

    register(rule: LintRule): void {
        this.rules.set(rule.id, rule)

        for (const type of rule.applicableTypes) {
            if (!this.rulesByType.has(type)) {
                this.rulesByType.set(type, [])
            }
            const list = this.rulesByType.get(type)
            if (list) {
                list.push(rule)
            }
        }
    }

    getEnabledRulesForType(type: string): LintRule[] {
        const rules = this.rulesByType.get(type) || []
        return rules.filter(r => r.isEnabled())
    }

    getEnabledGlobalRules(): LintRule[] {
        return Array.from(this.rules.values())
            .filter(r => r.applicableTypes.length === 0 && r.isEnabled())
    }

    runRules(context: RuleContext): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = []
        const rules = this.getEnabledRulesForType(context.node.type)

        for (const rule of rules) {
            diagnostics.push(...rule.check(context))
        }

        return diagnostics
    }

    runGlobalRules(context: RuleContext): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = []
        const globalRules = this.getEnabledGlobalRules()

        for (const rule of globalRules) {
            diagnostics.push(...rule.check(context))
        }

        return diagnostics
    }

    getRuleDefinitions(): LintRuleDefinition[] {
        return Array.from(this.rules.values()).map(rule => ({
            id: rule.id,
            name: rule.name,
            description: rule.description,
            defaultSeverity: rule.defaultSeverity,
            defaultEnabled: rule.defaultEnabled,
            category: rule.category,
        }))
    }
}

let cachedRegistry: RuleRegistry | null = null

export function getRuleRegistry(): RuleRegistry {
    if (!cachedRegistry) {
        cachedRegistry = createRuleRegistry()
    }
    return cachedRegistry
}

export function resetRuleRegistry(): void {
    cachedRegistry = null
}

export function createRuleRegistry(): RuleRegistry {
    const registry = new RuleRegistry()
    const configs = loadRuleConfigs()

    registry.register(new AvoidSelectStarRule(configs.get('avoid_select_star') ?? DEFAULT_CONFIG))
    registry.register(new ExplicitJoinTypeRule(configs.get('explicit_join_type') ?? DEFAULT_CONFIG))
    registry.register(new LimitWithOrderByRule(configs.get('limit_with_order_by') ?? DEFAULT_CONFIG))
    registry.register(new ColumnCountMismatchRule(configs.get('avoid_column_count_mismatch') ?? DEFAULT_CONFIG))
    registry.register(new MissingPrimaryKeyRule(configs.get('missing_primary_key') ?? DEFAULT_CONFIG))
    registry.register(new SelectInInsertRule(configs.get('avoid_select_in_insert') ?? DEFAULT_CONFIG))
    registry.register(new DuplicateColumnAliasesRule(configs.get('duplicate_column_aliases') ?? DEFAULT_CONFIG))
    registry.register(new UseCoalesceOverIsNullRule(configs.get('use_coalesce_over_isnull') ?? DEFAULT_CONFIG))
    registry.register(new UseCurrentTimestampRule(configs.get('use_current_timestamp') ?? DEFAULT_CONFIG))
    registry.register(new AvoidCorrelatedSubqueriesRule(configs.get('avoid_correlated_subqueries') ?? DEFAULT_CONFIG))
    registry.register(new MissingQueryCommentRule(configs.get('missing_query_comment') ?? DEFAULT_CONFIG))
    registry.register(new MissingColumnCommentRule(configs.get('missing_column_comment') ?? DEFAULT_CONFIG))
    registry.register(new CommentedOutCodeRule(configs.get('commented_out_code') ?? DEFAULT_CONFIG))
    registry.register(new ExpiredTodoRule(configs.get('expired_todo') ?? DEFAULT_CONFIG))

    // Migrated from AstEnhancedChecker
    registry.register(new HavingWithoutGroupByRule(configs.get('having_without_group_by') ?? DEFAULT_CONFIG))
    registry.register(new LimitInvalidValueRule(configs.get('limit_invalid_value') ?? DEFAULT_CONFIG))
    registry.register(new ReservedWordIdentifierRule(configs.get('reserved_word_identifier') ?? DEFAULT_CONFIG))
    registry.register(new JoinMissingOnRule(configs.get('join_missing_on') ?? DEFAULT_CONFIG))
    registry.register(new SelectWithoutFromRule(configs.get('select_without_from') ?? DEFAULT_CONFIG))
    registry.register(new MisplacedDistinctRule(configs.get('misplaced_distinct') ?? DEFAULT_CONFIG))
    registry.register(new AggregateInWhereRule(configs.get('aggregate_in_where') ?? DEFAULT_CONFIG))
    registry.register(new SubqueryWithoutAliasRule(configs.get('subquery_without_alias') ?? DEFAULT_CONFIG))
    registry.register(new SuspiciousNullComparisonRule(configs.get('suspicious_null_comparison') ?? DEFAULT_CONFIG))
    registry.register(new IncompleteCaseRule(configs.get('incomplete_case') ?? DEFAULT_CONFIG))
    registry.register(new RedundantDistinctRule(configs.get('redundant_distinct') ?? DEFAULT_CONFIG))
    registry.register(new DateFunctionUsageRule(configs.get('date_function_usage') ?? DEFAULT_CONFIG))
    registry.register(new WildcardInUpdateRule(configs.get('wildcard_in_update') ?? DEFAULT_CONFIG))

    return registry
}
