export type ConfigValueType = 'string' | 'number' | 'boolean' | 'enum'

export interface ConfigItemDefinition {
    key: string
    type: ConfigValueType
    defaultValue: unknown
    group: string
    label: string
    enumValues?: string[]
    configKey?: string
}

export interface LintRuleDefinition {
    ruleId: string
    configKey: string
    label: string
    defaultEnabled: boolean
    defaultSeverity: string
    enabledKey: string
    severityKey: string
}

export const FORMAT_CONFIG_ITEMS: ConfigItemDefinition[] = [
    { key: 'dialect', type: 'enum', defaultValue: 'hive', group: 'basic', label: 'Dialect', enumValues: ['hive', 'spark', 'flinksql', 'mysql', 'postgresql', 'bigquery', 'sqlite', 'sql'] },
    { key: 'keywordCase', type: 'enum', defaultValue: 'preserve', group: 'basic', label: 'Keyword Case', enumValues: ['preserve', 'upper', 'lower'] },
    { key: 'dataTypeCase', type: 'enum', defaultValue: 'preserve', group: 'basic', label: 'Data Type Case', enumValues: ['preserve', 'upper', 'lower'] },
    { key: 'functionCase', type: 'enum', defaultValue: 'preserve', group: 'basic', label: 'Function Case', enumValues: ['preserve', 'upper', 'lower'] },
    { key: 'identifierCase', type: 'enum', defaultValue: 'preserve', group: 'basic', label: 'Identifier Case', enumValues: ['preserve', 'upper', 'lower'] },
    { key: 'indentStyle', type: 'enum', defaultValue: 'standard', group: 'indent', label: 'Indent Style', enumValues: ['standard', 'tabularLeft', 'tabularRight'] },
    { key: 'logicalOperatorNewline', type: 'enum', defaultValue: 'before', group: 'indent', label: 'Logical Operator Newline', enumValues: ['before', 'after'] },
    { key: 'expressionWidth', type: 'number', defaultValue: 50, group: 'indent', label: 'Expression Width' },
    { key: 'linesBetweenQueries', type: 'number', defaultValue: 1, group: 'indent', label: 'Lines Between Queries' },
    { key: 'commaPosition', type: 'enum', defaultValue: 'after', group: 'comma', label: 'Comma Position', enumValues: ['before', 'after'] },
    { key: 'alignColumnDefinitions', type: 'boolean', defaultValue: false, group: 'align', label: 'Align Column Definitions' },
    { key: 'tabulateAlias', type: 'boolean', defaultValue: false, group: 'align', label: 'Tabulate Alias' },
    { key: 'newlineAfterSelect', type: 'boolean', defaultValue: true, group: 'newline', label: 'Newline After SELECT' },
    { key: 'newlineAfterFrom', type: 'boolean', defaultValue: true, group: 'newline', label: 'Newline After FROM' },
    { key: 'newlineBeforeWhere', type: 'boolean', defaultValue: true, group: 'newline', label: 'Newline Before WHERE' },
    { key: 'newlineAfterWhere', type: 'boolean', defaultValue: true, group: 'newline', label: 'Newline After WHERE' },
    { key: 'newlineBeforeOrderBy', type: 'boolean', defaultValue: true, group: 'newline', label: 'Newline Before ORDER BY' },
    { key: 'newlineBeforeGroupBy', type: 'boolean', defaultValue: true, group: 'newline', label: 'Newline Before GROUP BY' },
    { key: 'newlineBeforeHaving', type: 'boolean', defaultValue: true, group: 'newline', label: 'Newline Before HAVING' },
    { key: 'newlineBeforeLimit', type: 'boolean', defaultValue: true, group: 'newline', label: 'Newline Before LIMIT' },
    { key: 'newlineAfterGroupBy', type: 'boolean', defaultValue: true, group: 'newline', label: 'Newline After GROUP BY' },
    { key: 'newlineAfterHaving', type: 'boolean', defaultValue: true, group: 'newline', label: 'Newline After HAVING' },
    { key: 'newlineAfterOrderBy', type: 'boolean', defaultValue: true, group: 'newline', label: 'Newline After ORDER BY' },
    { key: 'newlineAfterLimit', type: 'boolean', defaultValue: false, group: 'newline', label: 'Newline After LIMIT' },
    { key: 'newlineAfterJoin', type: 'boolean', defaultValue: true, group: 'newline', label: 'Newline After JOIN' },
    { key: 'newlineBeforeOn', type: 'boolean', defaultValue: true, group: 'newline', label: 'Newline Before ON' },
    { key: 'newlineBeforeSetOperation', type: 'boolean', defaultValue: true, group: 'newline', label: 'Newline Before Set Operation' },
    { key: 'newlineAfterCase', type: 'boolean', defaultValue: true, group: 'newline', label: 'Newline After CASE' },
    { key: 'newlineAfterWhen', type: 'boolean', defaultValue: true, group: 'newline', label: 'Newline After WHEN' },
    { key: 'newlineAfterThen', type: 'boolean', defaultValue: false, group: 'newline', label: 'Newline After THEN' },
    { key: 'newlineAfterElse', type: 'boolean', defaultValue: false, group: 'newline', label: 'Newline After ELSE' },
    { key: 'newlineAfterIn', type: 'boolean', defaultValue: false, group: 'newline', label: 'Newline After IN' },
    { key: 'maxLineLength', type: 'number', defaultValue: 120, group: 'line', label: 'Max Line Length' },
    { key: 'reservedKeywordCase', type: 'enum', defaultValue: 'preserve', group: 'basic', label: 'Reserved Keyword Case', enumValues: ['preserve', 'upper', 'lower'] },
    { key: 'builtinFunctionCase', type: 'enum', defaultValue: 'preserve', group: 'basic', label: 'Builtin Function Case', enumValues: ['preserve', 'upper', 'lower'] },
    { key: 'newlineBeforeJoin', type: 'boolean', defaultValue: true, group: 'newline', label: 'Newline Before JOIN' },
    { key: 'newlineAfterComma', type: 'boolean', defaultValue: true, group: 'newline', label: 'Newline After Comma' },
    { key: 'alignWhereClauses', type: 'boolean', defaultValue: false, group: 'align', label: 'Align WHERE Clauses' },
    { key: 'alignCaseStatements', type: 'boolean', defaultValue: false, group: 'align', label: 'Align CASE Statements' },
    { key: 'breakAfterSelectItem', type: 'boolean', defaultValue: true, group: 'newline', label: 'Break After SELECT Item' },
    { key: 'breakAfterFromItem', type: 'boolean', defaultValue: true, group: 'newline', label: 'Break After FROM Item' },
    { key: 'spaceBeforeComma', type: 'boolean', defaultValue: false, group: 'space', label: 'Space Before Comma' },
    { key: 'spaceInsideParentheses', type: 'boolean', defaultValue: false, group: 'space', label: 'Space Inside Parentheses' },
    { key: 'trimTrailingSpaces', type: 'boolean', defaultValue: true, group: 'space', label: 'Trim Trailing Spaces' },
    { key: 'semicolonAtEnd', type: 'boolean', defaultValue: true, group: 'semicolon', label: 'Semicolon At End' },
    { key: 'denseOperators', type: 'boolean', defaultValue: false, group: 'space', label: 'Dense Operators' },
    { key: 'newlineBeforeSemicolon', type: 'boolean', defaultValue: false, group: 'semicolon', label: 'Newline Before Semicolon' },
    { key: 'indentJoinConditions', type: 'boolean', defaultValue: true, group: 'indent', label: 'Indent Join Conditions' },
    { key: 'indentWhen', type: 'boolean', defaultValue: true, group: 'indent', label: 'Indent WHEN' },
    { key: 'indentThen', type: 'boolean', defaultValue: true, group: 'indent', label: 'Indent THEN' },
    { key: 'indentCteBody', type: 'boolean', defaultValue: true, group: 'indent', label: 'Indent CTE Body' },
    { key: 'alignOnClauses', type: 'boolean', defaultValue: false, group: 'align', label: 'Align ON Clauses' },
    { key: 'alignInsertColumns', type: 'boolean', defaultValue: false, group: 'align', label: 'Align INSERT Columns' },
    { key: 'alignInsertValuesGroups', type: 'boolean', defaultValue: false, group: 'align', label: 'Align INSERT Values Groups' },
    { key: 'maxItemsInlineList', type: 'number', defaultValue: 5, group: 'line', label: 'Max Items Inline List' },
    { key: 'cteCommaPosition', type: 'enum', defaultValue: 'before', group: 'comma', label: 'CTE Comma Position', enumValues: ['before', 'after'] },
    { key: 'subqueryParenStyle', type: 'enum', defaultValue: 'inline', group: 'paren', label: 'Subquery Paren Style', enumValues: ['inline', 'newline'] },
    { key: 'commentPosition', type: 'enum', defaultValue: 'preserve', group: 'comment', label: 'Comment Position', enumValues: ['preserve', 'newline', 'inline'] },
    { key: 'blankLinesBeforeSetOperation', type: 'number', defaultValue: 1, group: 'line', label: 'Blank Lines Before Set Operation' },
    { key: 'blankLinesAfterSetOperation', type: 'number', defaultValue: 0, group: 'line', label: 'Blank Lines After Set Operation' },
    { key: 'newlineBeforeLateralView', type: 'boolean', defaultValue: true, group: 'newline', label: 'Newline Before LATERAL VIEW' },
    { key: 'newlineBeforeDistributeBy', type: 'boolean', defaultValue: true, group: 'newline', label: 'Newline Before DISTRIBUTE BY' },
    { key: 'newlineBeforeClusterBy', type: 'boolean', defaultValue: true, group: 'newline', label: 'Newline Before CLUSTER BY' },
    { key: 'newlineBeforeSortBy', type: 'boolean', defaultValue: true, group: 'newline', label: 'Newline Before SORT BY' },
    { key: 'singleLineMaxLength', type: 'number', defaultValue: 80, group: 'line', label: 'Single Line Max Length' },
    { key: 'nullCase', type: 'enum', defaultValue: 'preserve', group: 'basic', label: 'NULL Case', enumValues: ['preserve', 'upper', 'lower'] },
    { key: 'booleanCase', type: 'enum', defaultValue: 'preserve', group: 'basic', label: 'Boolean Case', enumValues: ['preserve', 'upper', 'lower'] },
]

