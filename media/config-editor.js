        var i18nData = {
    zh: {
        'configEditor.tab.formatting': '格式化',
        'configEditor.tab.editor': '编辑器',
        'configEditor.tab.database': '数据库',
        'configEditor.searchPlaceholder': '搜索配置项...',
        'configEditor.searchEmpty': '未找到匹配的配置项'
    },
    en: {
        'configEditor.tab.formatting': 'Formatting',
        'configEditor.tab.editor': 'Editor',
        'configEditor.tab.database': 'Database',
        'configEditor.searchPlaceholder': 'Search settings...',
        'configEditor.searchEmpty': 'No matching settings found'
    },
    lang: 'zh'
};

function getI18nDict() {
    return i18nData.lang === 'en' ? i18nData.en : i18nData.zh;
}

applyI18nDict(getI18nDict());

function applyI18nDict(dict) {
    if (!dict) return;
    document.querySelectorAll('[data-i18n]').forEach(function(el) {
        var key = el.getAttribute('data-i18n');
        if (dict[key]) {
            if (el.tagName === 'TITLE') {
                document.title = dict[key];
            } else {
                el.textContent = dict[key];
            }
        }
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(function(el) {
        var key = el.getAttribute('data-i18n-ph');
        if (dict[key]) {
            el.placeholder = dict[key];
        }
    });
}

function changeLanguage(lang) {
    i18nData.lang = lang;
    applyI18nDict(getI18nDict());
    document.documentElement.lang = lang;
    vscode.postMessage({ command: 'changeLanguage', lang: lang });
}

        let currentConfig = {
            enableSmartCommentToggle: true,
            headerAuthor: '',
            headerModifier: '',
            completionCommentSnippets: true,
        };

        let currentActiveTab = 'formatting';

        const presets = {
            default: {
                dialect: 'hive',
                keywordCase: 'preserve',
                dataTypeCase: 'preserve',
                functionCase: 'preserve',
                identifierCase: 'preserve',
                indentStyle: 'standard',
                logicalOperatorNewline: 'before',
                expressionWidth: 50,
                linesBetweenQueries: 1,
                denseOperators: false,
                newlineBeforeSemicolon: false,
                commaPosition: 'after',
                alignColumnDefinitions: false,
                newlineAfterSelect: true,
                newlineAfterFrom: true,
                newlineBeforeWhere: true,
                newlineAfterWhere: true,
                newlineBeforeOrderBy: true,
                newlineBeforeGroupBy: true,
                newlineBeforeHaving: true,
                newlineBeforeLimit: true,
            newlineAfterGroupBy: true,
            newlineAfterHaving: true,
            newlineAfterOrderBy: true,
            newlineAfterLimit: false,
            newlineAfterJoin: true,
            newlineBeforeOn: true,
            newlineBeforeSetOperation: true,
            newlineAfterCase: true,
            newlineAfterWhen: true,
            newlineAfterThen: false,
            newlineAfterElse: false,
            newlineAfterIn: false,
                tabulateAlias: false,
                newlineBeforeJoin: true,
                alignWhereClauses: false,
                alignCaseStatements: false,
                spaceBeforeComma: false,
                spaceInsideParentheses: false,
                trimTrailingSpaces: true,
                semicolonAtEnd: true,
                singleLineMaxLength: 80,
            nullCase: 'preserve',
            booleanCase: 'preserve',
            indentJoinConditions: true,
            indentWhen: true,
            indentThen: true,
            indentCteBody: true,
            alignOnClauses: false,
            alignInsertColumns: false,
            alignInsertValuesGroups: false,
            maxItemsInlineList: 5,
            cteCommaPosition: 'before',
            subqueryParenStyle: 'inline',
            commentPosition: 'preserve',
            blankLinesBeforeSetOperation: 1,
            blankLinesAfterSetOperation: 0,
            newlineBeforeLateralView: true,
            newlineBeforeDistributeBy: true,
            newlineBeforeClusterBy: true,
            newlineBeforeSortBy: true,
                ignoreTabSettings: false,
                tabSizeOverride: 2,
                insertSpacesOverride: true,
                enableLinter: true,
                showErrorLevel: true,
                showWarningLevel: true,
                showInfoLevel: true,
                enableCodeFolding: true,
                enableOutlineView: true,
                enableStatusBar: true,
                enableParameterHighlight: true,
                enableSnippets: true,
                enableQuickFix: true,
                enableSmartCommentToggle: true,
                headerAuthor: '',
                headerModifier: '',
                completionCommentSnippets: true,
                lintAvoidSelectStarEnabled: true,
                lintAvoidSelectStarSeverity: 'warning',
                lintExplicitJoinTypeEnabled: true,
                lintExplicitJoinTypeSeverity: 'information',
                lintLimitWithOrderByEnabled: true,
                lintLimitWithOrderBySeverity: 'warning',
                lintAvoidColumnCountMismatchEnabled: true,
                lintAvoidColumnCountMismatchSeverity: 'error',
                lintMissingPrimaryKeyEnabled: true,
                lintMissingPrimaryKeySeverity: 'warning',
                lintUseCurrentTimestampEnabled: true,
                lintUseCurrentTimestampSeverity: 'information',
                lintAvoidSelectInInsertEnabled: true,
                lintAvoidSelectInInsertSeverity: 'warning',
                lintDuplicateColumnAliasesEnabled: true,
                lintDuplicateColumnAliasesSeverity: 'warning',
                lintUppercaseKeywordsEnabled: false,
                lintUppercaseKeywordsSeverity: 'information',
                lintConsistentAliasingEnabled: false,
                lintConsistentAliasingSeverity: 'information',
                lintUseCoalesceOverIsnullEnabled: false,
                lintUseCoalesceOverIsnullSeverity: 'information',
                lintExplicitColumnAliasingEnabled: false,
                lintExplicitColumnAliasingSeverity: 'information',
                lintAvoidCorrelatedSubqueriesEnabled: false,
                lintAvoidCorrelatedSubqueriesSeverity: 'warning',
                lintLongQueryLineEnabled: false,
                lintLongQueryLineSeverity: 'information',
                lintMissingQueryCommentEnabled: true,
                lintMissingQueryCommentSeverity: 'warning',
                lintMissingColumnCommentEnabled: true,
                lintMissingColumnCommentSeverity: 'warning',
                lintCommentedOutCodeEnabled: true,
                lintCommentedOutCodeSeverity: 'information',
                lintExpiredTodoEnabled: true,
                lintExpiredTodoSeverity: 'information',
                lintHavingWithoutGroupByEnabled: true,
                lintHavingWithoutGroupBySeverity: 'warning',
                lintLimitInvalidValueEnabled: true,
                lintLimitInvalidValueSeverity: 'error',
                lintReservedWordIdentifierEnabled: true,
                lintReservedWordIdentifierSeverity: 'warning',
                lintJoinMissingOnEnabled: true,
                lintJoinMissingOnSeverity: 'warning',
                lintSelectWithoutFromEnabled: true,
                lintSelectWithoutFromSeverity: 'warning',
                lintMisplacedDistinctEnabled: true,
                lintMisplacedDistinctSeverity: 'error',
                lintAggregateInWhereEnabled: true,
                lintAggregateInWhereSeverity: 'error',
                lintSubqueryWithoutAliasEnabled: true,
                lintSubqueryWithoutAliasSeverity: 'warning',
                lintSuspiciousNullComparisonEnabled: true,
                lintSuspiciousNullComparisonSeverity: 'warning',
                lintIncompleteCaseEnabled: true,
                lintIncompleteCaseSeverity: 'error',
                lintRedundantDistinctEnabled: true,
                lintRedundantDistinctSeverity: 'warning',
                lintDateFunctionUsageEnabled: true,
                lintDateFunctionUsageSeverity: 'information',
                lintWildcardInUpdateEnabled: true,
                lintWildcardInUpdateSeverity: 'error',
                queryMaxRows: 1000,
                queryTimeout: 30000,
                queryPageSize: 100,
                queryNullPlaceholder: '(NULL)',
                safetyGuardLevel: 'moderate',
                executionBatchMode: 'sequential',
                executionOnError: 'stop',
                executionSaveProgress: true,
                historyMaxEntries: 500,
                exportDefaultFormat: 'csv',
                exportCsvDelimiter: ',',
                exportCsvEncoding: 'utf-8',
                exportIncludeHeaders: true,
                resultsEnablePreload: true,
                resultsJsonPrettyPrint: true,
                resultsDateFormat: 'local',
                resultsLongTextThreshold: 200,
                dataEditorEditMode: 'readonly',
                dataEditorAutoCommit: true,
                dataEditorDefaultView: 'grid',
                dataEditorEnableValidation: true,
                dataEditorValidateOnEdit: true,
                dataEditorValidateForeignKeys: false,
                schemaCacheDatabaseTtl: 600,
                schemaCacheTableTtl: 300,
                schemaCacheColumnTtl: 120,
                schemaCacheFunctionTtl: 600,
                schemaCacheRefreshOnDDL: true,
                schemaCachePrefetchOnConnect: true
            },
            hive: {
                dialect: 'hive',
                keywordCase: 'upper',
                dataTypeCase: 'upper',
                functionCase: 'lower',
                identifierCase: 'preserve',
                indentStyle: 'standard',
                logicalOperatorNewline: 'before',
                expressionWidth: 60,
                linesBetweenQueries: 2,
                denseOperators: false,
                newlineBeforeSemicolon: false,
                commaPosition: 'after',
                alignColumnDefinitions: true,
                newlineAfterSelect: true,
                newlineAfterFrom: true,
                newlineBeforeWhere: true,
                newlineAfterWhere: true,
                newlineBeforeOrderBy: true,
                newlineBeforeGroupBy: true,
                newlineBeforeHaving: true,
                newlineBeforeLimit: true,
                newlineAfterGroupBy: true,
                newlineAfterHaving: true,
                newlineAfterOrderBy: true,
                newlineAfterLimit: false,
                newlineAfterJoin: true,
                newlineBeforeOn: true,
                newlineBeforeSetOperation: true,
                newlineAfterCase: true,
                newlineAfterWhen: true,
                newlineAfterThen: false,
                newlineAfterElse: false,
                newlineAfterIn: false,
                tabulateAlias: true,
                newlineBeforeJoin: true,
                alignWhereClauses: false,
                alignCaseStatements: false,
                spaceBeforeComma: false,
                spaceInsideParentheses: false,
                trimTrailingSpaces: true,
                semicolonAtEnd: true,
                singleLineMaxLength: 80,
                nullCase: 'preserve',
                booleanCase: 'preserve',
                indentJoinConditions: true,
                indentWhen: true,
                indentThen: true,
                indentCteBody: true,
                alignOnClauses: false,
                alignInsertColumns: false,
                alignInsertValuesGroups: false,
                maxItemsInlineList: 5,
                cteCommaPosition: 'before',
                subqueryParenStyle: 'inline',
                commentPosition: 'preserve',
                blankLinesBeforeSetOperation: 1,
                blankLinesAfterSetOperation: 0,
                newlineBeforeLateralView: true,
                newlineBeforeDistributeBy: true,
                newlineBeforeClusterBy: true,
                newlineBeforeSortBy: true,
                ignoreTabSettings: false,
                tabSizeOverride: 2,
                insertSpacesOverride: true,
                enableLinter: true,
                showErrorLevel: true,
                showWarningLevel: true,
                showInfoLevel: true,
                enableCodeFolding: true,
                enableOutlineView: true,
                enableStatusBar: true,
                enableParameterHighlight: true,
                enableSnippets: true,
                enableQuickFix: true,
                enableSmartCommentToggle: true,
                headerAuthor: '',
                headerModifier: '',
                completionCommentSnippets: true,
                lintAvoidSelectStarEnabled: true,
                lintAvoidSelectStarSeverity: 'warning',
                lintExplicitJoinTypeEnabled: true,
                lintExplicitJoinTypeSeverity: 'information',
                lintLimitWithOrderByEnabled: true,
                lintLimitWithOrderBySeverity: 'warning',
                lintAvoidColumnCountMismatchEnabled: true,
                lintAvoidColumnCountMismatchSeverity: 'error',
                lintMissingPrimaryKeyEnabled: true,
                lintMissingPrimaryKeySeverity: 'warning',
                lintUseCurrentTimestampEnabled: true,
                lintUseCurrentTimestampSeverity: 'information',
                lintAvoidSelectInInsertEnabled: true,
                lintAvoidSelectInInsertSeverity: 'warning',
                lintDuplicateColumnAliasesEnabled: true,
                lintDuplicateColumnAliasesSeverity: 'warning',
                lintUppercaseKeywordsEnabled: true,
                lintUppercaseKeywordsSeverity: 'information',
                lintConsistentAliasingEnabled: false,
                lintConsistentAliasingSeverity: 'information',
                lintUseCoalesceOverIsnullEnabled: false,
                lintUseCoalesceOverIsnullSeverity: 'information',
                lintExplicitColumnAliasingEnabled: false,
                lintExplicitColumnAliasingSeverity: 'information',
                lintAvoidCorrelatedSubqueriesEnabled: false,
                lintAvoidCorrelatedSubqueriesSeverity: 'warning',
                lintLongQueryLineEnabled: false,
                lintLongQueryLineSeverity: 'information',
                lintMissingQueryCommentEnabled: false,
                lintMissingQueryCommentSeverity: 'warning',
                lintMissingColumnCommentEnabled: false,
                lintMissingColumnCommentSeverity: 'warning',
                lintCommentedOutCodeEnabled: false,
                lintCommentedOutCodeSeverity: 'information',
                lintExpiredTodoEnabled: false,
                lintExpiredTodoSeverity: 'warning',
                lintHavingWithoutGroupByEnabled: false,
                lintHavingWithoutGroupBySeverity: 'warning',
                lintLimitInvalidValueEnabled: false,
                lintLimitInvalidValueSeverity: 'error',
                lintReservedWordIdentifierEnabled: false,
                lintReservedWordIdentifierSeverity: 'warning',
                lintJoinMissingOnEnabled: false,
                lintJoinMissingOnSeverity: 'warning',
                lintSelectWithoutFromEnabled: false,
                lintSelectWithoutFromSeverity: 'warning',
                lintMisplacedDistinctEnabled: false,
                lintMisplacedDistinctSeverity: 'error',
                lintAggregateInWhereEnabled: false,
                lintAggregateInWhereSeverity: 'error',
                lintSubqueryWithoutAliasEnabled: false,
                lintSubqueryWithoutAliasSeverity: 'warning',
                lintSuspiciousNullComparisonEnabled: false,
                lintSuspiciousNullComparisonSeverity: 'warning',
                lintIncompleteCaseEnabled: false,
                lintIncompleteCaseSeverity: 'error',
                lintRedundantDistinctEnabled: false,
                lintRedundantDistinctSeverity: 'warning',
                lintDateFunctionUsageEnabled: false,
                lintDateFunctionUsageSeverity: 'information',
                lintWildcardInUpdateEnabled: false,
                lintWildcardInUpdateSeverity: 'error'            },
            mysql: {
                dialect: 'mysql',
                keywordCase: 'upper',
                dataTypeCase: 'upper',
                functionCase: 'preserve',
                identifierCase: 'preserve',
                indentStyle: 'standard',
                logicalOperatorNewline: 'after',
                expressionWidth: 50,
                linesBetweenQueries: 1,
                denseOperators: false,
                newlineBeforeSemicolon: false,
                commaPosition: 'after',
                alignColumnDefinitions: false,
                newlineAfterSelect: true,
                newlineAfterFrom: true,
                newlineBeforeWhere: true,
                newlineAfterWhere: true,
                newlineBeforeOrderBy: true,
                newlineBeforeGroupBy: true,
                newlineBeforeHaving: true,
                newlineBeforeLimit: true,
                newlineAfterGroupBy: true,
                newlineAfterHaving: true,
                newlineAfterOrderBy: true,
                newlineAfterLimit: false,
                newlineAfterJoin: true,
                newlineBeforeOn: true,
                newlineBeforeSetOperation: true,
                newlineAfterCase: true,
                newlineAfterWhen: true,
                newlineAfterThen: false,
                newlineAfterElse: false,
                newlineAfterIn: false,
                tabulateAlias: false,
                newlineBeforeJoin: true,
                alignWhereClauses: false,
                alignCaseStatements: false,
                spaceBeforeComma: false,
                spaceInsideParentheses: false,
                trimTrailingSpaces: true,
                semicolonAtEnd: true,
                singleLineMaxLength: 80,
                nullCase: 'preserve',
                booleanCase: 'preserve',
                indentJoinConditions: true,
                indentWhen: true,
                indentThen: true,
                indentCteBody: true,
                alignOnClauses: false,
                alignInsertColumns: false,
                alignInsertValuesGroups: false,
                maxItemsInlineList: 5,
                cteCommaPosition: 'before',
                subqueryParenStyle: 'inline',
                commentPosition: 'preserve',
                blankLinesBeforeSetOperation: 1,
                blankLinesAfterSetOperation: 0,
                newlineBeforeLateralView: true,
                newlineBeforeDistributeBy: true,
                newlineBeforeClusterBy: true,
                newlineBeforeSortBy: true,
                ignoreTabSettings: false,
                tabSizeOverride: 4,
                insertSpacesOverride: true,
                enableLinter: true,
                showErrorLevel: true,
                showWarningLevel: true,
                showInfoLevel: true,
                enableCodeFolding: true,
                enableOutlineView: true,
                enableStatusBar: true,
                enableParameterHighlight: true,
                enableSnippets: true,
                enableQuickFix: true,
                enableSmartCommentToggle: true,
                headerAuthor: '',
                headerModifier: '',
                completionCommentSnippets: true,
                lintAvoidSelectStarEnabled: true,
                lintAvoidSelectStarSeverity: 'warning',
                lintExplicitJoinTypeEnabled: true,
                lintExplicitJoinTypeSeverity: 'information',
                lintLimitWithOrderByEnabled: true,
                lintLimitWithOrderBySeverity: 'warning',
                lintAvoidColumnCountMismatchEnabled: true,
                lintAvoidColumnCountMismatchSeverity: 'error',
                lintMissingPrimaryKeyEnabled: true,
                lintMissingPrimaryKeySeverity: 'warning',
                lintUseCurrentTimestampEnabled: true,
                lintUseCurrentTimestampSeverity: 'information',
                lintAvoidSelectInInsertEnabled: true,
                lintAvoidSelectInInsertSeverity: 'warning',
                lintDuplicateColumnAliasesEnabled: true,
                lintDuplicateColumnAliasesSeverity: 'warning',
                lintUppercaseKeywordsEnabled: true,
                lintUppercaseKeywordsSeverity: 'information',
                lintConsistentAliasingEnabled: false,
                lintConsistentAliasingSeverity: 'information',
                lintUseCoalesceOverIsnullEnabled: false,
                lintUseCoalesceOverIsnullSeverity: 'information',
                lintExplicitColumnAliasingEnabled: false,
                lintExplicitColumnAliasingSeverity: 'information',
                lintAvoidCorrelatedSubqueriesEnabled: false,
                lintAvoidCorrelatedSubqueriesSeverity: 'warning',
                lintLongQueryLineEnabled: false,
                lintLongQueryLineSeverity: 'information',
                lintMissingQueryCommentEnabled: false,
                lintMissingQueryCommentSeverity: 'warning',
                lintMissingColumnCommentEnabled: false,
                lintMissingColumnCommentSeverity: 'warning',
                lintCommentedOutCodeEnabled: false,
                lintCommentedOutCodeSeverity: 'information',
                lintExpiredTodoEnabled: false,
                lintExpiredTodoSeverity: 'warning',
                lintHavingWithoutGroupByEnabled: false,
                lintHavingWithoutGroupBySeverity: 'warning',
                lintLimitInvalidValueEnabled: false,
                lintLimitInvalidValueSeverity: 'error',
                lintReservedWordIdentifierEnabled: false,
                lintReservedWordIdentifierSeverity: 'warning',
                lintJoinMissingOnEnabled: false,
                lintJoinMissingOnSeverity: 'warning',
                lintSelectWithoutFromEnabled: false,
                lintSelectWithoutFromSeverity: 'warning',
                lintMisplacedDistinctEnabled: false,
                lintMisplacedDistinctSeverity: 'error',
                lintAggregateInWhereEnabled: false,
                lintAggregateInWhereSeverity: 'error',
                lintSubqueryWithoutAliasEnabled: false,
                lintSubqueryWithoutAliasSeverity: 'warning',
                lintSuspiciousNullComparisonEnabled: false,
                lintSuspiciousNullComparisonSeverity: 'warning',
                lintIncompleteCaseEnabled: false,
                lintIncompleteCaseSeverity: 'error',
                lintRedundantDistinctEnabled: false,
                lintRedundantDistinctSeverity: 'warning',
                lintDateFunctionUsageEnabled: false,
                lintDateFunctionUsageSeverity: 'information',
                lintWildcardInUpdateEnabled: false,
                lintWildcardInUpdateSeverity: 'error'            },
            compact: {
                dialect: 'hive',
                keywordCase: 'preserve',
                dataTypeCase: 'preserve',
                functionCase: 'preserve',
                identifierCase: 'preserve',
                indentStyle: 'standard',
                logicalOperatorNewline: 'before',
                expressionWidth: 80,
                linesBetweenQueries: 0,
                denseOperators: true,
                newlineBeforeSemicolon: false,
                commaPosition: 'after',
                alignColumnDefinitions: false,
                newlineAfterSelect: false,
                newlineAfterFrom: false,
                newlineBeforeWhere: false,
                newlineAfterWhere: false,
                newlineBeforeOrderBy: false,
                newlineBeforeGroupBy: false,
                newlineBeforeHaving: false,
                newlineBeforeLimit: false,
                newlineAfterGroupBy: false,
                newlineAfterHaving: false,
                newlineAfterOrderBy: false,
                newlineAfterLimit: false,
                newlineAfterJoin: false,
                newlineBeforeOn: false,
                newlineBeforeSetOperation: false,
                newlineAfterCase: false,
                newlineAfterWhen: false,
                newlineAfterThen: false,
                newlineAfterElse: false,
                newlineAfterIn: false,
                tabulateAlias: false,
                newlineBeforeJoin: false,
                alignWhereClauses: false,
                alignCaseStatements: false,
                spaceBeforeComma: false,
                spaceInsideParentheses: false,
                trimTrailingSpaces: true,
                semicolonAtEnd: true,
                singleLineMaxLength: 100,
                nullCase: 'preserve',
                booleanCase: 'preserve',
                indentJoinConditions: false,
                indentWhen: false,
                indentThen: false,
                indentCteBody: false,
                alignOnClauses: false,
                alignInsertColumns: false,
                alignInsertValuesGroups: false,
                maxItemsInlineList: 10,
                cteCommaPosition: 'before',
                subqueryParenStyle: 'inline',
                commentPosition: 'preserve',
                blankLinesBeforeSetOperation: 0,
                blankLinesAfterSetOperation: 0,
                newlineBeforeLateralView: false,
                newlineBeforeDistributeBy: false,
                newlineBeforeClusterBy: false,
                newlineBeforeSortBy: false,
                ignoreTabSettings: false,
                tabSizeOverride: 2,
                insertSpacesOverride: true,
                enableLinter: false,
                showErrorLevel: true,
                showWarningLevel: true,
                showInfoLevel: true,
                enableCodeFolding: false,
                enableOutlineView: false,
                enableStatusBar: false,
                enableParameterHighlight: true,
                enableSnippets: true,
                enableQuickFix: true,
                enableSmartCommentToggle: true,
                headerAuthor: '',
                headerModifier: '',
                completionCommentSnippets: true,
                lintAvoidSelectStarEnabled: false,
                lintAvoidSelectStarSeverity: 'warning',
                lintExplicitJoinTypeEnabled: false,
                lintExplicitJoinTypeSeverity: 'information',
                lintLimitWithOrderByEnabled: false,
                lintLimitWithOrderBySeverity: 'warning',
                lintAvoidColumnCountMismatchEnabled: false,
                lintAvoidColumnCountMismatchSeverity: 'error',
                lintMissingPrimaryKeyEnabled: false,
                lintMissingPrimaryKeySeverity: 'warning',
                lintUseCurrentTimestampEnabled: false,
                lintUseCurrentTimestampSeverity: 'information',
                lintAvoidSelectInInsertEnabled: false,
                lintAvoidSelectInInsertSeverity: 'warning',
                lintDuplicateColumnAliasesEnabled: false,
                lintDuplicateColumnAliasesSeverity: 'warning',
                lintUppercaseKeywordsEnabled: false,
                lintUppercaseKeywordsSeverity: 'information',
                lintConsistentAliasingEnabled: false,
                lintConsistentAliasingSeverity: 'information',
                lintUseCoalesceOverIsnullEnabled: false,
                lintUseCoalesceOverIsnullSeverity: 'information',
                lintExplicitColumnAliasingEnabled: false,
                lintExplicitColumnAliasingSeverity: 'information',
                lintAvoidCorrelatedSubqueriesEnabled: false,
                lintAvoidCorrelatedSubqueriesSeverity: 'warning',
                lintLongQueryLineEnabled: false,
                lintLongQueryLineSeverity: 'information',
                lintMissingQueryCommentEnabled: false,
                lintMissingQueryCommentSeverity: 'warning',
                lintMissingColumnCommentEnabled: false,
                lintMissingColumnCommentSeverity: 'warning',
                lintCommentedOutCodeEnabled: false,
                lintCommentedOutCodeSeverity: 'information',
                lintExpiredTodoEnabled: false,
                lintExpiredTodoSeverity: 'warning',
                lintHavingWithoutGroupByEnabled: false,
                lintHavingWithoutGroupBySeverity: 'warning',
                lintLimitInvalidValueEnabled: false,
                lintLimitInvalidValueSeverity: 'error',
                lintReservedWordIdentifierEnabled: false,
                lintReservedWordIdentifierSeverity: 'warning',
                lintJoinMissingOnEnabled: false,
                lintJoinMissingOnSeverity: 'warning',
                lintSelectWithoutFromEnabled: false,
                lintSelectWithoutFromSeverity: 'warning',
                lintMisplacedDistinctEnabled: false,
                lintMisplacedDistinctSeverity: 'error',
                lintAggregateInWhereEnabled: false,
                lintAggregateInWhereSeverity: 'error',
                lintSubqueryWithoutAliasEnabled: false,
                lintSubqueryWithoutAliasSeverity: 'warning',
                lintSuspiciousNullComparisonEnabled: false,
                lintSuspiciousNullComparisonSeverity: 'warning',
                lintIncompleteCaseEnabled: false,
                lintIncompleteCaseSeverity: 'error',
                lintRedundantDistinctEnabled: false,
                lintRedundantDistinctSeverity: 'warning',
                lintDateFunctionUsageEnabled: false,
                lintDateFunctionUsageSeverity: 'information',
                lintWildcardInUpdateEnabled: false,
                lintWildcardInUpdateSeverity: 'error'            },
            postgresql: {
                dialect: 'postgresql',
                keywordCase: 'upper',
                dataTypeCase: 'lower',
                functionCase: 'lower',
                identifierCase: 'preserve',
                indentStyle: 'standard',
                logicalOperatorNewline: 'before',
                expressionWidth: 50,
                linesBetweenQueries: 1,
                denseOperators: false,
                newlineBeforeSemicolon: false,
                commaPosition: 'after',
                alignColumnDefinitions: false,
                newlineAfterSelect: true,
                newlineAfterFrom: true,
                newlineBeforeWhere: true,
                newlineAfterWhere: true,
                newlineBeforeOrderBy: true,
                newlineBeforeGroupBy: true,
                newlineBeforeHaving: true,
                newlineBeforeLimit: true,
                tabulateAlias: false,
                newlineBeforeJoin: true,
                alignWhereClauses: false,
                alignCaseStatements: false,
                spaceBeforeComma: false,
                spaceInsideParentheses: false,
                trimTrailingSpaces: true,
                semicolonAtEnd: true,
                singleLineMaxLength: 80,
                ignoreTabSettings: false,
                tabSizeOverride: 2,
                insertSpacesOverride: true,
                enableLinter: true,
                showErrorLevel: true,
                showWarningLevel: true,
                showInfoLevel: true,
                enableCodeFolding: true,
                enableOutlineView: true,
                enableStatusBar: true,
                enableParameterHighlight: true,
                enableSnippets: true,
                enableQuickFix: true,
                enableSmartCommentToggle: true,
                headerAuthor: '',
                headerModifier: '',
                completionCommentSnippets: true,
                lintAvoidSelectStarEnabled: true,
                lintAvoidSelectStarSeverity: 'warning',
                lintExplicitJoinTypeEnabled: true,
                lintExplicitJoinTypeSeverity: 'information',
                lintLimitWithOrderByEnabled: true,
                lintLimitWithOrderBySeverity: 'warning',
                lintAvoidColumnCountMismatchEnabled: true,
                lintAvoidColumnCountMismatchSeverity: 'error',
                lintMissingPrimaryKeyEnabled: true,
                lintMissingPrimaryKeySeverity: 'warning',
                lintUseCurrentTimestampEnabled: true,
                lintUseCurrentTimestampSeverity: 'information',
                lintAvoidSelectInInsertEnabled: true,
                lintAvoidSelectInInsertSeverity: 'warning',
                lintDuplicateColumnAliasesEnabled: true,
                lintDuplicateColumnAliasesSeverity: 'warning',
                lintUppercaseKeywordsEnabled: true,
                lintUppercaseKeywordsSeverity: 'information',
                lintConsistentAliasingEnabled: false,
                lintConsistentAliasingSeverity: 'information',
                lintUseCoalesceOverIsnullEnabled: false,
                lintUseCoalesceOverIsnullSeverity: 'information',
                lintExplicitColumnAliasingEnabled: false,
                lintExplicitColumnAliasingSeverity: 'information',
                lintAvoidCorrelatedSubqueriesEnabled: false,
                lintAvoidCorrelatedSubqueriesSeverity: 'warning',
                lintLongQueryLineEnabled: false,
                lintLongQueryLineSeverity: 'information',
                lintMissingQueryCommentEnabled: false,
                lintMissingQueryCommentSeverity: 'warning',
                lintMissingColumnCommentEnabled: false,
                lintMissingColumnCommentSeverity: 'warning',
                lintCommentedOutCodeEnabled: false,
                lintCommentedOutCodeSeverity: 'information',
                lintExpiredTodoEnabled: false,
                lintExpiredTodoSeverity: 'warning',
                lintHavingWithoutGroupByEnabled: false,
                lintHavingWithoutGroupBySeverity: 'warning',
                lintLimitInvalidValueEnabled: false,
                lintLimitInvalidValueSeverity: 'error',
                lintReservedWordIdentifierEnabled: false,
                lintReservedWordIdentifierSeverity: 'warning',
                lintJoinMissingOnEnabled: false,
                lintJoinMissingOnSeverity: 'warning',
                lintSelectWithoutFromEnabled: false,
                lintSelectWithoutFromSeverity: 'warning',
                lintMisplacedDistinctEnabled: false,
                lintMisplacedDistinctSeverity: 'error',
                lintAggregateInWhereEnabled: false,
                lintAggregateInWhereSeverity: 'error',
                lintSubqueryWithoutAliasEnabled: false,
                lintSubqueryWithoutAliasSeverity: 'warning',
                lintSuspiciousNullComparisonEnabled: false,
                lintSuspiciousNullComparisonSeverity: 'warning',
                lintIncompleteCaseEnabled: false,
                lintIncompleteCaseSeverity: 'error',
                lintRedundantDistinctEnabled: false,
                lintRedundantDistinctSeverity: 'warning',
                lintDateFunctionUsageEnabled: false,
                lintDateFunctionUsageSeverity: 'information',
                lintWildcardInUpdateEnabled: false,
                lintWildcardInUpdateSeverity: 'error'            },
            bigquery: {
                dialect: 'bigquery',
                keywordCase: 'upper',
                dataTypeCase: 'upper',
                functionCase: 'lower',
                identifierCase: 'preserve',
                indentStyle: 'standard',
                logicalOperatorNewline: 'before',
                expressionWidth: 50,
                linesBetweenQueries: 1,
                denseOperators: false,
                newlineBeforeSemicolon: false,
                commaPosition: 'after',
                alignColumnDefinitions: false,
                newlineAfterSelect: true,
                newlineAfterFrom: true,
                newlineBeforeWhere: true,
                newlineAfterWhere: true,
                newlineBeforeOrderBy: true,
                newlineBeforeGroupBy: true,
                newlineBeforeHaving: true,
                newlineBeforeLimit: true,
                tabulateAlias: false,
                newlineBeforeJoin: true,
                alignWhereClauses: false,
                alignCaseStatements: false,
                spaceBeforeComma: false,
                spaceInsideParentheses: false,
                trimTrailingSpaces: true,
                semicolonAtEnd: true,
                singleLineMaxLength: 80,
                ignoreTabSettings: false,
                tabSizeOverride: 2,
                insertSpacesOverride: true,
                enableLinter: true,
                showErrorLevel: true,
                showWarningLevel: true,
                showInfoLevel: true,
                enableCodeFolding: true,
                enableOutlineView: true,
                enableStatusBar: true,
                enableParameterHighlight: true,
                enableSnippets: true,
                enableQuickFix: true,
                enableSmartCommentToggle: true,
                headerAuthor: '',
                headerModifier: '',
                completionCommentSnippets: true,
                lintAvoidSelectStarEnabled: true,
                lintAvoidSelectStarSeverity: 'warning',
                lintExplicitJoinTypeEnabled: true,
                lintExplicitJoinTypeSeverity: 'information',
                lintLimitWithOrderByEnabled: true,
                lintLimitWithOrderBySeverity: 'warning',
                lintAvoidColumnCountMismatchEnabled: true,
                lintAvoidColumnCountMismatchSeverity: 'error',
                lintMissingPrimaryKeyEnabled: true,
                lintMissingPrimaryKeySeverity: 'warning',
                lintUseCurrentTimestampEnabled: true,
                lintUseCurrentTimestampSeverity: 'information',
                lintAvoidSelectInInsertEnabled: true,
                lintAvoidSelectInInsertSeverity: 'warning',
                lintDuplicateColumnAliasesEnabled: true,
                lintDuplicateColumnAliasesSeverity: 'warning',
                lintUppercaseKeywordsEnabled: true,
                lintUppercaseKeywordsSeverity: 'information',
                lintConsistentAliasingEnabled: false,
                lintConsistentAliasingSeverity: 'information',
                lintUseCoalesceOverIsnullEnabled: false,
                lintUseCoalesceOverIsnullSeverity: 'information',
                lintExplicitColumnAliasingEnabled: false,
                lintExplicitColumnAliasingSeverity: 'information',
                lintAvoidCorrelatedSubqueriesEnabled: false,
                lintAvoidCorrelatedSubqueriesSeverity: 'warning',
                lintLongQueryLineEnabled: false,
                lintLongQueryLineSeverity: 'information',
                lintMissingQueryCommentEnabled: false,
                lintMissingQueryCommentSeverity: 'warning',
                lintMissingColumnCommentEnabled: false,
                lintMissingColumnCommentSeverity: 'warning',
                lintCommentedOutCodeEnabled: false,
                lintCommentedOutCodeSeverity: 'information',
                lintExpiredTodoEnabled: false,
                lintExpiredTodoSeverity: 'warning',
                lintHavingWithoutGroupByEnabled: false,
                lintHavingWithoutGroupBySeverity: 'warning',
                lintLimitInvalidValueEnabled: false,
                lintLimitInvalidValueSeverity: 'error',
                lintReservedWordIdentifierEnabled: false,
                lintReservedWordIdentifierSeverity: 'warning',
                lintJoinMissingOnEnabled: false,
                lintJoinMissingOnSeverity: 'warning',
                lintSelectWithoutFromEnabled: false,
                lintSelectWithoutFromSeverity: 'warning',
                lintMisplacedDistinctEnabled: false,
                lintMisplacedDistinctSeverity: 'error',
                lintAggregateInWhereEnabled: false,
                lintAggregateInWhereSeverity: 'error',
                lintSubqueryWithoutAliasEnabled: false,
                lintSubqueryWithoutAliasSeverity: 'warning',
                lintSuspiciousNullComparisonEnabled: false,
                lintSuspiciousNullComparisonSeverity: 'warning',
                lintIncompleteCaseEnabled: false,
                lintIncompleteCaseSeverity: 'error',
                lintRedundantDistinctEnabled: false,
                lintRedundantDistinctSeverity: 'warning',
                lintDateFunctionUsageEnabled: false,
                lintDateFunctionUsageSeverity: 'information',
                lintWildcardInUpdateEnabled: false,
                lintWildcardInUpdateSeverity: 'error'            },
            sqlite: {
                dialect: 'sqlite',
                keywordCase: 'upper',
                dataTypeCase: 'upper',
                functionCase: 'lower',
                identifierCase: 'preserve',
                indentStyle: 'standard',
                logicalOperatorNewline: 'before',
                expressionWidth: 50,
                linesBetweenQueries: 1,
                denseOperators: false,
                newlineBeforeSemicolon: false,
                commaPosition: 'after',
                alignColumnDefinitions: false,
                newlineAfterSelect: true,
                newlineAfterFrom: true,
                newlineBeforeWhere: true,
                newlineAfterWhere: true,
                newlineBeforeOrderBy: true,
                newlineBeforeGroupBy: true,
                newlineBeforeHaving: true,
                newlineBeforeLimit: true,
                tabulateAlias: false,
                newlineBeforeJoin: true,
                alignWhereClauses: false,
                alignCaseStatements: false,
                spaceBeforeComma: false,
                spaceInsideParentheses: false,
                trimTrailingSpaces: true,
                semicolonAtEnd: true,
                singleLineMaxLength: 80,
                ignoreTabSettings: false,
                tabSizeOverride: 2,
                insertSpacesOverride: true,
                enableLinter: true,
                showErrorLevel: true,
                showWarningLevel: true,
                showInfoLevel: true,
                enableCodeFolding: true,
                enableOutlineView: true,
                enableStatusBar: true,
                enableParameterHighlight: true,
                enableSnippets: true,
                enableQuickFix: true,
                enableSmartCommentToggle: true,
                headerAuthor: '',
                headerModifier: '',
                completionCommentSnippets: true,
                lintAvoidSelectStarEnabled: true,
                lintAvoidSelectStarSeverity: 'warning',
                lintExplicitJoinTypeEnabled: true,
                lintExplicitJoinTypeSeverity: 'information',
                lintLimitWithOrderByEnabled: true,
                lintLimitWithOrderBySeverity: 'warning',
                lintAvoidColumnCountMismatchEnabled: true,
                lintAvoidColumnCountMismatchSeverity: 'error',
                lintMissingPrimaryKeyEnabled: true,
                lintMissingPrimaryKeySeverity: 'warning',
                lintUseCurrentTimestampEnabled: true,
                lintUseCurrentTimestampSeverity: 'information',
                lintAvoidSelectInInsertEnabled: true,
                lintAvoidSelectInInsertSeverity: 'warning',
                lintDuplicateColumnAliasesEnabled: true,
                lintDuplicateColumnAliasesSeverity: 'warning',
                lintUppercaseKeywordsEnabled: true,
                lintUppercaseKeywordsSeverity: 'information',
                lintConsistentAliasingEnabled: false,
                lintConsistentAliasingSeverity: 'information',
                lintUseCoalesceOverIsnullEnabled: false,
                lintUseCoalesceOverIsnullSeverity: 'information',
                lintExplicitColumnAliasingEnabled: false,
                lintExplicitColumnAliasingSeverity: 'information',
                lintAvoidCorrelatedSubqueriesEnabled: false,
                lintAvoidCorrelatedSubqueriesSeverity: 'warning',
                lintLongQueryLineEnabled: false,
                lintLongQueryLineSeverity: 'information',
                lintMissingQueryCommentEnabled: false,
                lintMissingQueryCommentSeverity: 'warning',
                lintMissingColumnCommentEnabled: false,
                lintMissingColumnCommentSeverity: 'warning',
                lintCommentedOutCodeEnabled: false,
                lintCommentedOutCodeSeverity: 'information',
                lintExpiredTodoEnabled: false,
                lintExpiredTodoSeverity: 'warning',
                lintHavingWithoutGroupByEnabled: false,
                lintHavingWithoutGroupBySeverity: 'warning',
                lintLimitInvalidValueEnabled: false,
                lintLimitInvalidValueSeverity: 'error',
                lintReservedWordIdentifierEnabled: false,
                lintReservedWordIdentifierSeverity: 'warning',
                lintJoinMissingOnEnabled: false,
                lintJoinMissingOnSeverity: 'warning',
                lintSelectWithoutFromEnabled: false,
                lintSelectWithoutFromSeverity: 'warning',
                lintMisplacedDistinctEnabled: false,
                lintMisplacedDistinctSeverity: 'error',
                lintAggregateInWhereEnabled: false,
                lintAggregateInWhereSeverity: 'error',
                lintSubqueryWithoutAliasEnabled: false,
                lintSubqueryWithoutAliasSeverity: 'warning',
                lintSuspiciousNullComparisonEnabled: false,
                lintSuspiciousNullComparisonSeverity: 'warning',
                lintIncompleteCaseEnabled: false,
                lintIncompleteCaseSeverity: 'error',
                lintRedundantDistinctEnabled: false,
                lintRedundantDistinctSeverity: 'warning',
                lintDateFunctionUsageEnabled: false,
                lintDateFunctionUsageSeverity: 'information',
                lintWildcardInUpdateEnabled: false,
                lintWildcardInUpdateSeverity: 'error'            }
        };

        window.addEventListener('message', (event) => {
            const message = event.data;
            switch (message.command) {
                case 'loadConfig':
                    loadConfig(message.data);
                    break;
                case 'previewResult':
                    showPreviewResult(message.data);
                    break;
                case 'saveResult':
                    if (message.success) {
                        showToast(getI18nDict()['configEditor.toast.configSaved'] || '配置已保存', 'success');
                    } else {
                        showToast(getI18nDict()['configEditor.toast.saveFailed'] || '保存失败，请重试', 'error');
                    }
                    break;
                case 'initI18n':
                    if (message.zh) i18nData.zh = message.zh;
                    if (message.en) i18nData.en = message.en;
                    if (message.lang) i18nData.lang = message.lang;
                    applyI18nDict(getI18nDict());
                    var langSelect = document.getElementById('langSelect');
                    if (langSelect) langSelect.value = i18nData.lang;
                    break;
            }
        });

        function loadConfig(config) {
            currentConfig = { ...config };
            Object.keys(config).forEach(key => {
                const el = document.getElementById(key);
                if (el) {
                    if (el.type === 'checkbox') {
                        el.checked = config[key];
                    } else if (el.type === 'number') {
                        el.value = config[key];
                    } else {
                        el.value = config[key];
                    }
                }
            });
            updateTabOverrideGroup();
            var langSelect = document.getElementById('langSelect');
            if (langSelect) {
                langSelect.value = i18nData.lang || 'zh';
            }
        }

        function collectConfig() {
            return {
                dialect: document.getElementById('dialect').value,
                keywordCase: document.getElementById('keywordCase').value,
                dataTypeCase: document.getElementById('dataTypeCase').value,
                functionCase: document.getElementById('functionCase').value,
                identifierCase: document.getElementById('identifierCase').value,
                indentStyle: document.getElementById('indentStyle').value,
                logicalOperatorNewline: document.getElementById('logicalOperatorNewline').value,
                expressionWidth: parseInt(document.getElementById('expressionWidth').value),
                linesBetweenQueries: parseInt(document.getElementById('linesBetweenQueries').value),
                denseOperators: document.getElementById('denseOperators').checked,
                newlineBeforeSemicolon: document.getElementById('newlineBeforeSemicolon').checked,
                commaPosition: document.getElementById('commaPosition').value,
                alignColumnDefinitions: document.getElementById('alignColumnDefinitions').checked,
                newlineAfterSelect: document.getElementById('newlineAfterSelect').checked,
                newlineAfterFrom: document.getElementById('newlineAfterFrom').checked,
                newlineBeforeWhere: document.getElementById('newlineBeforeWhere').checked,
                newlineAfterWhere: document.getElementById('newlineAfterWhere').checked,
                newlineBeforeOrderBy: document.getElementById('newlineBeforeOrderBy').checked,
                newlineBeforeGroupBy: document.getElementById('newlineBeforeGroupBy').checked,
                newlineBeforeHaving: document.getElementById('newlineBeforeHaving').checked,
                newlineBeforeLimit: document.getElementById('newlineBeforeLimit').checked,
                newlineAfterGroupBy: document.getElementById('newlineAfterGroupBy').checked,
                newlineAfterHaving: document.getElementById('newlineAfterHaving').checked,
                newlineAfterOrderBy: document.getElementById('newlineAfterOrderBy').checked,
                newlineAfterLimit: document.getElementById('newlineAfterLimit').checked,
                newlineAfterJoin: document.getElementById('newlineAfterJoin').checked,
                newlineBeforeOn: document.getElementById('newlineBeforeOn').checked,
                newlineBeforeSetOperation: document.getElementById('newlineBeforeSetOperation').checked,
                newlineAfterCase: document.getElementById('newlineAfterCase').checked,
                newlineAfterWhen: document.getElementById('newlineAfterWhen').checked,
                newlineAfterThen: document.getElementById('newlineAfterThen').checked,
                newlineAfterElse: document.getElementById('newlineAfterElse').checked,
                newlineAfterIn: document.getElementById('newlineAfterIn').checked,
                tabulateAlias: document.getElementById('tabulateAlias').checked,
                newlineBeforeJoin: document.getElementById('newlineBeforeJoin').checked,
                alignWhereClauses: document.getElementById('alignWhereClauses').checked,
                alignCaseStatements: document.getElementById('alignCaseStatements').checked,
                spaceBeforeComma: document.getElementById('spaceBeforeComma').checked,
                spaceInsideParentheses: document.getElementById('spaceInsideParentheses').checked,
                trimTrailingSpaces: document.getElementById('trimTrailingSpaces').checked,
                semicolonAtEnd: document.getElementById('semicolonAtEnd').checked,
                singleLineMaxLength: parseInt(document.getElementById('singleLineMaxLength').value),
                nullCase: document.getElementById('nullCase').value,
                booleanCase: document.getElementById('booleanCase').value,
                indentJoinConditions: document.getElementById('indentJoinConditions').checked,
                indentWhen: document.getElementById('indentWhen').checked,
                indentThen: document.getElementById('indentThen').checked,
                indentCteBody: document.getElementById('indentCteBody').checked,
                alignOnClauses: document.getElementById('alignOnClauses').checked,
                alignInsertColumns: document.getElementById('alignInsertColumns').checked,
                alignInsertValuesGroups: document.getElementById('alignInsertValuesGroups').checked,
                maxItemsInlineList: parseInt(document.getElementById('maxItemsInlineList').value),
                cteCommaPosition: document.getElementById('cteCommaPosition').value,
                subqueryParenStyle: document.getElementById('subqueryParenStyle').value,
                commentPosition: document.getElementById('commentPosition').value,
                blankLinesBeforeSetOperation: parseInt(document.getElementById('blankLinesBeforeSetOperation').value),
                blankLinesAfterSetOperation: parseInt(document.getElementById('blankLinesAfterSetOperation').value),
                newlineBeforeLateralView: document.getElementById('newlineBeforeLateralView').checked,
                newlineBeforeDistributeBy: document.getElementById('newlineBeforeDistributeBy').checked,
                newlineBeforeClusterBy: document.getElementById('newlineBeforeClusterBy').checked,
                newlineBeforeSortBy: document.getElementById('newlineBeforeSortBy').checked,
                ignoreTabSettings: document.getElementById('ignoreTabSettings').checked,
                tabSizeOverride: parseInt(document.getElementById('tabSizeOverride').value),
                insertSpacesOverride: true,
                enableLinter: document.getElementById('enableLinter').checked,
                showErrorLevel: document.getElementById('showErrorLevel').checked,
                showWarningLevel: document.getElementById('showWarningLevel').checked,
                showInfoLevel: document.getElementById('showInfoLevel').checked,
                enableCodeFolding: document.getElementById('enableCodeFolding').checked,
                enableOutlineView: document.getElementById('enableOutlineView').checked,
                enableStatusBar: document.getElementById('enableStatusBar').checked,
                enableParameterHighlight: document.getElementById('enableParameterHighlight').checked,
                enableSnippets: document.getElementById('enableSnippets').checked,
                enableQuickFix: document.getElementById('enableQuickFix').checked,
                enableSmartCommentToggle: document.getElementById('enableSmartCommentToggle').checked,
                headerAuthor: document.getElementById('headerAuthor').value,
                headerModifier: document.getElementById('headerModifier').value,
                completionCommentSnippets: document.getElementById('completionCommentSnippets').checked,
                lintAvoidSelectStarEnabled: document.getElementById('lintAvoidSelectStarEnabled').checked,
                lintAvoidSelectStarSeverity: document.getElementById('lintAvoidSelectStarSeverity').value,
                lintExplicitJoinTypeEnabled: document.getElementById('lintExplicitJoinTypeEnabled').checked,
                lintExplicitJoinTypeSeverity: document.getElementById('lintExplicitJoinTypeSeverity').value,
                lintLimitWithOrderByEnabled: document.getElementById('lintLimitWithOrderByEnabled').checked,
                lintLimitWithOrderBySeverity: document.getElementById('lintLimitWithOrderBySeverity').value,
                lintAvoidColumnCountMismatchEnabled: document.getElementById('lintAvoidColumnCountMismatchEnabled').checked,
                lintAvoidColumnCountMismatchSeverity: document.getElementById('lintAvoidColumnCountMismatchSeverity').value,
                lintMissingPrimaryKeyEnabled: document.getElementById('lintMissingPrimaryKeyEnabled').checked,
                lintMissingPrimaryKeySeverity: document.getElementById('lintMissingPrimaryKeySeverity').value,
                lintUseCurrentTimestampEnabled: document.getElementById('lintUseCurrentTimestampEnabled').checked,
                lintUseCurrentTimestampSeverity: document.getElementById('lintUseCurrentTimestampSeverity').value,
                lintAvoidSelectInInsertEnabled: document.getElementById('lintAvoidSelectInInsertEnabled').checked,
                lintAvoidSelectInInsertSeverity: document.getElementById('lintAvoidSelectInInsertSeverity').value,
                lintDuplicateColumnAliasesEnabled: document.getElementById('lintDuplicateColumnAliasesEnabled').checked,
                lintDuplicateColumnAliasesSeverity: document.getElementById('lintDuplicateColumnAliasesSeverity').value,
                lintUppercaseKeywordsEnabled: document.getElementById('lintUppercaseKeywordsEnabled').checked,
                lintUppercaseKeywordsSeverity: document.getElementById('lintUppercaseKeywordsSeverity').value,
                lintConsistentAliasingEnabled: document.getElementById('lintConsistentAliasingEnabled').checked,
                lintConsistentAliasingSeverity: document.getElementById('lintConsistentAliasingSeverity').value,
                lintUseCoalesceOverIsnullEnabled: document.getElementById('lintUseCoalesceOverIsnullEnabled').checked,
                lintUseCoalesceOverIsnullSeverity: document.getElementById('lintUseCoalesceOverIsnullSeverity').value,
                lintExplicitColumnAliasingEnabled: document.getElementById('lintExplicitColumnAliasingEnabled').checked,
                lintExplicitColumnAliasingSeverity: document.getElementById('lintExplicitColumnAliasingSeverity').value,
                lintAvoidCorrelatedSubqueriesEnabled: document.getElementById('lintAvoidCorrelatedSubqueriesEnabled').checked,
                lintAvoidCorrelatedSubqueriesSeverity: document.getElementById('lintAvoidCorrelatedSubqueriesSeverity').value,
                lintLongQueryLineEnabled: document.getElementById('lintLongQueryLineEnabled').checked,
                lintLongQueryLineSeverity: document.getElementById('lintLongQueryLineSeverity').value,
                lintMissingQueryCommentEnabled: document.getElementById('lintMissingQueryCommentEnabled').checked,
                lintMissingQueryCommentSeverity: document.getElementById('lintMissingQueryCommentSeverity').value,
                lintMissingColumnCommentEnabled: document.getElementById('lintMissingColumnCommentEnabled').checked,
                lintMissingColumnCommentSeverity: document.getElementById('lintMissingColumnCommentSeverity').value,
                lintCommentedOutCodeEnabled: document.getElementById('lintCommentedOutCodeEnabled').checked,
                lintCommentedOutCodeSeverity: document.getElementById('lintCommentedOutCodeSeverity').value,
                lintExpiredTodoEnabled: document.getElementById('lintExpiredTodoEnabled').checked,
                lintExpiredTodoSeverity: document.getElementById('lintExpiredTodoSeverity').value,
                lintHavingWithoutGroupByEnabled: document.getElementById('lintHavingWithoutGroupByEnabled').checked,
                lintHavingWithoutGroupBySeverity: document.getElementById('lintHavingWithoutGroupBySeverity').value,
                lintLimitInvalidValueEnabled: document.getElementById('lintLimitInvalidValueEnabled').checked,
                lintLimitInvalidValueSeverity: document.getElementById('lintLimitInvalidValueSeverity').value,
                lintReservedWordIdentifierEnabled: document.getElementById('lintReservedWordIdentifierEnabled').checked,
                lintReservedWordIdentifierSeverity: document.getElementById('lintReservedWordIdentifierSeverity').value,
                lintJoinMissingOnEnabled: document.getElementById('lintJoinMissingOnEnabled').checked,
                lintJoinMissingOnSeverity: document.getElementById('lintJoinMissingOnSeverity').value,
                lintSelectWithoutFromEnabled: document.getElementById('lintSelectWithoutFromEnabled').checked,
                lintSelectWithoutFromSeverity: document.getElementById('lintSelectWithoutFromSeverity').value,
                lintMisplacedDistinctEnabled: document.getElementById('lintMisplacedDistinctEnabled').checked,
                lintMisplacedDistinctSeverity: document.getElementById('lintMisplacedDistinctSeverity').value,
                lintAggregateInWhereEnabled: document.getElementById('lintAggregateInWhereEnabled').checked,
                lintAggregateInWhereSeverity: document.getElementById('lintAggregateInWhereSeverity').value,
                lintSubqueryWithoutAliasEnabled: document.getElementById('lintSubqueryWithoutAliasEnabled').checked,
                lintSubqueryWithoutAliasSeverity: document.getElementById('lintSubqueryWithoutAliasSeverity').value,
                lintSuspiciousNullComparisonEnabled: document.getElementById('lintSuspiciousNullComparisonEnabled').checked,
                lintSuspiciousNullComparisonSeverity: document.getElementById('lintSuspiciousNullComparisonSeverity').value,
                lintIncompleteCaseEnabled: document.getElementById('lintIncompleteCaseEnabled').checked,
                lintIncompleteCaseSeverity: document.getElementById('lintIncompleteCaseSeverity').value,
                lintRedundantDistinctEnabled: document.getElementById('lintRedundantDistinctEnabled').checked,
                lintRedundantDistinctSeverity: document.getElementById('lintRedundantDistinctSeverity').value,
                lintDateFunctionUsageEnabled: document.getElementById('lintDateFunctionUsageEnabled').checked,
                lintDateFunctionUsageSeverity: document.getElementById('lintDateFunctionUsageSeverity').value,
                lintWildcardInUpdateEnabled: document.getElementById('lintWildcardInUpdateEnabled').checked,
                lintWildcardInUpdateSeverity: document.getElementById('lintWildcardInUpdateSeverity').value,
                queryMaxRows: parseInt(document.getElementById('queryMaxRows').value),
                queryTimeout: parseInt(document.getElementById('queryTimeout').value),
                queryPageSize: parseInt(document.getElementById('queryPageSize').value),
                queryNullPlaceholder: document.getElementById('queryNullPlaceholder').value,
                safetyGuardLevel: document.getElementById('safetyGuardLevel').value,
                executionBatchMode: document.getElementById('executionBatchMode').value,
                executionOnError: document.getElementById('executionOnError').value,
                executionSaveProgress: document.getElementById('executionSaveProgress').checked,
                historyMaxEntries: parseInt(document.getElementById('historyMaxEntries').value),
                exportDefaultFormat: document.getElementById('exportDefaultFormat').value,
                exportCsvDelimiter: document.getElementById('exportCsvDelimiter').value,
                exportCsvEncoding: document.getElementById('exportCsvEncoding').value,
                exportIncludeHeaders: document.getElementById('exportIncludeHeaders').checked,
                resultsEnablePreload: document.getElementById('resultsEnablePreload').checked,
                resultsJsonPrettyPrint: document.getElementById('resultsJsonPrettyPrint').checked,
                resultsDateFormat: document.getElementById('resultsDateFormat').value,
                resultsLongTextThreshold: parseInt(document.getElementById('resultsLongTextThreshold').value),
                dataEditorEditMode: document.getElementById('dataEditorEditMode').value,
                dataEditorAutoCommit: document.getElementById('dataEditorAutoCommit').checked,
                dataEditorDefaultView: document.getElementById('dataEditorDefaultView').value,
                dataEditorEnableValidation: document.getElementById('dataEditorEnableValidation').checked,
                dataEditorValidateOnEdit: document.getElementById('dataEditorValidateOnEdit').checked,
                dataEditorValidateForeignKeys: document.getElementById('dataEditorValidateForeignKeys').checked,
                schemaCacheDatabaseTtl: parseInt(document.getElementById('schemaCacheDatabaseTtl').value),
                schemaCacheTableTtl: parseInt(document.getElementById('schemaCacheTableTtl').value),
                schemaCacheColumnTtl: parseInt(document.getElementById('schemaCacheColumnTtl').value),
                schemaCacheFunctionTtl: parseInt(document.getElementById('schemaCacheFunctionTtl').value),
                schemaCacheRefreshOnDDL: document.getElementById('schemaCacheRefreshOnDDL').checked,
                schemaCachePrefetchOnConnect: document.getElementById('schemaCachePrefetchOnConnect').checked
            };
        }

        function saveConfig() {
            const config = collectConfig();
            vscode.postMessage({ command: 'updateConfig', data: config });
        }

        function showToast(message, type) {
            const toast = document.getElementById('toast');
            toast.textContent = message;
            toast.className = 'toast ' + type + ' show';
            setTimeout(() => { toast.classList.remove('show'); }, 2000);
        }

        function toggleGroup(header) {
            const arrow = header.querySelector('.cg-arrow');
            const body = header.nextElementSibling;
            const isOpen = body.classList.contains('open');
            if (isOpen) {
                arrow.classList.remove('open');
                body.classList.remove('open');
            } else {
                arrow.classList.add('open');
                body.classList.add('open');
            }
        }

        function resetConfig() {
            applyPreset('default');
            saveConfig();
        }

        function applyPreset(presetName) {
            const preset = presets[presetName];
            loadConfig({ ...presets.default, ...preset });
        }

        function previewFormat() {
            const sql = document.getElementById('previewInput').value;
            const config = collectConfig();
            vscode.postMessage({ command: 'previewFormat', sql, config });
        }

        function showPreviewResult(result) {
            const resultEl = document.getElementById('previewResult');
            resultEl.classList.remove('empty');
            resultEl.classList.add('success');
            resultEl.textContent = result;
            setTimeout(() => { resultEl.classList.remove('success'); }, 1000);
        }

        function updateTabOverrideGroup() {
            const group = document.getElementById('tabOverrideGroup');
            const checkbox = document.getElementById('ignoreTabSettings');
            group.style.display = checkbox.checked ? 'block' : 'none';
        }

        document.getElementById('ignoreTabSettings').addEventListener('change', updateTabOverrideGroup);

        function switchTab(tabName) {
            // Clear search and reset filtering when switching tabs
            var searchInput = document.getElementById('configSearch');
            if (searchInput && searchInput.value) {
                searchInput.value = '';
                searchConfig('');
            }

            // Hide all tab contents
            document.querySelectorAll('.tab-content').forEach(function(el) {
                el.classList.remove('active');
            });

            // Show the target tab
            var targetTab = document.getElementById('tab-' + tabName);
            if (targetTab) {
                targetTab.classList.add('active');
            }

            // Update tab button active state
            document.querySelectorAll('.tab-btn').forEach(function(btn) {
                btn.classList.remove('active');
                if (btn.getAttribute('data-action-arg') === tabName) {
                    btn.classList.add('active');
                }
            });

            currentActiveTab = tabName;
        }

        function searchConfig(query) {
            var searchEmpty = document.getElementById('searchEmpty');
            var searchClear = document.getElementById('searchClear');

            if (!query) {
                // Show all groups/items
                document.querySelectorAll('.search-hidden').forEach(function(el) {
                    el.classList.remove('search-hidden');
                });
                if (searchEmpty) searchEmpty.style.display = 'none';
                if (searchClear) searchClear.style.display = 'none';

                // Restore tab visibility to current active tab
                document.querySelectorAll('.tab-content').forEach(function(el) {
                    el.classList.remove('active');
                });
                var activeTab = document.getElementById('tab-' + currentActiveTab);
                if (activeTab) activeTab.classList.add('active');
                return;
            }

            // Show clear button
            if (searchClear) searchClear.style.display = '';

            // Show all tab contents so search spans all tabs
            document.querySelectorAll('.tab-content').forEach(function(el) {
                el.classList.add('active');
            });

            var lowerQuery = query.toLowerCase();
            var anyVisible = false;

            // Iterate all config groups
            document.querySelectorAll('.config-group').forEach(function(group) {
                var groupText = group.textContent.toLowerCase();
                var groupMatches = groupText.indexOf(lowerQuery) !== -1;

                if (groupMatches) {
                    // Show the group and expand it
                    group.classList.remove('search-hidden');
                    var arrow = group.querySelector('.cg-arrow');
                    var body = group.querySelector('.cg-body') || group.querySelector('.config-group-body');
                    // Try nextElementSibling as fallback for the body
                    if (!body) {
                        var header = group.querySelector('.cg-header');
                        if (header) body = header.nextElementSibling;
                    }
                    if (arrow) arrow.classList.add('open');
                    if (body) body.classList.add('open');

                    // Filter individual items within the group
                    var items = group.querySelectorAll('.config-item, .toggle-row, .lint-rule');
                    var hasVisibleItem = false;
                    items.forEach(function(item) {
                        var itemText = item.textContent.toLowerCase();
                        if (itemText.indexOf(lowerQuery) !== -1) {
                            item.classList.remove('search-hidden');
                            hasVisibleItem = true;
                        } else {
                            item.classList.add('search-hidden');
                        }
                    });

                    // If no individual items matched but group header matched, show all items
                    if (!hasVisibleItem && items.length > 0) {
                        items.forEach(function(item) {
                            item.classList.remove('search-hidden');
                        });
                    }

                    anyVisible = true;
                } else {
                    // Hide the group
                    group.classList.add('search-hidden');
                }
            });

            // Show/hide search empty message
            if (searchEmpty) {
                searchEmpty.style.display = anyVisible ? 'none' : '';
            }
        }

        function clearSearch() {
            var searchInput = document.getElementById('configSearch');
            if (searchInput) searchInput.value = '';
            searchConfig('');
        }

        const vscode = acquireVsCodeApi();

        function bindActions() {
            document.querySelectorAll('[data-action]').forEach(function(el) {
                var action = el.getAttribute('data-action');
                var arg = el.getAttribute('data-action-arg');
                if (action && typeof window[action] === 'function') {
                    if (el.tagName === 'SELECT') {
                        el.addEventListener('change', function() {
                            if (arg !== null) {
                                window[action](arg);
                            } else {
                                window[action](el.value);
                            }
                        });
                    } else if (el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'number')) {
                        el.addEventListener('input', function() {
                            if (arg !== null) {
                                window[action](arg);
                            } else {
                                window[action](el.value);
                            }
                        });
                    } else {
                        el.addEventListener('click', function(e) {
                            if (action === 'toggleGroup') {
                                window[action](el);
                            } else if (arg !== null) {
                                var numArg = Number(arg);
                                window[action](isNaN(numArg) || arg.trim() === '' ? arg : numArg);
                            } else {
                                window[action]();
                            }
                        });
                    }
                }
                el.removeAttribute('data-action');
                el.removeAttribute('data-action-arg');
            });
        }

        bindActions();
        vscode.postMessage({ command: 'getCurrentConfig' });