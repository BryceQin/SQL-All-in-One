// 方言（Dialect）工厂的核心实现，负责创建 / 缓存 Dialect 对象、处理格式化配置
import type {
    DialectFormatOptions,
    ProcessedDialectFormatOptions,
} from "../formatter/ExpressionFormatter"
import Tokenizer from "../lexer/Tokenizer"
import type { TokenizerOptions } from "../lexer/TokenizerOptions"

// 方言「原始配置」接口（创建方言的输入参数）
export interface DialectOptions {
    // 方言名称（如'duckdb'/'mysql'/'plsql'），用于标识/错误提示
    name: string
    // 该方言的分词规则配置
    tokenizerOptions: TokenizerOptions
    // 该方言的格式化规则配置
    formatOptions: DialectFormatOptions
}

// 方言「可用实例」接口（工具实际使用的对象）
export interface Dialect {
    // 初始化后的分词器实例（可直接用于分词）
    tokenizer: Tokenizer
    // 优化后的格式化配置
    formatOptions: ProcessedDialectFormatOptions
}

// 缓存机制：避免重复创建实例
const cache = new Map<DialectOptions, Dialect>()

/**
 * Factory function for building Dialect objects.
 * When called repeatedly with same options object returns the cached Dialect,
 * to avoid the cost of creating it again.
 */
export const createDialect = (options: DialectOptions): Dialect => {
    // 1. 查缓存
    let dialect = cache.get(options)
    if (!dialect) {
        // 2. 未命中则创建新实例
        dialect = dialectFromOptions(options)
        cache.set(options, dialect) // 3. 存入缓存
    }
    return dialect
}

// 配置转实例
const dialectFromOptions = (dialectOptions: DialectOptions): Dialect => ({
    // 初始化分词器：传入方言分词配置 + 方言名称
    tokenizer: new Tokenizer(
        dialectOptions.tokenizerOptions,
        dialectOptions.name,
    ),
    // 处理格式化配置：转为优化结构
    formatOptions: processDialectFormatOptions(dialectOptions.formatOptions),
})

// 处理格式化配置：转为优化结构，将「原始数组格式的配置」转为「键值对对象」，提升运行时查询效率（数组查找 O (n) → 对象键查找 O (1)）：
const processDialectFormatOptions = (
    options: DialectFormatOptions,
): ProcessedDialectFormatOptions => ({
    // 始终无空格的运算符列表（如DuckDB的::），保留数组
    alwaysDenseOperators: options.alwaysDenseOperators || [],
    // 普通模式下单行显示的子句：数组 → 对象（如['CREATE TABLE'] → { 'CREATE TABLE': true }）
    onelineClauses: Object.fromEntries(
        options.onelineClauses.map((name) => [name, true]),
    ),
    // 表格化缩进模式下单行显示的子句：优先用专属配置，无则复用onelineClauses，同样转对象
    tabularOnelineClauses: Object.fromEntries(
        (options.tabularOnelineClauses ?? options.onelineClauses).map(
            (name) => [name, true],
        ),
    ),
})
