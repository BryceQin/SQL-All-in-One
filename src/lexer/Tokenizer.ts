import type { Token } from "./token"
import { TokenType } from "./token"
import * as regex from "./regexFactory"
import type { ParamTypes, TokenizerOptions } from "./TokenizerOptions.ts"
import TokenizerEngine from "./TokenizerEngine"
import type { TokenRule } from "./TokenizerEngine"
import { escapeRegExp, patternToRegex } from "./regexUtil"
import type { Optional } from "./utils"
import { equalizeWhitespace } from "./utils"
import { NestedComment } from "./NestedComment"

// 可选 TokenRule：允许 regex 字段为 undefined（构建规则时可能动态禁用某些规则）
type OptionalTokenRule = Optional<TokenRule, "regex">

// 解析后的参数类型：数组字段保证非空，positional 保持可选（与原 buildParamRulesImpl 内部逻辑一致）
type ResolvedParamTypes = Omit<ParamTypes, "named" | "quoted" | "numbered" | "custom"> & {
    named: NonNullable<ParamTypes["named"]>
    quoted: NonNullable<ParamTypes["quoted"]>
    numbered: NonNullable<ParamTypes["numbered"]>
    custom: NonNullable<ParamTypes["custom"]>
}

export default class Tokenizer {
    // 缓存：仅依赖 TokenizerOptions 的前置规则（无需每次 tokenize 重新构建）
    private rulesBeforeParams: TokenRule[]
    // 缓存：仅依赖 TokenizerOptions 的后置规则（无需每次 tokenize 重新构建）
    private rulesAfterParams: TokenRule[]
    // 缓存：参数规则（基于 paramTypes 构建，按需缓存）
    private cachedParamRules: ReturnType<typeof this.buildParamRulesImpl> | null = null
    private cachedParamTypes: ResolvedParamTypes | undefined
    // 缓存：完整的规则数组（前置 + 参数 + 后置），避免每次 tokenize 重新拼接
    private cachedFullRules: TokenRule[] | null = null
    private cachedFullRulesParamTypes: ResolvedParamTypes | undefined
    // 缓存：可复用的 TokenizerEngine 实例。JS 单线程且 tokenize 不会递归调用，
    // 因此复用同一实例避免每次 tokenize 都分配新对象。
    private cachedEngine: TokenizerEngine | null = null
    private cachedEngineRules: TokenRule[] | null = null

    private cfg: TokenizerOptions
    private dialectName: string

    constructor(cfg: TokenizerOptions, dialectName: string) {
        this.cfg = cfg
        this.dialectName = dialectName
        this.rulesBeforeParams = this.buildRulesBeforeParams(cfg)
        this.rulesAfterParams = this.buildRulesAfterParams(cfg)
    }

