import { sortByLengthDesc } from "./utils"

import type { IdentChars, QuoteType, VariableType } from "./TokenizerOptions"
import {
    escapeRegExp,
    patternToRegex,
    prefixesPattern,
    withDashes,
} from "./regexUtil"

/**
 * 构建一个用于SQL方言中有效注释的正则表达式
 * @param lineCommentTypes - 用于注释的字符串列表
 */
export function lineComment(lineCommentTypes: string[]): RegExp {
    return new RegExp(
        `(?:${lineCommentTypes
            .map(escapeRegExp)
            .join("|")}).*?(?=\r\n|\r|\n|$)`,
        "uy",
    )
}
/**
 * 构建一个匹配开括号或者闭括号的正则表达式
 * @param kind - 括号类型，'open' 表示开括号，'close' 表示闭括号
 * @param extraParens - 额外的括号类型列表
 */
export function parenthesis(
    kind: "open" | "close",
    extraParens: ("[]" | "{}")[] = [],
): RegExp {
    let index: number
    if (kind === "open") {
        index = 0
    } else {
        index = 1
    }
    const parens = ["()", ...extraParens].map((pair) => pair[index])
    return patternToRegex(parens.map(escapeRegExp).join("|"))
}

/**
 * 构建一个用于所有SQL方言的匹配操作符的正则表达式
 * @param operators - 操作符字符串列表
 */
export function operator(operators: string[]): RegExp {
    return patternToRegex(
        `${sortByLengthDesc(operators).map(escapeRegExp).join("|")}`,
    )
}

// 为词法分析器生成「关键字边界检查」的正则负向前瞻表达式，核心目的是：避免把 “包含关键字片段的标识符” 错误拆分成 “关键字 + 特殊字符 + 标识符”
// 比如 SELECT$ME：如果 $ 允许出现在标识符中，它应该是一个标识符 Token；如果 $ 不允许，就该拆成 SELECT（关键字） + $（运算符 / 特殊字符） + ME（标识符）
function rejectIdentCharsPattern({ rest, dashes }: IdentChars): string {
    return rest || dashes ? `(?![${rest || ""}${dashes ? "-" : ""}])` : ""
}

/**
 * 构建一个用于SQL方言中保留关键字的正则表达式
 * @param reservedKeywords - 保留关键字字符串列表
 * @param identChars - 标识符字符配置
 */
export function reservedWord(
    reservedKeywords: string[],
    identChars: IdentChars = {},
): RegExp {
    if (reservedKeywords.length === 0) {
        return /^\b$/u
    }

    const avoidIdentChars = rejectIdentCharsPattern(identChars)

    const reservedKeywordsPattern = sortByLengthDesc(reservedKeywords)
        .map(escapeRegExp)
        .join("|")
        .replace(/ /gu, "\\s+")

    return new RegExp(
        `(?:${reservedKeywordsPattern})${avoidIdentChars}\\b`,
        "iuy",
    )
}

/**
 * 为参数占位符构建一个正则表达式
 * @param paramTypes - 占位符的 “前缀类型” 列表
 * @param pattern - 占位符 “主体部分” 的正则字符串
 */
export function parameter(
    paramTypes: string[],
    pattern: string,
): RegExp | undefined {
    // 1. 边界判断：无占位符类型时，返回undefined（无需构建正则）
    if (!paramTypes.length) {
        return undefined
    }
    // 2. 处理占位符类型：转义 + 拼接成“或”分支
    const typesRegex = paramTypes.map(escapeRegExp).join("|")
    // 3. 拼接类型 + 主体模式，转成最终正则
    return patternToRegex(`(?:${typesRegex})(?:${pattern})`)
}

/**
 * 构建匹配 PostgreSQL 风格「Q 字符串（Quoted String）」的正则表达式模板
 */
