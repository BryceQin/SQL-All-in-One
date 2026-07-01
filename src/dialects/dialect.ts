import Tokenizer from "../lexer/Tokenizer"
import type { TokenizerOptions } from "../lexer/TokenizerOptions"

export interface DialectFormatOptions {
    alwaysDenseOperators?: string[]
    onelineClauses: string[]
    tabularOnelineClauses?: string[]
}

export interface ProcessedDialectFormatOptions {
    alwaysDenseOperators: string[]
    onelineClauses: Record<string, boolean>
    tabularOnelineClauses: Record<string, boolean>
}

export interface DialectOptions {
    name: string
    tokenizerOptions: TokenizerOptions
    formatOptions: DialectFormatOptions
}

export interface Dialect {
    tokenizer: Tokenizer
    formatOptions: ProcessedDialectFormatOptions
}

const cache = new Map<DialectOptions, Dialect>()

export const createDialect = (options: DialectOptions): Dialect => {
    let dialect = cache.get(options)
    if (!dialect) {
        dialect = dialectFromOptions(options)
        cache.set(options, dialect)
    }
    return dialect
}

const dialectFromOptions = (dialectOptions: DialectOptions): Dialect => ({
    tokenizer: new Tokenizer(
        dialectOptions.tokenizerOptions,
        dialectOptions.name,
    ),
    formatOptions: processDialectFormatOptions(dialectOptions.formatOptions),
})

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
