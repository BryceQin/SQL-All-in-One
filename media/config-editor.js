// vscode 句柄必须最先声明：changeLanguage（下方）及文件末尾的若干
// vscode.postMessage 立即调用都依赖该变量。若在文件中部才声明，函数体
// 内对 vscode 的引用会落入 const 的暂时性死区（TDZ），一旦这些函数在
// 声明执行前被调用即抛 ReferenceError。复用 shared.js 缓存的 window.vscode，
// 避免重复调用 acquireVsCodeApi()（VS Code 每个 webview 仅允许调用一次）。
const vscode = window.vscode || acquireVsCodeApi();

        var i18nData = {
    zh: {
        'configEditor.tab.formatting': '格式化',
        'configEditor.tab.editor': '编辑器',
        'configEditor.tab.database': '数据库',
        'configEditor.searchPlaceholder': '搜索配置项...',
        'configEditor.searchEmpty': '未找到匹配的配置项',
        'configEditor.expandAll': '全部展开',
        'configEditor.collapseAll': '全部折叠',
        'configEditor.conn.error.sshHostRequired': 'SSH 主机不能为空',
        'configEditor.conn.error.sshUserRequired': 'SSH 用户名不能为空',
        'configEditor.conn.lbl.sshHost': 'SSH 主机',
        'configEditor.conn.lbl.sshPort': 'SSH 端口',
        'configEditor.conn.lbl.sshUsername': 'SSH 用户名',
        'configEditor.conn.lbl.sshPassword': 'SSH 密码',
        'configEditor.conn.lbl.privateKey': '私钥',
        'configEditor.conn.lbl.passphrase': '口令',
        'configEditor.conn.lbl.caCert': 'CA 证书',
        'configEditor.conn.lbl.clientCert': '客户端证书',
        'configEditor.conn.lbl.clientKey': '客户端密钥'
    },
    en: {
        'configEditor.tab.formatting': 'Formatting',
        'configEditor.tab.editor': 'Editor',
        'configEditor.tab.database': 'Database',
        'configEditor.searchPlaceholder': 'Search settings...',
        'configEditor.searchEmpty': 'No matching settings found',
        'configEditor.expandAll': 'Expand All',
        'configEditor.collapseAll': 'Collapse All',
        'configEditor.conn.error.sshHostRequired': 'SSH host is required',
        'configEditor.conn.error.sshUserRequired': 'SSH username is required',
        'configEditor.conn.lbl.sshHost': 'SSH Host',
        'configEditor.conn.lbl.sshPort': 'SSH Port',
        'configEditor.conn.lbl.sshUsername': 'SSH Username',
        'configEditor.conn.lbl.sshPassword': 'SSH Password',
        'configEditor.conn.lbl.privateKey': 'Private Key',
        'configEditor.conn.lbl.passphrase': 'Passphrase',
        'configEditor.conn.lbl.caCert': 'CA Certificate',
        'configEditor.conn.lbl.clientCert': 'Client Certificate',
        'configEditor.conn.lbl.clientKey': 'Client Key'
    },
    lang: 'zh'
};

function getI18nDict() {
    return i18nData.lang === 'en' ? i18nData.en : i18nData.zh;
}

applyI18nDict(getI18nDict());

function applyI18nDict(dict) {
    if (!dict) return;
    // 委托给 shared.js 的 window.applyI18n，translate 回调查传入的 dict。
    // 旧版仅区分 TITLE（写 document.title），由 window.applyI18n 的
    // titleTagSpecial 默认开启处理。旧版不扫描 data-i18n-title，但本面板
    // HTML 无该属性元素，扫描结果为空，行为一致。
    window.applyI18n(document, function(key) { return dict[key]; });
}