export function buildQStringPatterns(): string {
    // 1. 定义「成对特殊分隔符」映射：左分隔符-右分隔符（必须配对）
    const specialDelimiterMap = {
        "<": ">",
        "[": "]",
        "(": ")",
        "{": "}",
    }

    // 2. 单个成对分隔符的基础匹配模板（占位符待替换）
    const singlePattern = "{left}(?:(?!{right}').)*?{right}"

    // 3. 替换占位符，生成所有成对分隔符的匹配模式
    const patternList = Object.entries(specialDelimiterMap).map(
        ([left, right]) =>
            singlePattern
                .replace(/{left}/g, escapeRegExp(left))
                .replace(/{right}/g, escapeRegExp(right)),
    )
    // 4. 生成「特殊分隔符左字符」的转义字符串（用于排除标准分隔符）
    const specialDelimiters = escapeRegExp(
        Object.keys(specialDelimiterMap).join(""),
    )
    // 5. 标准自定义分隔符的匹配模式（非成对、非空白、非特殊分隔符）
    const standardDelimiterPattern = String.raw`(?<tag>[^\s${specialDelimiters}])(?:(?!\k<tag>').)*?\k<tag>`

    // 6. 拼接所有模式，生成最终Q字符串匹配模板
    const qStringPattern = `[Qq]'(?:${standardDelimiterPattern}|${patternList.join(
        "|",
    )})'`

    return qStringPattern
}

// 为不同编程语言 / 数据库的「带引号的字符串字面量 / 特殊标识符」定义的正则模式集合 —— 核心用途是供词法分析器识别各类「引号包裹的 Token」（比如字符串字面量、带引号的标识符、数据库特有字符串），每个键对应一种引号风格，值是匹配该风格的正则字符串，且针对双 / 单引号设计了不同转义规则的变体
export const quotePatterns = {
    // 1 基础引号风格
    // 1.1 反引号包裹的标识符（如MySQL）
    "``": "(?:`[^`]*`)+",
    // 1.2 方括号包裹的标识符（如Transact-SQL）
    "[]": String.raw`(?:\[[^\]]*\])(?:\][^\]]*\])*`,
    // 2 双引号变体
    // 2.1 仅支持重复双引号转义（SQL 标准风格）
    '""-qq': String.raw`(?:"[^"]*")+`,
    // 2.2 仅支持「反斜杠转义」（通用编程风格，如 JS/Java）
    '""-bs': String.raw`(?:"[^"\\]*(?:\\.[^"\\]*)*")`,
    // 2.3 同时支持「重复双引号」和「反斜杠」转义（兼容多场景）
    '""-qq-bs': String.raw`(?:"[^"\\]*(?:\\.[^"\\]*)*")+`,
    // 2.4 无转义（引号内的 " 直接视为结束，不支持任何转义）
    '""-raw': String.raw`(?:"[^"]*")`,
    // 3 单引号变体
    // 3.1 仅支持「重复单引号转义」如 'a''b' 表示 a'b
    "''-qq": String.raw`(?:'[^']*')+`,
    // 3.2 仅支持「反斜杠转义」如 'a\'b' 表示 a'b
    "''-bs": String.raw`(?:'[^'\\]*(?:\\.[^'\\]*)*')`,
    // 3.3 同时支持重复单引号和反斜杠转义
    "''-qq-bs": String.raw`(?:'[^'\\]*(?:\\.[^'\\]*)*')+`,
    // 3.4 无转义（'a'b' 仅匹配 'a'）
    "''-raw": String.raw`(?:'[^']*')`,
    // 4 数据库特有引号风格
    // 4.1 PostgreSQL 美元引号字符串
    $$: String.raw`(?<tag>\$\w*\$)[\s\S]*?\k<tag>`,
    // 4.2 BigQuery 三重单引号字符串（支持反斜杠转义单引号）
    "'''..'''": String.raw`'''[^\\]*?(?:\\.[^\\]*?)*?'''`,
    // 4.3 BigQuery 三重双引号字符串（支持反斜杠转义双引号）
    '""".."""': String.raw`"""[^\\]*?(?:\\.[^\\]*?)*?"""`,
    // 4.4 Hive/Spark 变量（如 ${name}）
    "{}": String.raw`(?:\{[^\}]*\})`,
    // 4.5 Oracle Q 字符串（和之前解析的 PostgreSQL Q 字符串类似，支持成对 / 自定义分隔符）
    "q''": buildQStringPatterns(),
}