export const FEATURE_CONFIG_ITEMS: ConfigItemDefinition[] = [
    { key: 'ignoreTabSettings', type: 'boolean', defaultValue: false, group: 'editor', label: 'Ignore Tab Settings' },
    { key: 'tabSizeOverride', type: 'number', defaultValue: 2, group: 'editor', label: 'Tab Size Override' },
    { key: 'insertSpacesOverride', type: 'boolean', defaultValue: true, group: 'editor', label: 'Insert Spaces Override' },
    { key: 'enableEnhancedChecks', type: 'boolean', defaultValue: true, group: 'feature', label: 'Enable Enhanced Checks' },
    { key: 'enableLinter', type: 'boolean', defaultValue: true, group: 'feature', label: 'Enable Linter' },
    { key: 'showErrorLevel', type: 'boolean', defaultValue: true, group: 'feature', label: 'Show Error Level' },
    { key: 'showWarningLevel', type: 'boolean', defaultValue: true, group: 'feature', label: 'Show Warning Level' },
    { key: 'showInfoLevel', type: 'boolean', defaultValue: true, group: 'feature', label: 'Show Info Level' },
    { key: 'enableCodeFolding', type: 'boolean', defaultValue: true, group: 'feature', label: 'Enable Code Folding' },
    { key: 'enableOutlineView', type: 'boolean', defaultValue: true, group: 'feature', label: 'Enable Outline View' },
    { key: 'enableStatusBar', type: 'boolean', defaultValue: true, group: 'feature', label: 'Enable Status Bar' },
    { key: 'enableParameterHighlight', type: 'boolean', defaultValue: true, group: 'feature', label: 'Enable Parameter Highlight' },
    { key: 'enableSnippets', type: 'boolean', defaultValue: true, group: 'feature', label: 'Enable Snippets' },
    { key: 'enableQuickFix', type: 'boolean', defaultValue: true, group: 'feature', label: 'Enable Quick Fix' },
    { key: 'enableSmartCommentToggle', type: 'boolean', defaultValue: true, group: 'feature', label: 'Enable Smart Comment Toggle' },
    { key: 'headerAuthor', type: 'string', defaultValue: '', group: 'header', label: 'Header Author' },
    { key: 'headerModifier', type: 'string', defaultValue: '', group: 'header', label: 'Header Modifier' },
    { key: 'completionCommentSnippets', type: 'boolean', defaultValue: true, group: 'feature', label: 'Completion Comment Snippets', configKey: 'completion.commentSnippets' },
]

