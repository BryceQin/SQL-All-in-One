"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatDialect = exports.format = exports.supportedDialects = void 0;
const dialectRegistry_1 = require("../core/dialectRegistry");
const AstFormatter_1 = require("./AstFormatter");
const validateConfig_1 = require("./validateConfig");
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
        throw new validateConfig_1.ConfigError(`不支持的SQL方言: ${cfg.language}`);
    }
    const sqlDialectName = (cfg.language || "sql");
    return (0, exports.formatDialect)(query, {
        ...cfg,
        dialect: sqlDialectName,
    });
};
exports.format = format;
// AstFormatter 缓存：按方言缓存实例，避免每次 format 调用都重新创建格式化器
const formatterCache = new Map();
const formatDialect = (query, { dialect, ...cfg }) => {
    if (typeof query !== "string") {
        throw new Error("无效的查询语句入参，参数类型应为字符串，实际传入的类型是 " +
            typeof query);
    }
    const options = (0, validateConfig_1.validateConfig)({
        ...defaultOptions,
        ...cfg,
    });
    const optionsKey = JSON.stringify(options);
    const cached = formatterCache.get(dialect);
    if (cached && cached.optionsKey === optionsKey) {
        return cached.formatter.format(query);
    }
    const formatter = new AstFormatter_1.AstFormatter(options, dialect);
    formatterCache.set(dialect, { optionsKey, formatter });
    return formatter.format(query);
};
exports.formatDialect = formatDialect;
//# sourceMappingURL=sqlFormatter.js.map