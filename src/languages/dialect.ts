import type {
    DialectFormatOptions,
    ProcessedDialectFormatOptions,
} from "../formatter/ExpressionFormatter"
import Tokenizer from "../lexer/Tokenizer"
import type { TokenizerOptions } from "../lexer/TokenizerOptions"

/**
 * 方言原始配置接口
 */
export interface DialectOptions {
    name: string
    tokenizerOptions: TokenizerOptions
    formatOptions: DialectFormatOptions
}

/**
 * 方言实例接口
 */
export interface Dialect {
    tokenizer: Tokenizer
    formatOptions: ProcessedDialectFormatOptions
}

/**
 * 缓存已创建的方言实例
 */
const cache = new Map<DialectOptions, Dialect>()

/**
 * 创建或获取方言实例
 * 使用缓存避免重复创建
 */
export const createDialect = (options: DialectOptions): Dialect => {
    let dialect = cache.get(options)
    if (!dialect) {
        dialect = dialectFromOptions(options)
        cache.set(options, dialect)
    }
    return dialect
}

/**
 * 从配置创建方言实例
 */
const dialectFromOptions = (dialectOptions: DialectOptions): Dialect => ({
    tokenizer: new Tokenizer(
        dialectOptions.tokenizerOptions,
        dialectOptions.name,
    ),
    formatOptions: processDialectFormatOptions(dialectOptions.formatOptions),
})

/**
 * 处理格式化配置，将数组转换为对象以提高查询效率
 */
const processDialectFormatOptions = (
    options: DialectFormatOptions,
): ProcessedDialectFormatOptions => ({
    alwaysDenseOperators: options.alwaysDenseOperators || [],
    onelineClauses: Object.fromEntries(
        options.onelineClauses.map((name) => [name, true]),
    ),
    tabularOnelineClauses: Object.fromEntries(
        (options.tabularOnelineClauses ?? options.onelineClauses).map(
            (name) => [name, true],
        ),
    ),
})
