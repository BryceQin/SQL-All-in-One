"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDialect = void 0;
const Tokenizer_1 = __importDefault(require("../lexer/Tokenizer"));
/**
 * 缓存已创建的方言实例
 */
const cache = new Map();
/**
 * 创建或获取方言实例
 * 使用缓存避免重复创建
 */
const createDialect = (options) => {
    let dialect = cache.get(options);
    if (!dialect) {
        dialect = dialectFromOptions(options);
        cache.set(options, dialect);
    }
    return dialect;
};
exports.createDialect = createDialect;
/**
 * 从配置创建方言实例
 */
const dialectFromOptions = (dialectOptions) => ({
    tokenizer: new Tokenizer_1.default(dialectOptions.tokenizerOptions, dialectOptions.name),
    formatOptions: processDialectFormatOptions(dialectOptions.formatOptions),
});
/**
 * 处理格式化配置，将数组转换为对象以提高查询效率
 */
const processDialectFormatOptions = (options) => ({
    alwaysDenseOperators: options.alwaysDenseOperators || [],
    onelineClauses: Object.fromEntries(options.onelineClauses.map((name) => [name, true])),
    tabularOnelineClauses: Object.fromEntries((options.tabularOnelineClauses ?? options.onelineClauses).map((name) => [name, true])),
});
//# sourceMappingURL=dialect.js.map