"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatDialect = exports.format = exports.supportedDialects = void 0;
const dialectRegistry_1 = require("../core/dialectRegistry");
const AstFormatter_1 = require("./AstFormatter");
const validateConfig_1 = require("./validateConfig");
const i18n_1 = require("../i18n");
exports.supportedDialects = [...new Set((0, dialectRegistry_1.getDialectEntries)().map(e => e.sqlLanguage))];
// NOTE: Default values here should match src/config/configDefinitions.ts FORMAT_CONFIG_ITEMS
// When adding new format options, add them to both this object and FORMAT_CONFIG_ITEMS
const defaultOptions = {
    tabWidth: 4,
    useTabs: false,
    keywordCase: 'preserve',
    identifierCase: 'preserve',
    dataTypeCase: 'preserve',
    functionCase: 'preserve',
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
    maxLineLength: 120,
    tabulateAlias: false,
    reservedKeywordCase: 'preserve',
    builtinFunctionCase: 'preserve',
    newlineBeforeJoin: true,
    newlineAfterComma: true,
    alignWhereClauses: false,
    alignCaseStatements: false,
    breakAfterSelectItem: true,
    breakAfterFromItem: true,
    spaceBeforeComma: false,
    spaceInsideParentheses: false,
    trimTrailingSpaces: true,
    semicolonAtEnd: true,
    singleLineMaxLength: 80,
    nullCase: 'preserve',
    booleanCase: 'preserve',
    newlineAfterGroupBy: true,
    newlineAfterHaving: true,
    newlineAfterOrderBy: true,
    newlineAfterLimit: false,
    newlineAfterJoin: true,
    newlineBeforeSetOperation: true,
    newlineAfterSetOperation: true,
    newlineBeforeOn: true,
    newlineBeforeUsing: true,
    newlineBeforeWith: true,
    newlineAfterWith: true,
    indentCteBody: true,
    newlineBetweenCtes: true,
    cteCommaPosition: 'before',
    newlineAfterOver: false,
    newlineBeforePartitionBy: true,
    newlineAfterPartitionBy: true,
    newlineBeforeOrderByInWindow: true,
    indentJoinConditions: true,
    alignOnClauses: false,
    alignInsertColumns: false,
    alignInsertValuesGroups: false,
    newlineAfterInsert: true,
    newlineAfterInsertColumns: true,
    newlineBetweenValuesGroups: true,
    newlineAfterCase: true,
    newlineAfterWhen: true,
    newlineAfterThen: false,
    newlineAfterElse: false,
    indentWhen: true,
    indentThen: true,
    newlineAfterIn: false,
    maxItemsInlineList: 5,
    subqueryParenStyle: 'inline',
    commentPosition: 'preserve',
    blankLinesBeforeSetOperation: 1,
    blankLinesAfterSetOperation: 0,
    newlineBeforeLateralView: true,
    newlineBeforeDistributeBy: true,
    newlineBeforeClusterBy: true,
    newlineBeforeSortBy: true,
};
const format = (query, cfg = {}) => {
    if (typeof cfg.language === "string" &&
        !exports.supportedDialects.includes(cfg.language)) {
        throw new validateConfig_1.ConfigError((0, i18n_1.t)('validate.unsupportedDialect', cfg.language || ''));
    }
    const sqlDialectName = (cfg.language || "sql");
    return (0, exports.formatDialect)(query, {
        ...cfg,
        dialect: sqlDialectName,
    });
};
exports.format = format;
// AstFormatter 缓存：按方言和配置哈希缓存实例
const formatterCache = new Map();
const MAX_FORMATTER_CACHE_SIZE = 50;
function getFormatterCacheKey(dialect, options) {
    // 只包含会影响格式化行为的配置项
    const relevantOptions = {
        tabWidth: options.tabWidth,
        useTabs: options.useTabs,
        keywordCase: options.keywordCase,
        identifierCase: options.identifierCase,
        dataTypeCase: options.dataTypeCase,
        functionCase: options.functionCase,
        indentStyle: options.indentStyle,
        logicalOperatorNewline: options.logicalOperatorNewline,
        expressionWidth: options.expressionWidth,
        linesBetweenQueries: options.linesBetweenQueries,
        denseOperators: options.denseOperators,
        newlineBeforeSemicolon: options.newlineBeforeSemicolon,
        commaPosition: options.commaPosition,
        alignColumnDefinitions: options.alignColumnDefinitions,
        newlineAfterSelect: options.newlineAfterSelect,
        newlineAfterFrom: options.newlineAfterFrom,
        newlineBeforeWhere: options.newlineBeforeWhere,
        newlineAfterWhere: options.newlineAfterWhere,
        newlineBeforeOrderBy: options.newlineBeforeOrderBy,
        newlineBeforeGroupBy: options.newlineBeforeGroupBy,
        newlineBeforeHaving: options.newlineBeforeHaving,
        newlineBeforeLimit: options.newlineBeforeLimit,
        maxLineLength: options.maxLineLength,
        tabulateAlias: options.tabulateAlias,
        reservedKeywordCase: options.reservedKeywordCase,
        builtinFunctionCase: options.builtinFunctionCase,
        newlineBeforeJoin: options.newlineBeforeJoin,
        newlineAfterComma: options.newlineAfterComma,
        alignWhereClauses: options.alignWhereClauses,
        alignCaseStatements: options.alignCaseStatements,
        breakAfterSelectItem: options.breakAfterSelectItem,
        breakAfterFromItem: options.breakAfterFromItem,
        spaceBeforeComma: options.spaceBeforeComma,
        spaceInsideParentheses: options.spaceInsideParentheses,
        trimTrailingSpaces: options.trimTrailingSpaces,
        semicolonAtEnd: options.semicolonAtEnd,
        singleLineMaxLength: options.singleLineMaxLength,
        nullCase: options.nullCase,
        booleanCase: options.booleanCase,
        newlineAfterGroupBy: options.newlineAfterGroupBy,
        newlineAfterHaving: options.newlineAfterHaving,
        newlineAfterOrderBy: options.newlineAfterOrderBy,
        newlineAfterLimit: options.newlineAfterLimit,
        newlineAfterJoin: options.newlineAfterJoin,
        newlineBeforeSetOperation: options.newlineBeforeSetOperation,
        newlineAfterSetOperation: options.newlineAfterSetOperation,
        newlineBeforeOn: options.newlineBeforeOn,
        newlineBeforeUsing: options.newlineBeforeUsing,
        newlineBeforeWith: options.newlineBeforeWith,
        newlineAfterWith: options.newlineAfterWith,
        indentCteBody: options.indentCteBody,
        newlineBetweenCtes: options.newlineBetweenCtes,
        cteCommaPosition: options.cteCommaPosition,
        newlineAfterOver: options.newlineAfterOver,
        newlineBeforePartitionBy: options.newlineBeforePartitionBy,
        newlineAfterPartitionBy: options.newlineAfterPartitionBy,
        newlineBeforeOrderByInWindow: options.newlineBeforeOrderByInWindow,
        indentJoinConditions: options.indentJoinConditions,
        alignOnClauses: options.alignOnClauses,
        alignInsertColumns: options.alignInsertColumns,
        alignInsertValuesGroups: options.alignInsertValuesGroups,
        newlineAfterInsert: options.newlineAfterInsert,
        newlineAfterInsertColumns: options.newlineAfterInsertColumns,
        newlineBetweenValuesGroups: options.newlineBetweenValuesGroups,
        newlineAfterCase: options.newlineAfterCase,
        newlineAfterWhen: options.newlineAfterWhen,
        newlineAfterThen: options.newlineAfterThen,
        newlineAfterElse: options.newlineAfterElse,
        indentWhen: options.indentWhen,
        indentThen: options.indentThen,
        newlineAfterIn: options.newlineAfterIn,
        maxItemsInlineList: options.maxItemsInlineList,
        subqueryParenStyle: options.subqueryParenStyle,
        commentPosition: options.commentPosition,
        blankLinesBeforeSetOperation: options.blankLinesBeforeSetOperation,
        blankLinesAfterSetOperation: options.blankLinesAfterSetOperation,
        newlineBeforeLateralView: options.newlineBeforeLateralView,
        newlineBeforeDistributeBy: options.newlineBeforeDistributeBy,
        newlineBeforeClusterBy: options.newlineBeforeClusterBy,
        newlineBeforeSortBy: options.newlineBeforeSortBy
    };
    return `${dialect}:${JSON.stringify(relevantOptions)}`;
}
const formatDialect = (query, { dialect, ...cfg }) => {
    if (typeof query !== "string") {
        throw new Error((0, i18n_1.t)('validate.invalidQueryType', typeof query));
    }
    const options = (0, validateConfig_1.validateConfig)({
        ...defaultOptions,
        ...cfg,
    });
    const cacheKey = getFormatterCacheKey(dialect, options);
    let formatter = formatterCache.get(cacheKey);
    if (!formatter) {
        if (formatterCache.size >= MAX_FORMATTER_CACHE_SIZE) {
            const firstKey = formatterCache.keys().next().value;
            if (firstKey !== undefined) {
                formatterCache.delete(firstKey);
            }
        }
        formatter = new AstFormatter_1.AstFormatter(options, dialect);
        formatterCache.set(cacheKey, formatter);
    }
    return formatter.format(query);
};
exports.formatDialect = formatDialect;
//# sourceMappingURL=sqlFormatter.js.map