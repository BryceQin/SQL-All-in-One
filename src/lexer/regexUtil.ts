import type { PrefixedQuoteType } from "./TokenizerOptions"

// 特殊字符使用反斜杠进行转义，以便在正则表达式中使用它们字面值
export function escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

// 匹配任何空白字符（空格、制表符、换行符等）
export const WHITESPACE_REGEX = /\s+/uy

// 将给定的模式字符串转换为一个正则表达式对象，使用非捕获组和 "uy" 标志
export function patternToRegex(pattern: string): RegExp {
    return new RegExp(`(?:${pattern})`, "uy")
}

// 做形如"ab" to "[Aa][Bb]"的转换
export function toCaseInsensitivePattern(prefix: string): string {
    return prefix
        .split("")
        .map((char) =>
            / /gu.test(char)
                ? "\\s+"
                : `[${char.toUpperCase()}${char.toLowerCase()}]`,
        )
        .join("")
}

// 生成一个允许模式重复出现并由连字符分隔的正则表达式模式
export function withDashes(pattern: string): string {
    return pattern + "(?:-" + pattern + ")*"
}

// 为「带前缀的引号 / 变量规则（PrefixedQuoteType）」生成「前缀匹配的正则字符串」
// 当requirePrefix = true的时候，转化 ["a", "b"] 为 "(?:[Aa]|[Bb]|)" or "(?:[Aa]|[Bb])"
export function prefixesPattern({
    prefixes,
    requirePrefix,
}: PrefixedQuoteType): string {
    return `(?:${prefixes.map(toCaseInsensitivePattern).join("|")}${
        requirePrefix ? "" : "|"
    })`
}
