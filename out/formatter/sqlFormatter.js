"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatDialect = exports.format = exports.supportedDialects = void 0;
exports.clearFormatterCache = clearFormatterCache;
const dialectRegistry_1 = require("../core/dialectRegistry");
const AstFormatter_1 = require("./AstFormatter");
const validateConfig_1 = require("./validateConfig");
const i18n_1 = require("../i18n");
const configDefinitions_1 = require("../config/configDefinitions");
exports.supportedDialects = [...new Set((0, dialectRegistry_1.getDialectEntries)().map(e => e.sqlLanguage))];
const defaultOptions = (0, configDefinitions_1.getFormatterDefaultOptions)();
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
const formatterCacheOrder = [];
const MAX_FORMATTER_CACHE_SIZE = 50;
let lastOptionsRef;
let lastCacheKey;
function getFormatterCacheKey(dialect, options) {
    if (lastOptionsRef) {
        const cached = lastOptionsRef.deref();
        if (cached === options && lastCacheKey) {
            return lastCacheKey;
        }
    }
    const parts = [
        dialect,
        String(options.tabWidth),
        String(options.useTabs),
        String(options.keywordCase),
        String(options.identifierCase),
        String(options.dataTypeCase),
        String(options.functionCase),
        String(options.indentStyle),
        String(options.logicalOperatorNewline),
        String(options.expressionWidth),
        String(options.linesBetweenQueries),
        String(options.denseOperators),
        String(options.newlineBeforeSemicolon),
        String(options.commaPosition),
        String(options.alignColumnDefinitions),
        String(options.newlineAfterSelect),
        String(options.newlineAfterFrom),
        String(options.newlineBeforeWhere),
        String(options.newlineAfterWhere),
        String(options.newlineBeforeOrderBy),
        String(options.newlineBeforeGroupBy),
        String(options.newlineBeforeHaving),
        String(options.newlineBeforeLimit),
        String(options.tabulateAlias),
        String(options.newlineBeforeJoin),
        String(options.alignWhereClauses),
        String(options.alignCaseStatements),
        String(options.spaceBeforeComma),
        String(options.spaceInsideParentheses),
        String(options.trimTrailingSpaces),
        String(options.semicolonAtEnd),
        String(options.singleLineMaxLength),
        String(options.nullCase),
        String(options.booleanCase),
        String(options.newlineAfterGroupBy),
        String(options.newlineAfterHaving),
        String(options.newlineAfterOrderBy),
        String(options.newlineAfterLimit),
        String(options.newlineAfterJoin),
        String(options.newlineBeforeSetOperation),
        String(options.newlineAfterSetOperation),
        String(options.newlineBeforeOn),
        String(options.newlineBeforeUsing),
        String(options.newlineBeforeWith),
        String(options.newlineAfterWith),
        String(options.indentCteBody),
        String(options.newlineBetweenCtes),
        String(options.cteCommaPosition),
        String(options.indentJoinConditions),
        String(options.alignOnClauses),
        String(options.alignInsertColumns),
        String(options.alignInsertValuesGroups),
        String(options.newlineAfterInsertColumns),
        String(options.newlineBetweenValuesGroups),
        String(options.newlineAfterCase),
        String(options.newlineAfterWhen),
        String(options.newlineAfterThen),
        String(options.newlineAfterElse),
        String(options.indentWhen),
        String(options.indentThen),
        String(options.newlineAfterIn),
        String(options.maxItemsInlineList),
        String(options.subqueryParenStyle),
        String(options.commentPosition),
        String(options.blankLinesBeforeSetOperation),
        String(options.blankLinesAfterSetOperation),
        String(options.newlineBeforeLateralView),
        String(options.newlineBeforeDistributeBy),
        String(options.newlineBeforeClusterBy),
        String(options.newlineBeforeSortBy),
    ];
    const key = parts.join('|');
    lastOptionsRef = new WeakRef(options);
    lastCacheKey = key;
    return key;
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
            const evictKey = formatterCacheOrder.shift();
            if (evictKey !== undefined) {
                formatterCache.delete(evictKey);
            }
        }
        formatter = new AstFormatter_1.AstFormatter(options, dialect);
        formatterCache.set(cacheKey, formatter);
        formatterCacheOrder.push(cacheKey);
    }
    else {
        // LRU: 将已访问的 key 移到末尾
        const idx = formatterCacheOrder.indexOf(cacheKey);
        if (idx !== -1) {
            formatterCacheOrder.splice(idx, 1);
            formatterCacheOrder.push(cacheKey);
        }
    }
    return formatter.format(query);
};
exports.formatDialect = formatDialect;
function clearFormatterCache() {
    formatterCache.clear();
    formatterCacheOrder.length = 0;
    lastOptionsRef = undefined;
    lastCacheKey = undefined;
}
//# sourceMappingURL=sqlFormatter.js.map