//  QuoteType 类型到正则字符串的 “统一适配器”,抹平三种类型的差异，统一输出正则字符串
function singleQuotePattern(quoteTypes: QuoteType): string {
    if (typeof quoteTypes === "string") {
        // PlainQuoteType,直接返回 quotePatterns 中预定义的正则字符串（复用之前的基础引号规则）；
        return quotePatterns[quoteTypes]
    } else if ("regex" in quoteTypes) {
        // RegexPattern,直接返回自定义正则字符串（适配 quotePatterns 未覆盖的小众引号规则）；
        return quoteTypes.regex
    } else {
        // PrefixedQuoteType,拼接「前缀正则片段」+「基础引号正则」，形成带前缀的完整匹配规则
        return prefixesPattern(quoteTypes) + quotePatterns[quoteTypes.quote]
    }
}

// 「变量 Token」。将数组中每个变量规则转换为对应的正则片段，拼接成 “或” 分支后编译为最终的 RegExp 对象
export function variable(varTypes: VariableType[]): RegExp {
    return patternToRegex(
        varTypes
            .map((varType) =>
                "regex" in varType
                    ? varType.regex
                    : singleQuotePattern(varType),
            )
            .join("|"),
    )
}

// 生成匹配所有指定引号类型的正则字符串（引号分隔模式）
export function stringPattern(quoteTypes: QuoteType[]): string {
    return quoteTypes.map(singleQuotePattern).join("|")
}

// 「字符串 Token」。串联了「单规则转换（singleQuotePattern）→ 多规则聚合（stringPattern）→ 正则编译（patternToRegex）」的完整流程，将业务配置的 QuoteType 数组，最终转换为 lexer 可直接使用的 RegExp 对象，确保所有配置的字符串格式都能被精准识别为「字符串 Token」
export function string(quoteTypes: QuoteType[]): RegExp {
    return patternToRegex(stringPattern(quoteTypes))
}
// 基于 IdentChars 配置（自定义首字符、后续字符、中划线、数字开头等规则），结合 Unicode 字符支持，动态生成适配特定 SQL 方言的标识符匹配正则字符串，是 identifier 函数的底层核心逻辑
export function identifierPattern({
    first,
    rest,
    dashes,
    allowFirstCharNumber,
}: IdentChars = {}): string {
    // 1. 基础字符定义（Unicode 兼容）
    // Unicode 字母 + 变音符号（如 é/ñ） + 下划线（标准 SQL 标识符基础）
    const letter = "\\p{Alphabetic}\\p{Mark}_"
    // Unicode 十进制数字（包含阿拉伯数字、中文数字等所有 Unicode 数字）
    const number = "\\p{Decimal_Number}"

    // 2. 自定义字符转义（避免正则元字符破坏结构）
    // 转义用户传入的首字符/后续字符（如 $/@/! 等正则元字符），默认空字符串
    const firstChars = escapeRegExp(first ?? "")
    const restChars = escapeRegExp(rest ?? "")

    // 3. 核心正则模板（根据是否允许数字开头分支）
    const pattern = allowFirstCharNumber
        ? // 允许数字开头：首字符 = 字母 + 数字 + 自定义首字符；后续 = 字母 + 数字 + 自定义后续字符
          `[${letter}${number}${firstChars}][${letter}${number}${restChars}]*`
        : // 不允许数字开头（默认）：首字符 = 字母 + 自定义首字符；后续 = 字母 + 数字 + 自定义后续字符
          `[${letter}${firstChars}][${letter}${number}${restChars}]*`
    // 4. 处理中划线（dashes）：允许标识符中的 -（需特殊处理避免连续/首尾）
    return dashes ? withDashes(pattern) : pattern
}

//「标识符 Token」。将「业务层面的标识符字符规则（IdentChars）」，通过 identifierPattern 转换为正则字符串，再经统一的 patternToRegex 编译为可执行的 RegExp
export function identifier(specialChars: IdentChars = {}): RegExp {
    return patternToRegex(identifierPattern(specialChars))
}