    public tokenize(input: string, paramTypesOverrides?: ParamTypes): Token[] {
        // 1. 解析当前参数类型（合并覆盖与默认配置）
        const paramTypes = this.resolveParamTypes(paramTypesOverrides)

        // 2. 当参数类型未变化时，复用缓存的完整规则数组，避免每次重新拼接
        if (!this.cachedFullRules || !this.cachedFullRulesParamTypes || !this.paramTypesEqual(this.cachedFullRulesParamTypes, paramTypes)) {
            this.cachedFullRules = [
                ...this.rulesBeforeParams,
                ...this.buildParamRules(this.cfg, paramTypesOverrides),
                ...this.rulesAfterParams,
            ]
            this.cachedFullRulesParamTypes = paramTypes
        }

        // 3. 复用 TokenizerEngine 实例（当规则未变化时），执行分词
        let engine: TokenizerEngine
        if (this.cachedEngine && this.cachedEngineRules === this.cachedFullRules) {
            engine = this.cachedEngine
        } else {
            engine = new TokenizerEngine(this.cachedFullRules, this.dialectName)
            this.cachedEngine = engine
            this.cachedEngineRules = this.cachedFullRules
        }
        const tokens = engine.tokenize(input)

        // 4. 可选后置处理：若配置了 postProcess 函数，执行后返回，否则直接返回原始 Token 数组
        return this.cfg.postProcess ? this.cfg.postProcess(tokens) : tokens
    }
    // 构建前置规则（缓存复用）,负责构建「不依赖参数、仅依赖方言配置」的高优先级规则，这些规则会被缓存，无需重复构建。
    private buildRulesBeforeParams(cfg: TokenizerOptions): TokenRule[] {
        return this.validRules([
            // 匹配 /* sql-formatter-disable */ 这类禁用格式化的注释，优先识别
            {
                type: TokenType.DISABLE_COMMENT,
                regex: /(\/\* *sql-formatter-disable *\*\/[\s\S]*?(?:\/\* *sql-formatter-enable *\*\/|$))/uy,
            },
            // 匹配块注释（/* ... */），支持嵌套开关
            {
                type: TokenType.BLOCK_COMMENT,
                regex: cfg.nestedBlockComments
                    ? new NestedComment()
                    : /(\/\*[^]*?\*\/)/uy,
            },
            // 匹配行注释（如 --）
            {
                type: TokenType.LINE_COMMENT,
                regex: regex.lineComment(cfg.lineCommentTypes ?? ["--"]),
            },
            // 匹配带引号的标识符
            {
                type: TokenType.QUOTED_IDENTIFIER,
                regex: regex.string(cfg.identTypes),
            },
            // 匹配数字（支持十六进制、二进制、小数、科学计数法），支持数字中带下划线的开关
            {
                type: TokenType.NUMBER,
                regex: cfg.underscoresInNumbers
                    ? /(?:0x[0-9a-fA-F_]+|0b[01_]+|(?:-\s*)?(?:[0-9_]*\.[0-9_]+|[0-9_]+(?:\.[0-9_]*)?)(?:[eE][-+]?[0-9_]+(?:\.[0-9_]+)?)?)(?![\w\p{Alphabetic}])/uy
                    : /(?:0x[0-9a-fA-F]+|0b[01]+|(?:-\s*)?(?:[0-9]*\.[0-9]+|[0-9]+(?:\.[0-9]*)?)(?:[eE][-+]?[0-9]+(?:\.[0-9]+)?)?)(?![\w\p{Alphabetic}])/uy,
            },
            // 匹配关键字短语（如 TIMESTAMP WITH TIME ZONE），优先级高于单个关键字
            {
                type: TokenType.RESERVED_KEYWORD_PHRASE,
                regex: regex.reservedWord(
                    cfg.reservedKeywordPhrases ?? [],
                    cfg.identChars,
                ),
                text: toCanonical,
            },
            // 匹配 SQL 核心单个关键字，统一规范化处理
            {
                type: TokenType.RESERVED_DATA_TYPE_PHRASE,
                regex: regex.reservedWord(
                    cfg.reservedDataTypePhrases ?? [],
                    cfg.identChars,
                ),
                text: toCanonical,
            },
            {
                type: TokenType.CASE,
                regex: /CASE\b/iuy,
                text: toCanonical,
            },
            {
                type: TokenType.END,
                regex: /END\b/iuy,
                text: toCanonical,
            },
            {
                type: TokenType.BETWEEN,
                regex: /BETWEEN\b/iuy,
                text: toCanonical,
            },
            {
                type: TokenType.LIMIT,
                regex: cfg.reservedClauses.includes("LIMIT")
                    ? /LIMIT\b/iuy
                    : undefined,
                text: toCanonical,
            },
            {
                type: TokenType.RESERVED_CLAUSE,
                regex: regex.reservedWord(cfg.reservedClauses, cfg.identChars),
                text: toCanonical,
            },
            {
                type: TokenType.RESERVED_SELECT,
                regex: regex.reservedWord(cfg.reservedSelect, cfg.identChars),
                text: toCanonical,
            },
            {
                type: TokenType.RESERVED_SET_OPERATION,
                regex: regex.reservedWord(
                    cfg.reservedSetOperations,
                    cfg.identChars,
                ),
                text: toCanonical,
            },
            {
                type: TokenType.WHEN,
                regex: /WHEN\b/iuy,
                text: toCanonical,
            },
            {
                type: TokenType.ELSE,
                regex: /ELSE\b/iuy,
                text: toCanonical,
            },
            {
                type: TokenType.THEN,
                regex: /THEN\b/iuy,
                text: toCanonical,
            },
            {
                type: TokenType.RESERVED_JOIN,
                regex: regex.reservedWord(cfg.reservedJoins, cfg.identChars),
                text: toCanonical,
            },
            {
                type: TokenType.AND,
                regex: /AND\b/iuy,
                text: toCanonical,
            },
            {
                type: TokenType.OR,
                regex: /OR\b/iuy,
                text: toCanonical,
            },
            {
                type: TokenType.XOR,
                regex: cfg.supportsXor ? /XOR\b/iuy : undefined,
                text: toCanonical,
            },
            ...(cfg.operatorKeyword
                ? [
                      {
                          type: TokenType.OPERATOR,
                          regex: /OPERATOR *\([^)]+\)/iuy,
                      },
                  ]
                : []),
            {
                type: TokenType.RESERVED_FUNCTION_NAME,
                regex: regex.reservedWord(
                    cfg.reservedFunctionNames,
                    cfg.identChars,
                ),
                text: toCanonical,
            },
            {
                type: TokenType.RESERVED_DATA_TYPE,
                regex: regex.reservedWord(
                    cfg.reservedDataTypes,
                    cfg.identChars,
                ),
                text: toCanonical,
            },
            {
                type: TokenType.RESERVED_KEYWORD,
                regex: regex.reservedWord(cfg.reservedKeywords, cfg.identChars),
                text: toCanonical,
            },
        ])
    }
    // 构建后置规则（缓存复用），负责构建「兜底性、不依赖参数」的低优先级规则，同样缓存复用，主要匹配 SQL 基础语法单元
    private buildRulesAfterParams(cfg: TokenizerOptions): TokenRule[] {
        return this.validRules([
            // 匹配 SQL 变量（如 @user_id），由配置控制是否启用
            {
                type: TokenType.VARIABLE,
                regex: cfg.variableTypes
                    ? regex.variable(cfg.variableTypes)
                    : undefined,
            },
            // 匹配字符串字面量（如 'user_name'），依赖 cfg.stringTypes 配置
            { type: TokenType.STRING, regex: regex.string(cfg.stringTypes) },
            // 匹配普通标识符（如 user_table），依赖 cfg.identChars 配置标识符字符集
            {
                type: TokenType.IDENTIFIER,
                regex: regex.identifier(cfg.identChars),
            },
            // 匹配分号、逗号、括号、星号等 SQL 基础分隔符 / 符号
            { type: TokenType.DELIMITER, regex: /[;]/uy },
            { type: TokenType.COMMA, regex: /[,]/y },
            {
                type: TokenType.OPEN_PAREN,
                regex: regex.parenthesis("open", cfg.extraParens),
            },
            {
                type: TokenType.CLOSE_PAREN,
                regex: regex.parenthesis("close", cfg.extraParens),
            },
            // 匹配 SQL 操作符（如 +、>、<= 等），支持自定义操作符扩展
            {
                type: TokenType.OPERATOR,
                regex: regex.operator([
                    // standard operators
                    "+",
                    "-",
                    "/",
                    ">",
                    "<",
                    "=",
                    "<>",
                    "<=",
                    ">=",
                    "!=",
                    ...(cfg.operators ?? []),
                ]),
            },
            { type: TokenType.ASTERISK, regex: /[*]/uy },
            // 匹配属性访问符（如 .），支持自定义扩展
            {
                type: TokenType.PROPERTY_ACCESS_OPERATOR,
                regex: regex.operator([
                    ".",
                    ...(cfg.propertyAccessOperators ?? []),
                ]),
            },
        ])
    }

    // 解析参数类型：优先使用 paramTypesOverrides（动态覆盖），其次使用 cfg.paramTypes（默认配置），最后兜底为空数组/undefined
    public resolveParamTypes(paramTypesOverrides?: ParamTypes): ResolvedParamTypes {
        return {
            named: paramTypesOverrides?.named || this.cfg.paramTypes?.named || [],
            quoted: paramTypesOverrides?.quoted || this.cfg.paramTypes?.quoted || [],
            numbered: paramTypesOverrides?.numbered || this.cfg.paramTypes?.numbered || [],
            positional: typeof paramTypesOverrides?.positional === 'boolean'
                ? paramTypesOverrides.positional
                : this.cfg.paramTypes?.positional,
            custom: paramTypesOverrides?.custom || this.cfg.paramTypes?.custom || [],
        }
    }

    // 构建参数规则（带缓存）：解析 paramTypes 后委托给 buildParamRulesImpl，命中缓存时直接复用
    private buildParamRules(
        cfg: TokenizerOptions,
        paramTypesOverrides?: ParamTypes,
    ): TokenRule[] {
        const paramTypes = this.resolveParamTypes(paramTypesOverrides)

        if (
            this.cachedParamRules &&
            this.cachedParamTypes &&
            this.paramTypesEqual(this.cachedParamTypes, paramTypes)
        ) {
            return this.cachedParamRules
        }

        this.cachedParamRules = this.buildParamRulesImpl(cfg, paramTypes)
        this.cachedParamTypes = paramTypes
        return this.cachedParamRules
    }

    private paramTypesEqual(a: ResolvedParamTypes, b: ResolvedParamTypes): boolean {
        return (
            arraysEqual(a.named, b.named) &&
            arraysEqual(a.quoted, b.quoted) &&
            arraysEqual(a.numbered, b.numbered) &&
            a.positional === b.positional &&
            arraysEqual(a.custom, b.custom)
        )
    }

    // 构建参数规则：基于已解析的 paramTypes 生成各类参数匹配规则（命名/带引号/编号/位置/自定义）
    private buildParamRulesImpl(
        cfg: TokenizerOptions,
        paramTypes: ResolvedParamTypes,
    ): TokenRule[] {
        return this.validRules([
            // 匹配命名参数（如 :user_id）
            {
                type: TokenType.NAMED_PARAMETER,
                regex: regex.parameter(
                    paramTypes.named,
                    regex.identifierPattern(cfg.paramChars || cfg.identChars),
                ),
                // 截取参数名（去掉前缀 :，如 :user_id → user_id）
                key: (v) => v.slice(1),
            },
            // 匹配带引号参数（如 :("user_id")）
            {
                type: TokenType.QUOTED_PARAMETER,
                regex: regex.parameter(
                    paramTypes.quoted,
                    regex.stringPattern(cfg.identTypes),
                ),
                // 去除引号并还原转义字符，提取核心参数名
                key: (v): string =>
                    (({ tokenKey, quoteChar }: { tokenKey: string; quoteChar: string }): string =>
                        tokenKey.replace(
                            new RegExp(escapeRegExp("\\" + quoteChar), "gu"),
                            quoteChar,
                        ))({
                        tokenKey: v.slice(2, -1),
                        quoteChar: v.slice(-1),
                    }),
            },
            // 匹配编号参数（如 :1、?1）
            {
                type: TokenType.NUMBERED_PARAMETER,
                regex: regex.parameter(paramTypes.numbered, "[0-9]+"),
                // 截取编号（去掉前缀，如 :1 → 1）
                key: (v) => v.slice(1),
            },
            // 匹配位置参数（如 ?）
            {
                type: TokenType.POSITIONAL_PARAMETER,
                regex: paramTypes.positional ? /[?]/y : undefined,
            },
            // 匹配自定义参数（如 ${user_id}）
            ...paramTypes.custom.map(
                (customParam): TokenRule => ({
                    type: TokenType.CUSTOM_PARAMETER,
                    regex: patternToRegex(customParam.regex),
                    key: customParam.key ?? ((v): string => v),
                }),
            ),
        ])
    }

    // 过滤无效规则（类型守卫）
    private validRules(rules: OptionalTokenRule[]): TokenRule[] {
        // 类型守卫：(rule): rule is TokenRule → 确保返回值类型为 TokenRule[]
        return rules.filter((rule): rule is TokenRule => Boolean(rule.regex))
    }
}

// SQL 关键字规范化处理，消除大小写差异和多余空格的影响
function toCanonical(word: string): string {
    return equalizeWhitespace(word.toUpperCase())
}

function arraysEqual(a: unknown[], b: unknown[]): boolean {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false
    }
    return true
}
