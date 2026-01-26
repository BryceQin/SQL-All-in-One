"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDialect = void 0;
const Tokenizer_1 = __importDefault(require("../lexer/Tokenizer"));
// 缓存机制：避免重复创建实例
const cache = new Map();
/**
 * Factory function for building Dialect objects.
 * When called repeatedly with same options object returns the cached Dialect,
 * to avoid the cost of creating it again.
 */
const createDialect = (options) => {
    // 1. 查缓存
    let dialect = cache.get(options);
    if (!dialect) {
        // 2. 未命中则创建新实例
        dialect = dialectFromOptions(options);
        cache.set(options, dialect); // 3. 存入缓存
    }
    return dialect;
};
exports.createDialect = createDialect;
// 配置转实例
const dialectFromOptions = (dialectOptions) => ({
    // 初始化分词器：传入方言分词配置 + 方言名称
    tokenizer: new Tokenizer_1.default(dialectOptions.tokenizerOptions, dialectOptions.name),
    // 处理格式化配置：转为优化结构
    formatOptions: processDialectFormatOptions(dialectOptions.formatOptions),
});
// 处理格式化配置：转为优化结构，将「原始数组格式的配置」转为「键值对对象」，提升运行时查询效率（数组查找 O (n) → 对象键查找 O (1)）：
const processDialectFormatOptions = (options) => ({
    // 始终无空格的运算符列表（如DuckDB的::），保留数组
    alwaysDenseOperators: options.alwaysDenseOperators || [],
    // 普通模式下单行显示的子句：数组 → 对象（如['CREATE TABLE'] → { 'CREATE TABLE': true }）
    onelineClauses: Object.fromEntries(options.onelineClauses.map((name) => [name, true])),
    // 表格化缩进模式下单行显示的子句：优先用专属配置，无则复用onelineClauses，同样转对象
    tabularOnelineClauses: Object.fromEntries((options.tabularOnelineClauses ?? options.onelineClauses).map((name) => [name, true])),
});
//# sourceMappingURL=dialect.js.map