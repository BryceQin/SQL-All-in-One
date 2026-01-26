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
// 根入口文件
const allDialects = __importStar(require("../languages/allDialects"));
const dialect_1 = require("../languages/dialect");
const Formatter_1 = __importDefault(require("./Formatter"));
const validateConfig_1 = require("./validateConfig");
// 方言名称映射表
const dialectNameMap = {
    hive: "hive",
    mysql: "mysql",
    spark: "spark",
    sql: "sql",
};
// 所有支持的方言名字符串数组
exports.supportedDialects = Object.keys(dialectNameMap);
// 默认格式化配置
const defaultOptions = {
    // 缩进宽度2个空格
    tabWidth: 4,
    // 不用tab，用空格
    useTabs: false,
    // 保留关键字原始大小写
    keywordCase: "preserve",
    // 保留标识符原始大小写
    identifierCase: "preserve",
    // 保留数据类型原始大小写
    dataTypeCase: "preserve",
    // 保留函数名原始大小写
    functionCase: "preserve",
    // 标准缩进风格
    indentStyle: "standard",
    // 逻辑运算符(AND/OR)前换行
    logicalOperatorNewline: "before",
    // 单行表达式最大宽度（你之前的InlineLayout核心配置）
    expressionWidth: 50,
    // 多个查询之间空1行
    linesBetweenQueries: 1,
    // 运算符是否紧凑（无空格）
    denseOperators: false,
    // 分号前是否换行
    newlineBeforeSemicolon: false,
};
/**
 * Format whitespace in a query to make it easier to read.
 *
 * @param  query - input SQL query string
 * @param cfg - Configuration options (see docs in README)
 */
// 【普通用户主入口】最常用、最核心的格式化函数
const format = (query, cfg = {}) => {
    // 步骤1：校验用户传入的方言名是否合法，非法则抛ConfigError
    if (typeof cfg.language === "string" &&
        !exports.supportedDialects.includes(cfg.language)) {
        throw new validateConfig_1.ConfigError(`不支持的SQL方言: ${cfg.language}`);
    }
    // 步骤2：解析「标准方言名」，无传入则默认使用 'sql'（通用SQL）
    const canonicalDialectName = dialectNameMap[cfg.language || "sql"];
    // 步骤3：调用底层的formatDialect，传入【用户配置+对应方言的完整配置】，返回格式化结果
    return (0, exports.formatDialect)(query, {
        ...cfg,
        dialect: allDialects[canonicalDialectName],
    });
};
exports.format = format;
/**
 * Like the above format(), but language parameter is mandatory
 * and must be a Dialect object instead of a string.
 *
 * @param query - input SQL query string
 * @param cfg - Configuration options (see docs in README)
 */
// 【高级用户底层入口】功能更强，支持自定义方言配置，是format()的底层实现，format()本质是调用了这个函数
const formatDialect = (query, { dialect, ...cfg }) => {
    // 步骤1：校验入参合法性 - query必须是字符串，否则抛错
    if (typeof query !== "string") {
        throw new Error("无效的查询语句入参，参数类型应为字符串，实际传入的类型是 " +
            typeof query);
    }
    // 步骤2：合并配置 + 配置校验
    // 合并：默认配置(defaultOptions) ← 用户自定义配置(cfg)，用户配置优先级更高
    // 校验：调用validateConfig做全量合规性校验，非法配置抛ConfigError
    const options = (0, validateConfig_1.validateConfig)({
        ...defaultOptions,
        ...cfg,
    });
    // 步骤3~5：核心执行逻辑，串联你所有的内部模块
    // 调用createDialect：创建方言实例（带缓存，避免重复创建）
    // 实例化Formatter：传入方言实例+合法配置
    // 调用format：执行格式化，返回最终结果
    return new Formatter_1.default((0, dialect_1.createDialect)(dialect), options).format(query);
};
exports.formatDialect = formatDialect;
// 1. 用户调用 → format('SELECT * FROM t', { language: 'mysql', tabWidth:4 })
// 2. 校验方言名合法 → 映射标准方言名 'mysql'
// 3. 调用formatDialect → 传入sql + { dialect: allDialects.mysql, tabWidth:4 }
// 4. 校验sql是字符串 → 合并默认配置+用户配置 {tabWidth:4, ...其他默认项}
// 5. 调用validateConfig → 校验配置合规（无废弃项、expressionWidth>0等）
// 6. 调用createDialect → 创建mysql方言实例（有缓存，复用实例）
// 7. 实例化Formatter → new Formatter(mysqlDialect, validConfig)
// 8. 调用Formatter.format → 内部解析SQL为AST → 格式化AST → 生成布局
// 9. 返回格式化后的SQL字符串 → 用户拿到结果
//# sourceMappingURL=sqlFormatter.js.map