function changeLanguage(lang) {
    i18nData.lang = lang;
    applyI18nDict(getI18nDict());
    document.documentElement.lang = lang;
    vscode.postMessage({ command: 'changeLanguage', lang: lang });
}

        let initialConfigSnapshot = {};
        let currentConfig = {
            enableSmartCommentToggle: true,
            headerAuthor: '',
            headerModifier: '',
            completionCommentSnippets: true,
        };

        let currentActiveTab = 'formatting';

        let isDirty = false;
        var searchDebounceTimer = null;

        function clearAllModifiedDots() {
            document.querySelectorAll('.ci-modified-dot').forEach(function(dot) { dot.remove(); });
        }

        function updateModifiedDots() {
            clearAllModifiedDots();
            Object.keys(currentConfig).forEach(function(key) {
                var el = document.getElementById(key);
                if (!el) return;
                var currentVal = el.type === 'checkbox' ? el.checked : el.value;
                var initialVal = initialConfigSnapshot[key];
                if (String(currentVal) !== String(initialVal)) {
                    var label = el.closest('.config-item, .toggle-row, .lint-rule');
                    if (label && !label.querySelector('.ci-modified-dot')) {
                        var dot = document.createElement('span');
                        dot.className = 'ci-modified-dot';
                        dot.title = getI18nDict()['configEditor.conn.modified'] || '已修改';
                        label.appendChild(dot);
                    }
                }
            });
        }

        function locateModified() {
            var firstModified = document.querySelector('.ci-modified-dot');
            if (firstModified) {
                firstModified.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else {
                showToast(getI18nDict()['configEditor.noModified'] || '无修改项', 'success');
            }
        }

        function markDirty() {
            isDirty = true;
            updateModifiedDots();
            var saveBtn = document.querySelector('[data-action="saveConfig"]');
            if (saveBtn) saveBtn.classList.add('btn-dirty');
        }

        function clearDirty() {
            isDirty = false;
            var saveBtn = document.querySelector('[data-action="saveConfig"]');
            if (saveBtn) saveBtn.classList.remove('btn-dirty');
        }

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
                case 'connectionsList':
                    renderConnections(message.connections, message.groups);
                    break;
                case 'connectionSaveResult':
                    handleConnectionSaveResult(message);
                    break;
                case 'connectionTestResult':
                    handleConnectionTestResult(message);
                    break;
                case 'connectionDeleteResult':
                    if (message.success) {
                        vscode.postMessage({ command: 'getConnections' });
                    }
                    break;
                case 'supportedDialects':
                    supportedDialects = message.supported || [];
                    knownDialects = message.known || knownDialects;
                    renderCfDialect();
                    break;
                case 'editConnectionDetail':
                    handleEditConnectionDetail(message);
                    break;
                case 'navigateTo':
                    if (message.tab) {
                        switchTab(message.tab);
                    }
                    if (message.autoAddConnection) {
                        setTimeout(function() { addConnection(); }, 100);
                    }
                    break;
            }
        });

        function loadConfig(config) {
            currentConfig = { ...config };
            initialConfigSnapshot = JSON.parse(JSON.stringify(config));
            clearAllModifiedDots();
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
            updateLintDots();
            var langSelect = document.getElementById('langSelect');
            if (langSelect) {
                langSelect.value = i18nData.lang || 'zh';
            }
            restoreGroupStates();
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
            clearDirty();
        }

        function showToast(message, type) {
            const toast = document.getElementById('toast');
            toast.textContent = message;
            toast.className = 'toast ' + type + ' show';
            setTimeout(() => { toast.classList.remove('show'); }, 2000);
        }

        var GROUP_STATE_PREFIX = 'configEditor.groupState.';

        function getGroupStateKey(group) {
            var title = group.querySelector('.cg-title');
            return title ? title.getAttribute('data-i18n') || title.textContent : '';
        }

        function saveGroupState(group, isOpen) {
            var key = getGroupStateKey(group);
            if (key) {
                try { localStorage.setItem(GROUP_STATE_PREFIX + key, isOpen ? '1' : '0'); } catch (e) {}
            }
        }

        function loadGroupState(group) {
            var key = getGroupStateKey(group);
            if (!key) return null;
            try { return localStorage.getItem(GROUP_STATE_PREFIX + key); } catch (e) { return null; }
        }

        function restoreGroupStates() {
            document.querySelectorAll('.config-group').forEach(function(group) {
                var saved = loadGroupState(group);
                if (saved === null) return;
                var arrow = group.querySelector('.cg-arrow');
                var body = group.querySelector('.cg-body');
                if (saved === '1') {
                    if (arrow) arrow.classList.add('open');
                    if (body) body.classList.add('open');
                } else {
                    if (arrow) arrow.classList.remove('open');
                    if (body) body.classList.remove('open');
                }
            });
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
            var group = header.closest('.config-group');
            if (group) saveGroupState(group, !isOpen);
        }

        function expandAll() {
            var activeTab = document.getElementById('tab-' + currentActiveTab);
            if (!activeTab) return;
            activeTab.querySelectorAll('.cg-arrow').forEach(function(arrow) {
                arrow.classList.add('open');
            });
            activeTab.querySelectorAll('.cg-body').forEach(function(body) {
                body.classList.add('open');
            });
        }

        function collapseAll() {
            var activeTab = document.getElementById('tab-' + currentActiveTab);
            if (!activeTab) return;
            activeTab.querySelectorAll('.cg-arrow').forEach(function(arrow) {
                arrow.classList.remove('open');
            });
            activeTab.querySelectorAll('.cg-body').forEach(function(body) {
                body.classList.remove('open');
            });
        }

        function togglePasswordVisibility(btn) {
            var targetId = btn.getAttribute('data-target');
            var input = document.getElementById(targetId);
            if (!input) return;
            if (input.type === 'password') {
                input.type = 'text';
            } else {
                input.type = 'password';
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

        var SQL_KEYWORDS = ['SELECT','FROM','WHERE','ORDER','BY','GROUP','HAVING','LIMIT','JOIN','LEFT','RIGHT','INNER','OUTER','ON','AS','AND','OR','NOT','IN','IS','NULL','LIKE','BETWEEN','CASE','WHEN','THEN','ELSE','END','UNION','ALL','DISTINCT','INSERT','INTO','VALUES','UPDATE','SET','DELETE','CREATE','TABLE','DROP','ALTER','ADD','PRIMARY','KEY','FOREIGN','REFERENCES','INDEX','VIEW','DATABASE','SCHEMA','IF','EXISTS','DEFAULT','CONSTRAINT','CHECK','UNIQUE','CASCADE','WITH','RECURSIVE','OVER','PARTITION','ROW_NUMBER','RANK','DENSE_RANK','LATERAL','VIEW','DISTRIBUTE','CLUSTER','SORT'];

        function highlightSql(sql) {
            var escaped = escapeHtml(sql);
            var keywordPattern = new RegExp('\\b(' + SQL_KEYWORDS.join('|') + ')\\b', 'gi');
            escaped = escaped.replace(keywordPattern, '<span class="tok-keyword">$1</span>');
            escaped = escaped.replace(/('(?:[^']|'')*')/g, '<span class="tok-string">$1</span>');
            escaped = escaped.replace(/(--[^\n]*)/g, '<span class="tok-comment">$1</span>');
            escaped = escaped.replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="tok-comment">$1</span>');
            escaped = escaped.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="tok-number">$1</span>');
            return escaped;
        }

        function showPreviewResult(result) {
            const resultEl = document.getElementById('previewResult');
            resultEl.classList.remove('empty');
            resultEl.classList.add('success');
            resultEl.innerHTML = highlightSql(result);
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
            var searchInput = document.getElementById('searchInput');
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
                btn.setAttribute('aria-selected', 'false');
                if (btn.getAttribute('data-action-arg') === tabName) {
                    btn.classList.add('active');
                    btn.setAttribute('aria-selected', 'true');
                }
            });

            currentActiveTab = tabName;
        }

        function highlightSearchMatch(text, query) {
            if (!query) return escapeHtml(text);
            var escaped = escapeHtml(text);
            var lowerText = escaped.toLowerCase();
            var lowerQuery = query.toLowerCase();
            var result = '';
            var idx = 0;
            var pos;
            while ((pos = lowerText.indexOf(lowerQuery, idx)) !== -1) {
                result += escaped.substring(idx, pos);
                result += '<mark class="search-mark">' + escaped.substring(pos, pos + query.length) + '</mark>';
                idx = pos + query.length;
            }
            result += escaped.substring(idx);
            return result;
        }

        function searchConfig(query) {
            var searchEmpty = document.getElementById('searchEmpty');
            var searchClear = document.getElementById('searchClear');

            if (!query) {
                // Show all groups/items
                document.querySelectorAll('.search-hidden').forEach(function(el) {
                    el.classList.remove('search-hidden');
                });
                document.querySelectorAll('.search-mark').forEach(function(mark) {
                    var parent = mark.parentNode;
                    parent.replaceChild(document.createTextNode(mark.textContent), mark);
                    parent.normalize();
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
                            var labelText = item.querySelector('.ci-label-text, .toggle-label, .lint-rule-name');
                            if (labelText && !labelText.querySelector('mark')) {
                                var originalText = labelText.textContent;
                                labelText.innerHTML = highlightSearchMatch(originalText, query);
                            }
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
            var searchInput = document.getElementById('searchInput');
            if (searchInput) searchInput.value = '';
            searchConfig('');
        }

        // bindActions 委托给 shared.js 的 window.bindDataActions。本面板有三个
        // 特殊 case，均通过 handlers 覆盖：
        //   - searchConfig：INPUT input 需要 200ms 防抖后调用 searchConfig(el.value)。
        //   - toggleGroup：click 时传入元素本身 toggleGroup(el)（而非 arg）。
        //   - 其余 click（如 switchTab / editConnection）需要保留 data-action-arg
        //     供绑定之后的 switchTab/switchConnFormTab/键盘导航按属性查找按钮，
        //     故启用 keepArg。
        // 其余分支：SELECT 无 arg 传 el.value（selectValueFallback: true）、
        // INPUT input 有 arg 传 arg、无 arg 传 el.value、click 走数字强制，均与
        // 默认行为一致。
        function bindActions() {
            window.bindDataActions({
                selectValueFallback: true,
                keepArg: true,
                handlers: {
                    searchConfig: function(el) {
                        clearTimeout(searchDebounceTimer);
                        searchDebounceTimer = setTimeout(function() {
                            window.searchConfig(el.value);
                        }, 200);
                    },
                    toggleGroup: function(el) {
                        window.toggleGroup(el);
                    }
                }
            });
        }

        function updateLintDots() {
            document.querySelectorAll('.lint-rule-severity').forEach(function(sel) {
                var rule = sel.closest('.lint-rule');
                if (!rule) return;
                var dot = rule.querySelector('.lint-rule-dot');
                if (!dot) return;
                dot.className = 'lint-rule-dot ' + sel.value;
            });
        }

        document.addEventListener('change', function(e) {
            if (e.target.classList && e.target.classList.contains('lint-rule-severity')) {
                var rule = e.target.closest('.lint-rule');
                if (!rule) return;
                var dot = rule.querySelector('.lint-rule-dot');
                if (!dot) return;
                dot.className = 'lint-rule-dot ' + e.target.value;
            }
        });

        let supportedDialects = [];
        let knownDialects = ['mysql', 'hive', 'spark', 'flinksql', 'postgresql', 'bigquery', 'sqlite'];
        let showMoreDialects = false;

        const DIALECT_DISPLAY_NAMES = {
            mysql: 'MySQL', hive: 'Hive', spark: 'Spark', flinksql: 'FlinkSQL',
            postgresql: 'PostgreSQL', bigquery: 'BigQuery', sqlite: 'SQLite'
        };

        let connFormState = {
            mode: 'create',
            editId: null,
            passwordChanged: false,
            sshPasswordChanged: false,
            sshPassphraseChanged: false
        };

        const DIALECT_DEFAULT_PORTS = {
            mysql: 3306, hive: 10000, spark: 10001, flinksql: 8083,
            postgresql: 5432, bigquery: 443, sqlite: 0
        };

        const DIALECT_DEFAULT_USERNAMES = {
            mysql: 'root', hive: 'hive', spark: 'spark', flinksql: 'flink',
            postgresql: 'postgres', bigquery: 'bigquery', sqlite: ''
        };

        function formatRelativeTime(timestamp) {
            if (!timestamp) return '';
            var diff = Date.now() - timestamp;
            var minutes = Math.floor(diff / 60000);
            if (minutes < 1) return getI18nDict()['configEditor.conn.justNow'] || '刚刚';
            if (minutes < 60) return minutes + (getI18nDict()['configEditor.conn.minutesAgo'] || ' 分钟前');
            var hours = Math.floor(minutes / 60);
            if (hours < 24) return hours + (getI18nDict()['configEditor.conn.hoursAgo'] || ' 小时前');
            var days = Math.floor(hours / 24);
            return days + (getI18nDict()['configEditor.conn.daysAgo'] || ' 天前');
        }

        var connectionStates = {};
        var connectionTestTimes = {};

        function renderConnections(connections, groups) {
            var list = document.getElementById('connList');
            var empty = document.getElementById('connEmpty');
            var badge = document.getElementById('connCountBadge');

            if (badge) badge.textContent = connections ? connections.length : 0;

            if (groups) {
                updateGroupDropdown(groups, null);
            }

            if (!connections || connections.length === 0) {
                list.innerHTML = '';
                list.appendChild(empty);
                empty.style.display = '';
                return;
            }

            empty.style.display = 'none';
            var html = '';
            connections.forEach(function(conn) {
                var state = connectionStates[conn.id] || 'disconnected';
                var stateClass = state === 'connected' ? 'conn-state-connected' : (state === 'failed' ? 'conn-state-failed' : 'conn-state-disconnected');
                var testTime = connectionTestTimes[conn.id];
                var testTimeText = testTime ? (getI18nDict()['configEditor.conn.recentlyTested'] || '{0}前测试').replace('{0}', formatRelativeTime(testTime)) : '';
                var colorStyle = conn.color ? 'background:' + conn.color : 'background:var(--text-secondary);opacity:0.3';
                var detail = conn.dialect.toUpperCase();
                if (conn.dialect !== 'sqlite') {
                    detail += ' · ' + conn.host + ':' + conn.port;
                    if (conn.database) detail += ' · ' + conn.database;
                } else {
                    detail += ' · ' + (conn.database || '');
                }
                if (conn.ssh && conn.ssh.enabled) detail += ' · SSH';
                if (testTimeText) detail += ' · ' + testTimeText;
                html += '<div class="conn-item" data-conn-id="' + conn.id + '">'
                    + '<div class="conn-item-color" style="' + colorStyle + '"></div>'
                    + '<div class="conn-item-state ' + stateClass + '" title="' + state + '"></div>'
                    + '<div class="conn-item-info">'
                    + '<div class="conn-item-name">' + escapeHtml(conn.name) + '</div>'
                    + '<div class="conn-item-detail">' + detail + '</div>'
                    + '</div>'
                    + '<div class="conn-item-actions">'
                    + '<button class="btn btn-secondary btn-sm" data-action="editConnection" data-action-arg="' + conn.id + '">✏️</button>'
                    + '<button class="btn btn-secondary btn-sm" data-action="testConnection" data-action-arg="' + conn.id + '">🔌</button>'
                    + '<button class="btn btn-secondary btn-sm" data-action="deleteConnection" data-action-arg="' + conn.id + '">🗑️</button>'
                    + '</div></div>';
            });
            list.innerHTML = html;
            list.appendChild(empty);

            list.querySelectorAll('[data-action]').forEach(function(el) {
                var action = el.getAttribute('data-action');
                var arg = el.getAttribute('data-action-arg');
                if (action && typeof window[action] === 'function') {
                    el.addEventListener('click', function() {
                        window[action](arg);
                    });
                    el.removeAttribute('data-action');
                    // Keep `data-action-arg` for post-bind lookups (see
                    // bindActions() for rationale).
                }
            });
        }

        // escapeHtml 已集中到 shared.js 的 window.escapeHtml。旧版本使用
        // div.textContent + div.innerHTML，仅转义 &/</> 而不转义引号，
        // 当 conn.name 等含引号时可能破坏 HTML 结构。统一版本同时转义
        // 双引号和单引号，行为更安全。本文件直接调用 escapeHtml 即可。

        function addConnection() {
            connFormState = { mode: 'create', editId: null, passwordChanged: false, sshPasswordChanged: false, sshPassphraseChanged: false };
            resetConnForm();
            showConnForm(true);
            document.getElementById('connFormTitle').textContent = getI18nDict()['configEditor.conn.newConnection'] || '新建连接';
        }

        function editConnection(connId) {
            vscode.postMessage({ command: 'getConnectionDetail', id: connId });
        }

        function testConnection(connId) {
            vscode.postMessage({ command: 'testExistingConnection', id: connId });
        }

        function deleteConnection(connId) {
            if (confirm(getI18nDict()['configEditor.conn.confirmDelete'] || '确定要删除此连接吗？')) {
                vscode.postMessage({ command: 'deleteConnection', id: connId });
            }
        }

        function showConnForm(show) {
            var wrapper = document.getElementById('connFormWrapper');
            wrapper.style.display = show ? 'block' : 'none';
            if (show) {
                wrapper.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }

        function resetConnForm() {
            document.getElementById('cfName').value = '';
            document.getElementById('cfDialect').value = 'mysql';
            document.getElementById('cfGroup').value = '';
            document.getElementById('cfHost').value = '127.0.0.1';
            document.getElementById('cfPort').value = 3306;
            document.getElementById('cfUsername').value = 'root';
            document.getElementById('cfPassword').value = '';
            document.getElementById('cfDatabase').value = '';
            document.getElementById('cfSqliteFile').value = '';
            document.getElementById('cfSshEnabled').checked = false;
            document.getElementById('cfSshHost').value = '';
            document.getElementById('cfSshPort').value = 22;
            document.getElementById('cfSshUsername').value = '';
            document.getElementById('cfSshAuth').value = 'password';
            document.getElementById('cfSshPassword').value = '';
            document.getElementById('cfSshKey').value = '';
            document.getElementById('cfSshPassphrase').value = '';
            document.getElementById('cfSslEnabled').checked = false;
            document.getElementById('cfSslCa').value = '';
            document.getElementById('cfSslCert').value = '';
            document.getElementById('cfSslKey').value = '';
            document.getElementById('cfSslReject').checked = true;
            document.getElementById('cfTimeout').value = 10000;
            document.getElementById('cfPoolSize').value = 5;
            var result = document.getElementById('connFormResult');
            result.textContent = '';
            result.className = 'conn-form-result';
            updateConnFormDialectUI();
            updateConnFormSshUI();
            updateConnFormSslUI();
            switchConnFormTab('general');
        }

        function populateConnForm(conn) {
            document.getElementById('cfName').value = conn.name || '';
            document.getElementById('cfDialect').value = conn.dialect || 'mysql';
            document.getElementById('cfHost').value = conn.host || '127.0.0.1';
            document.getElementById('cfPort').value = conn.port || DIALECT_DEFAULT_PORTS[conn.dialect] || 3306;
            document.getElementById('cfUsername').value = conn.username || '';
            document.getElementById('cfPassword').value = conn.password ? '••••••••' : '';
            document.getElementById('cfDatabase').value = conn.database || '';
            document.getElementById('cfSqliteFile').value = conn.dialect === 'sqlite' ? (conn.database || '') : '';
            document.getElementById('cfSshEnabled').checked = !!(conn.ssh && conn.ssh.enabled);
            document.getElementById('cfSshHost').value = (conn.ssh && conn.ssh.host) || '';
            document.getElementById('cfSshPort').value = (conn.ssh && conn.ssh.port) || 22;
            document.getElementById('cfSshUsername').value = (conn.ssh && conn.ssh.username) || '';
            document.getElementById('cfSshAuth').value = (conn.ssh && conn.ssh.authentication) || 'password';
            document.getElementById('cfSslEnabled').checked = !!(conn.ssl && conn.ssl.enabled);
            document.getElementById('cfSslCa').value = (conn.ssl && conn.ssl.ca) || '';
            document.getElementById('cfSslCert').value = (conn.ssl && conn.ssl.cert) || '';
            document.getElementById('cfSslKey').value = (conn.ssl && conn.ssl.key) || '';
            document.getElementById('cfSslReject').checked = conn.ssl ? conn.ssl.rejectUnauthorized !== false : true;
            document.getElementById('cfTimeout').value = conn.connectTimeout || 10000;
            document.getElementById('cfPoolSize').value = (conn.poolConfig && conn.poolConfig.maxConnections) || 5;

            var groupSelect = document.getElementById('cfGroup');
            groupSelect.value = conn.group || '';

            updateConnFormDialectUI();
            updateConnFormSshUI();
            updateConnFormSslUI();
        }

        function renderCfDialect() {
            var select = document.getElementById('cfDialect');
            if (!select) return;
            var currentValue = select.value;
            select.innerHTML = '';

            supportedDialects.forEach(function(meta) {
                var opt = document.createElement('option');
                opt.value = meta.dialect;
                opt.textContent = meta.displayName || DIALECT_DISPLAY_NAMES[meta.dialect] || meta.dialect;
                select.appendChild(opt);
            });

            if (showMoreDialects) {
                knownDialects.forEach(function(key) {
                    var isSupported = supportedDialects.some(function(m) { return m.dialect === key; });
                    if (!isSupported) {
                        var opt = document.createElement('option');
                        opt.value = key;
                        opt.textContent = (DIALECT_DISPLAY_NAMES[key] || key) + ' (' + (getI18nDict()['configEditor.conn.unsupportedDialect'] || '不支持') + ')';
                        opt.disabled = true;
                        opt.className = 'dialect-unsupported';
                        select.appendChild(opt);
                    }
                });
            }

            if (currentValue && supportedDialects.some(function(m) { return m.dialect === currentValue; })) {
                select.value = currentValue;
            } else if (supportedDialects.length > 0) {
                select.value = supportedDialects[0].dialect;
            }
            updateConnFormDialectUI();
        }

        function updateConnFormDialectUI() {
            var dialect = document.getElementById('cfDialect').value;
            var isSqlite = dialect === 'sqlite';
            document.getElementById('cfHostRow').style.display = isSqlite ? 'none' : '';
            document.getElementById('cfUserRow').style.display = isSqlite ? 'none' : '';
            document.getElementById('cfPasswordRow').style.display = isSqlite ? 'none' : '';
            document.getElementById('cfDatabaseRow').style.display = isSqlite ? 'none' : '';
            document.getElementById('cfSqliteRow').style.display = isSqlite ? '' : 'none';
        }

        function updateConnFormSshUI() {
            var enabled = document.getElementById('cfSshEnabled').checked;
            var fields = document.getElementById('cfSshFields');
            if (enabled) {
                fields.classList.remove('disabled');
            } else {
                fields.classList.add('disabled');
            }
            var authMethod = document.getElementById('cfSshAuth').value;
            document.getElementById('cfSshPasswordRow').style.display = authMethod === 'password' ? '' : 'none';
            document.getElementById('cfSshKeyRow').style.display = authMethod === 'privateKey' ? '' : 'none';
        }

        function updateConnFormSslUI() {
            var enabled = document.getElementById('cfSslEnabled').checked;
            var fields = document.getElementById('cfSslFields');
            if (enabled) {
                fields.classList.remove('disabled');
            } else {
                fields.classList.add('disabled');
            }
        }

        function switchConnFormTab(tabName) {
            document.querySelectorAll('.conn-form-tab').forEach(function(btn) {
                btn.classList.remove('active');
                if (btn.getAttribute('data-action-arg') === tabName) {
                    btn.classList.add('active');
                }
            });
            document.querySelectorAll('.conn-form-page').forEach(function(page) {
                page.classList.remove('active');
            });
            var pageMap = { general: 'connFormGeneral', ssh: 'connFormSSH', ssl: 'connFormSSL', advanced: 'connFormAdvanced' };
            var pageId = pageMap[tabName];
            if (pageId) {
                document.getElementById(pageId).classList.add('active');
            }
        }

        function cancelConnectionForm() {
            showConnForm(false);
        }

        function collectConnFormData() {
            var dialect = document.getElementById('cfDialect').value;
            var data = {
                name: document.getElementById('cfName').value.trim(),
                dialect: dialect,
                host: dialect === 'sqlite' ? 'localhost' : document.getElementById('cfHost').value.trim(),
                port: dialect === 'sqlite' ? 0 : parseInt(document.getElementById('cfPort').value, 10) || 0,
                username: dialect === 'sqlite' ? '' : document.getElementById('cfUsername').value.trim(),
                database: dialect === 'sqlite' ? document.getElementById('cfSqliteFile').value.trim() : (document.getElementById('cfDatabase').value.trim() || undefined),
                group: document.getElementById('cfGroup').value || undefined,
                connectTimeout: parseInt(document.getElementById('cfTimeout').value, 10) || 10000,
                poolConfig: { maxConnections: parseInt(document.getElementById('cfPoolSize').value, 10) || 5 }
            };

            if (connFormState.mode === 'create' || connFormState.passwordChanged) {
                var pwd = document.getElementById('cfPassword').value;
                if (pwd && pwd !== '••••••••') data.password = pwd;
            }

            if (document.getElementById('cfSslEnabled').checked) {
                data.ssl = {
                    enabled: true,
                    rejectUnauthorized: document.getElementById('cfSslReject').checked,
                    ca: document.getElementById('cfSslCa').value.trim() || undefined,
                    cert: document.getElementById('cfSslCert').value.trim() || undefined,
                    key: document.getElementById('cfSslKey').value.trim() || undefined
                };
            } else {
                data.ssl = { enabled: false, rejectUnauthorized: true };
            }

            if (document.getElementById('cfSshEnabled').checked) {
                data.ssh = {
                    enabled: true,
                    host: document.getElementById('cfSshHost').value.trim(),
                    port: parseInt(document.getElementById('cfSshPort').value, 10) || 22,
                    username: document.getElementById('cfSshUsername').value.trim(),
                    authentication: document.getElementById('cfSshAuth').value
                };
                if (connFormState.mode === 'create' || connFormState.sshPasswordChanged) {
                    var sshPwd = document.getElementById('cfSshPassword').value;
                    if (sshPwd && sshPwd !== '••••••••') data.ssh.password = sshPwd;
                }
                var sshKey = document.getElementById('cfSshKey').value.trim();
                if (sshKey) data.ssh.privateKey = sshKey;
                if (connFormState.mode === 'create' || connFormState.sshPassphraseChanged) {
                    var sshPass = document.getElementById('cfSshPassphrase').value;
                    if (sshPass && sshPass !== '••••••••') data.ssh.passphrase = sshPass;
                }
            } else {
                data.ssh = { enabled: false };
            }

            if (connFormState.editId) {
                data.id = connFormState.editId;
            }

            return data;
        }

        function validateConnForm() {
            var errors = [];
            var name = document.getElementById('cfName').value.trim();
            var dialect = document.getElementById('cfDialect').value;

            if (!name) errors.push(getI18nDict()['configEditor.conn.error.nameRequired'] || '连接名称不能为空');

            if (dialect !== 'sqlite') {
                if (!document.getElementById('cfHost').value.trim()) errors.push(getI18nDict()['configEditor.conn.error.hostRequired'] || '主机地址不能为空');
                var port = parseInt(document.getElementById('cfPort').value, 10);
                if (!port || port < 1 || port > 65535) errors.push(getI18nDict()['configEditor.conn.error.portRange'] || '端口范围 1-65535');
                if (!document.getElementById('cfUsername').value.trim()) errors.push(getI18nDict()['configEditor.conn.error.userRequired'] || '用户名不能为空');
            } else {
                if (!document.getElementById('cfSqliteFile').value.trim()) errors.push(getI18nDict()['configEditor.conn.error.sqliteRequired'] || 'SQLite 文件路径不能为空');
            }

            if (document.getElementById('cfSshEnabled').checked) {
                if (!document.getElementById('cfSshHost').value.trim()) errors.push(getI18nDict()['configEditor.conn.error.sshHostRequired'] || 'SSH 主机不能为空');
                if (!document.getElementById('cfSshUsername').value.trim()) errors.push(getI18nDict()['configEditor.conn.error.sshUserRequired'] || 'SSH 用户名不能为空');
            }

            return errors;
        }

        function saveConnectionForm() {
            var errors = validateConnForm();
            if (errors.length > 0) {
                var result = document.getElementById('connFormResult');
                result.textContent = errors.join('; ');
                result.className = 'conn-form-result error';
                return;
            }

            var data = collectConnFormData();
            var command = connFormState.mode === 'edit' ? 'updateConnection' : 'addConnection';
            vscode.postMessage({ command: command, data: data });
        }

        function testConnectionForm() {
            var errors = validateConnForm();
            if (errors.length > 0) {
                var result = document.getElementById('connFormResult');
                result.textContent = errors.join('; ');
                result.className = 'conn-form-result error';
                return;
            }

            var result = document.getElementById('connFormResult');
            result.textContent = getI18nDict()['configEditor.conn.testing'] || '测试中...';
            result.className = 'conn-form-result loading';

            var data = collectConnFormData();
            vscode.postMessage({ command: 'testConnection', data: data });
        }

        function handleConnectionSaveResult(message) {
            var result = document.getElementById('connFormResult');
            if (message.success) {
                result.textContent = getI18nDict()['configEditor.conn.saveSuccess'] || '保存成功';
                result.className = 'conn-form-result success';
                showConnForm(false);
                vscode.postMessage({ command: 'getConnections' });
            } else {
                result.textContent = (getI18nDict()['configEditor.conn.saveFailed'] || '保存失败') + ': ' + (message.error || '');
                result.className = 'conn-form-result error';
            }
        }

        function handleConnectionTestResult(message) {
            var result = document.getElementById('connFormResult');
            if (message.success) {
                if (connFormState.editId) {
                    connectionTestTimes[connFormState.editId] = Date.now();
                }
                var parts = [getI18nDict()['configEditor.conn.testSuccess'] || '连接成功'];
                if (message.serverVersion) parts.push(message.serverVersion);
                if (message.latency !== undefined) parts.push(message.latency + 'ms');
                result.textContent = parts.join(', ');
                result.className = 'conn-form-result success';
            } else {
                result.textContent = (getI18nDict()['configEditor.conn.testFailed'] || '连接失败') + ': ' + (message.error || '');
                result.className = 'conn-form-result error';
            }
        }

        function handleEditConnectionDetail(message) {
            if (!message.connection) return;
            connFormState = { mode: 'edit', editId: message.connection.id, passwordChanged: false, sshPasswordChanged: false, sshPassphraseChanged: false };
            resetConnForm();
            populateConnForm(message.connection);
            if (message.groups) {
                updateGroupDropdown(message.groups, message.connection.group);
            }
            document.getElementById('connFormTitle').textContent = (getI18nDict()['configEditor.conn.editConnection'] || '编辑连接') + ' - ' + message.connection.name;
            showConnForm(true);
        }

        function updateGroupDropdown(groups, currentValue) {
            var select = document.getElementById('cfGroup');
            select.innerHTML = '<option value="">-- ' + (getI18nDict()['configEditor.conn.none'] || '无') + ' --</option>';
            if (groups) {
                groups.forEach(function(g) {
                    var opt = document.createElement('option');
                    opt.value = g.name;
                    opt.textContent = g.name;
                    if (g.name === currentValue) opt.selected = true;
                    select.appendChild(opt);
                });
            }
        }

        function initConnectionFormEvents() {
            document.getElementById('cfDialect').addEventListener('change', function() {
                var dialect = this.value;
                if (connFormState.mode === 'create') {
                    document.getElementById('cfPort').value = DIALECT_DEFAULT_PORTS[dialect] || 3306;
                    document.getElementById('cfUsername').value = DIALECT_DEFAULT_USERNAMES[dialect] || 'root';
                }
                updateConnFormDialectUI();
            });
            document.getElementById('cfSshEnabled').addEventListener('change', updateConnFormSshUI);
            document.getElementById('cfSshAuth').addEventListener('change', updateConnFormSshUI);
            document.getElementById('cfSslEnabled').addEventListener('change', updateConnFormSslUI);
            document.getElementById('cfPassword').addEventListener('input', function() {
                connFormState.passwordChanged = true;
            });
            document.getElementById('cfSshPassword').addEventListener('input', function() {
                connFormState.sshPasswordChanged = true;
            });
            document.getElementById('cfSshPassphrase').addEventListener('input', function() {
                connFormState.sshPassphraseChanged = true;
            });
            var showMoreBtn = document.getElementById('cfShowMoreDialects');
            if (showMoreBtn) {
                showMoreBtn.addEventListener('click', function() {
                    showMoreDialects = !showMoreDialects;
                    renderCfDialect();
                    this.textContent = showMoreDialects
                        ? (getI18nDict()['configEditor.conn.hideMoreDialects'] || '收起更多')
                        : (getI18nDict()['configEditor.conn.showMoreDialects'] || '显示更多');
                });
            }
        }

        initConnectionFormEvents();

        bindActions();

        document.querySelectorAll('input[type="number"]').forEach(function(input) {
            input.addEventListener('wheel', function(e) {
                if (document.activeElement !== this) return;
                e.preventDefault();
                var step = parseFloat(this.step) || 1;
                var min = this.min !== '' ? parseFloat(this.min) : -Infinity;
                var max = this.max !== '' ? parseFloat(this.max) : Infinity;
                var current = parseFloat(this.value) || 0;
                var next = e.deltaY < 0 ? current + step : current - step;
                if (next < min) next = min;
                if (next > max) next = max;
                this.value = next;
                this.dispatchEvent(new Event('input'));
            });
        });

        (function initTabKeyboardNav() {
            var tabLeft = document.querySelector('.tab-bar-left');
            if (!tabLeft) return;
            tabLeft.addEventListener('keydown', function(e) {
                if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                var tabs = Array.from(tabLeft.querySelectorAll('.tab-btn'));
                var currentIndex = tabs.findIndex(function(t) { return t.classList.contains('active'); });
                var nextIndex = e.key === 'ArrowRight' ? (currentIndex + 1) % tabs.length : (currentIndex - 1 + tabs.length) % tabs.length;
                tabs[nextIndex].focus();
                switchTab(tabs[nextIndex].getAttribute('data-action-arg'));
            });
        })();

        document.querySelectorAll('.config-input, .config-select').forEach(function(el) {
            if (el.id && el.id.startsWith('cf')) return;
            el.addEventListener('input', markDirty);
            el.addEventListener('change', markDirty);
        });
        document.querySelectorAll('.toggle input[type="checkbox"]').forEach(function(el) {
            if (el.id && el.id.startsWith('cf')) return;
            el.addEventListener('change', markDirty);
        });

        document.addEventListener('keydown', function(e) {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                saveConfig();
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                var searchInput = document.getElementById('searchInput');
                if (searchInput) searchInput.focus();
            }
        });

        vscode.postMessage({ command: 'getCurrentConfig' });
        vscode.postMessage({ command: 'getConnections' });
        vscode.postMessage({ command: 'getSupportedDialects' });
        // Request the full i18n bundle from the extension host. The host also
        // sends `initI18n` proactively in `_update()`, but that message is
        // fired before the webview has finished loading and registered its
        // `message` listener, so it is dropped. Without this request the
        // webview only has the small inline `i18nData` dict (which covers a
        // handful of keys) and every other `data-i18n` element keeps its
        // hard-coded HTML default (mixed English/Chinese), which is why the
        // config editor showed English text regardless of the plugin language.
        vscode.postMessage({ command: 'requestI18n' });