export const LINT_RULES: LintRuleDefinition[] = [
    { ruleId: 'avoidSelectStar', configKey: 'lint.avoid_select_star', label: 'Avoid SELECT *', defaultEnabled: true, defaultSeverity: 'warning', enabledKey: 'lintAvoidSelectStarEnabled', severityKey: 'lintAvoidSelectStarSeverity' },
    { ruleId: 'explicitJoinType', configKey: 'lint.explicit_join_type', label: 'Explicit Join Type', defaultEnabled: true, defaultSeverity: 'information', enabledKey: 'lintExplicitJoinTypeEnabled', severityKey: 'lintExplicitJoinTypeSeverity' },
    { ruleId: 'limitWithOrderBy', configKey: 'lint.limit_with_order_by', label: 'LIMIT With ORDER BY', defaultEnabled: true, defaultSeverity: 'warning', enabledKey: 'lintLimitWithOrderByEnabled', severityKey: 'lintLimitWithOrderBySeverity' },
    { ruleId: 'avoidColumnCountMismatch', configKey: 'lint.avoid_column_count_mismatch', label: 'Avoid Column Count Mismatch', defaultEnabled: true, defaultSeverity: 'error', enabledKey: 'lintAvoidColumnCountMismatchEnabled', severityKey: 'lintAvoidColumnCountMismatchSeverity' },
    { ruleId: 'missingPrimaryKey', configKey: 'lint.missing_primary_key', label: 'Missing Primary Key', defaultEnabled: true, defaultSeverity: 'warning', enabledKey: 'lintMissingPrimaryKeyEnabled', severityKey: 'lintMissingPrimaryKeySeverity' },
    { ruleId: 'useCurrentTimestamp', configKey: 'lint.use_current_timestamp', label: 'Use CURRENT_TIMESTAMP', defaultEnabled: true, defaultSeverity: 'information', enabledKey: 'lintUseCurrentTimestampEnabled', severityKey: 'lintUseCurrentTimestampSeverity' },
    { ruleId: 'avoidSelectInInsert', configKey: 'lint.avoid_select_in_insert', label: 'Avoid SELECT In INSERT', defaultEnabled: true, defaultSeverity: 'warning', enabledKey: 'lintAvoidSelectInInsertEnabled', severityKey: 'lintAvoidSelectInInsertSeverity' },
    { ruleId: 'duplicateColumnAliases', configKey: 'lint.duplicate_column_aliases', label: 'Duplicate Column Aliases', defaultEnabled: true, defaultSeverity: 'warning', enabledKey: 'lintDuplicateColumnAliasesEnabled', severityKey: 'lintDuplicateColumnAliasesSeverity' },
    { ruleId: 'uppercaseKeywords', configKey: 'lint.uppercase_keywords', label: 'Uppercase Keywords', defaultEnabled: false, defaultSeverity: 'information', enabledKey: 'lintUppercaseKeywordsEnabled', severityKey: 'lintUppercaseKeywordsSeverity' },
    { ruleId: 'consistentAliasing', configKey: 'lint.consistent_aliasing', label: 'Consistent Aliasing', defaultEnabled: false, defaultSeverity: 'information', enabledKey: 'lintConsistentAliasingEnabled', severityKey: 'lintConsistentAliasingSeverity' },
    { ruleId: 'useCoalesceOverIsnull', configKey: 'lint.use_coalesce_over_isnull', label: 'Use COALESCE Over ISNULL', defaultEnabled: false, defaultSeverity: 'information', enabledKey: 'lintUseCoalesceOverIsnullEnabled', severityKey: 'lintUseCoalesceOverIsnullSeverity' },
    { ruleId: 'explicitColumnAliasing', configKey: 'lint.explicit_column_aliasing', label: 'Explicit Column Aliasing', defaultEnabled: false, defaultSeverity: 'information', enabledKey: 'lintExplicitColumnAliasingEnabled', severityKey: 'lintExplicitColumnAliasingSeverity' },
    { ruleId: 'avoidCorrelatedSubqueries', configKey: 'lint.avoid_correlated_subqueries', label: 'Avoid Correlated Subqueries', defaultEnabled: false, defaultSeverity: 'warning', enabledKey: 'lintAvoidCorrelatedSubqueriesEnabled', severityKey: 'lintAvoidCorrelatedSubqueriesSeverity' },
    { ruleId: 'longQueryLine', configKey: 'lint.long_query_line', label: 'Long Query Line', defaultEnabled: false, defaultSeverity: 'information', enabledKey: 'lintLongQueryLineEnabled', severityKey: 'lintLongQueryLineSeverity' },
    { ruleId: 'missingQueryComment', configKey: 'lint.missing_query_comment', label: 'Missing Query Comment', defaultEnabled: true, defaultSeverity: 'warning', enabledKey: 'lintMissingQueryCommentEnabled', severityKey: 'lintMissingQueryCommentSeverity' },
    { ruleId: 'missingColumnComment', configKey: 'lint.missing_column_comment', label: 'Missing Column Comment', defaultEnabled: true, defaultSeverity: 'warning', enabledKey: 'lintMissingColumnCommentEnabled', severityKey: 'lintMissingColumnCommentSeverity' },
    { ruleId: 'commentedOutCode', configKey: 'lint.commented_out_code', label: 'Commented Out Code', defaultEnabled: true, defaultSeverity: 'information', enabledKey: 'lintCommentedOutCodeEnabled', severityKey: 'lintCommentedOutCodeSeverity' },
    { ruleId: 'expiredTodo', configKey: 'lint.expired_todo', label: 'Expired TODO', defaultEnabled: true, defaultSeverity: 'information', enabledKey: 'lintExpiredTodoEnabled', severityKey: 'lintExpiredTodoSeverity' },
]

export const ALL_CONFIG_ITEMS: ConfigItemDefinition[] = [...FORMAT_CONFIG_ITEMS, ...FEATURE_CONFIG_ITEMS]

export function getDefaultConfig(): Record<string, unknown> {
    const defaults: Record<string, unknown> = {}

    for (const item of ALL_CONFIG_ITEMS) {
        defaults[item.key] = item.defaultValue
    }

    for (const rule of LINT_RULES) {
        defaults[rule.enabledKey] = rule.defaultEnabled
        defaults[rule.severityKey] = rule.defaultSeverity
    }

    return defaults
}

export function getConfigKey(item: ConfigItemDefinition): string {
    return item.configKey ?? item.key
}
