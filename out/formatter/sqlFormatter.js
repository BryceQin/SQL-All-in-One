"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatDialect = exports.format = exports.supportedDialects = void 0;
const allDialects = __importStar(require("../languages/allDialects"));
const dialect_1 = require("../languages/dialect");
const Formatter_1 = __importDefault(require("./Formatter"));
const validateConfig_1 = require("./validateConfig");
/**
 * 方言名称映射，用于将传入的方言名标准化
 */
const dialectNameMap = {
    hive: "hive",
    mysql: "mysql",
    spark: "spark",
    sql: "sql",
    postgresql: "postgresql",
    oracle: "oracle",
    bigquery: "bigquery",
    snowflake: "snowflake",
    presto: "presto",
    sqlite: "sqlite",
};
exports.supportedDialects = Object.keys(dialectNameMap);
/**
 * 默认格式化配置
 */
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
    newlineBeforeConnectBy: true,
    newlineBeforeStartWith: true,
};
/**
 * 格式化SQL查询
 * @param query - 要格式化的SQL字符串
 * @param cfg - 格式化配置选项
 */
const format = (query, cfg = {}) => {
    // 验证方言名称是否支持
    if (typeof cfg.language === "string" &&
        !exports.supportedDialects.includes(cfg.language)) {
        throw new validateConfig_1.ConfigError(`不支持的SQL方言: ${cfg.language}`);
    }
    const canonicalDialectName = dialectNameMap[cfg.language || "sql"];
    // 调用底层格式化函数，传入完整的方言配置
    return (0, exports.formatDialect)(query, {
        ...cfg,
        dialect: allDialects[canonicalDialectName],
    });
};
exports.format = format;
/**
 * 使用自定义方言配置格式化SQL
 * @param query - 要格式化的SQL字符串
 * @param cfg - 包含方言配置的格式化选项
 */
const formatDialect = (query, { dialect, ...cfg }) => {
    // 验证query类型
    if (typeof query !== "string") {
        throw new Error("无效的查询语句入参，参数类型应为字符串，实际传入的类型是 " +
            typeof query);
    }
    // 合并配置并验证
    const options = (0, validateConfig_1.validateConfig)({
        ...defaultOptions,
        ...cfg,
    });
    // 创建格式化器并执行格式化
    return new Formatter_1.default((0, dialect_1.createDialect)(dialect), options).format(query);
};
exports.formatDialect = formatDialect;
//# sourceMappingURL=sqlFormatter.js.map