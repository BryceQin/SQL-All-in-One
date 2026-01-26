import { quotePatterns } from "./regexFactory"
import type { Token } from "./token"

// 定义「标识符允许使用的字符范围」的配置项，词法分析器（lexer）会根据这个配置，判断一段字符序列是否能被识别为「Identifier Token」（而非数字、运算符、分隔符等其他 Token）。
export interface IdentChars {
    // 指定标识符「首字符」可额外使用的字符，补充默认的「字母 + 下划线」之外的字符，不配置时，标识符首字符仅允许字母、下划线，（除非 allowFirstCharNumber 开启）
    first?: string
    // 指定标识符「首字符之后的位置」可额外使用的字符（补充默认的「字母 + 数字 + 下划线」之外的字符）
    rest?: string
    // 是否允许标识符「内部」出现单个连字符（-），但禁止出现在开头 / 结尾，且不允许连续多个 -
    dashes?: boolean
    // 是否允许标识符「首字符是数字」
    allowFirstCharNumber?: boolean
}

export type PlainQuoteType = keyof typeof quotePatterns

// 「基础引号规则 + 前缀规则」的组合配置接口，本质是为词法分析器提供 “识别带前缀引号 Token” 的完整规则
export interface PrefixedQuoteType {
    quote: PlainQuoteType
    prefixes: string[]
    // 是否必须带前缀才能匹配该引号类型（默认通常为 false，即带 / 不带前缀都可匹配）
    requirePrefix?: boolean
}

export interface RegexPattern {
    regex: string
}

// 所有引号类 Token 的规则类型
export type QuoteType = PlainQuoteType | PrefixedQuoteType | RegexPattern

// 所有变量类 Token 的规则类型
export type VariableType = RegexPattern | PrefixedQuoteType

// 「自定义参数占位符」的规则定义
export interface CustomParameter {
    // 匹配自定义参数的正则字符串
    regex: string
    // 从匹配结果中剥离冗余字符（如括号、前缀），提取真正的参数名（如从 {foo} 提取 foo）
    key?: (text: string) => string
}

// 配置词法分析器识别「参数占位符 Token」的规则 —— 覆盖 SQL / 脚本语言中所有主流的参数占位符类型
export interface ParamTypes {
    // 控制是否识别纯 ? 作为「位置式参数 Token」（最基础的参数格式，无编号 / 名称，按顺序匹配参数值）
    positional?: boolean
    // 指定「编号式参数」的前缀字符（前缀 + 数字 = 编号参数，按编号匹配值），值只能是 ?/:/$ 中的一种或多种
    numbered?: ("?" | ":" | "$")[]
    // 指定「命名式参数」的前缀字符（前缀 + 标识符 = 命名参数，按名称匹配值），值只能是 :/@/$（排除 ?，因为 ?name 不是主流参数格式）。
    named?: (":" | "@" | "$")[]
    // 指定「引号包裹的命名参数」的前缀字符（前缀 + 引号 + 标识符 + 引号 = 带引号命名参数）
    // 依赖 identifierTypes 配置的引号类型（如双引号、反引号）
    quoted?: (":" | "@" | "$")[]
    // C扩展默认不支持的参数格式（比如特殊前缀、复杂规则）
    custom?: CustomParameter[]
}

// 词法分析器的「总控面板」—— 它将分散的词法规则（关键字、字符串、参数、运算符等）整合为标准化配置
export interface TokenizerOptions {
    // 1。这部分定义各类 SQL 保留字，词法分析器会优先识别这些保留字为「RESERVED_* Token」（而非普通标识符），且多词短语优先级高于单个关键字
    // SELECT 子句及变体（如 DISTINCT/ALL）的关键字列表
    reservedSelect: string[]
    // 启动新代码块的主从句关键字（如 WITH/FROM/WHERE/ORDER BY）
    reservedClauses: string[]
    // 是否支持 XOR 逻辑运算符
    supportsXor?: boolean
    // 集合操作关键字（无缩进换行，如 UNION/INTERSECT）
    reservedSetOperations: string[]
    // JOIN 相关多词关键字（如 LEFT OUTER JOIN）
    reservedJoins: string[]
    // 多词关键字序列（优先级最高，避免拆分）
    reservedKeywordPhrases?: string[]
    // 多词数据类型序列（优先级最高）
    reservedDataTypePhrases?: string[]
    // 内置函数名（如 SUM/COUNT）
    reservedFunctionNames: string[]
    // 基础数据类型（如 INT/VARCHAR）
    reservedDataTypes: string[]
    // 未归类的其他保留字（如 NULL/TRUE）
    reservedKeywords: string[]
    // 2。控制「字符串字面量、带引号标识符、变量」的 Token 识别规则，直接复用之前定义的 QuoteType/VariableType
    // 字符串字面量的引号类型（QuoteType 数组）
    stringTypes: QuoteType[]
    // 带引号标识符的引号类型（QuoteType 数组）
    identTypes: QuoteType[]
    // 变量的格式类型（VariableType 数组）
    variableTypes?: VariableType[]
    // 3。适配不同 SQL 方言的特殊语法，覆盖参数、注释、括号、运算符等场景。
    // 额外支持的括号类型
    extraParens?: ("[]" | "{}")[]
    // 预处理语句的参数占位符规则
    paramTypes?: ParamTypes
    // 行注释类型（默认 ['--']）
    lineCommentTypes?: string[]
    // 是否支持嵌套块注释
    nestedBlockComments?: boolean
    // 4。定制标识符、参数名的字符构成规则
    // 标识符允许的额外字符
    identChars?: IdentChars
    // 命名参数允许的额外字符（默认复用 identChars）
    paramChars?: IdentChars
    // 5。扩展运算符识别规则，适配不同数据库的特殊运算符
    // 额外多字符运算符（默认支持 <=/>=/<>/!=）
    operators?: string[]
    // 额外属性访问运算符（默认 .）
    propertyAccessOperators?: string[]
    // 是否支持 PostgreSQL 特有的 OPERATOR(...) 语法
    // 6。适配小众 / 方言专属的语法规则
    operatorKeyword?: boolean
    // 	是否允许数字字面量中的下划线（如 1_000_000）
    underscoresInNumbers?: boolean
    // 允许对 Token 流做自定义修改，是词法分析的 “最后一步”。
    // Token 流后处理函数（接收 Token 数组，返回修改后的数组）
    postProcess?: (tokens: Token[]) => Token[]
}
