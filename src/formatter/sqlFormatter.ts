import * as allDialects from "../languages/allDialects"
import type { FormatOptions } from "./FormatOptions"
import type { DialectOptions } from "../languages/dialect"
import { createDialect } from "../languages/dialect"
import Formatter from "./Formatter"
import { ConfigError, validateConfig } from "./validateConfig"

/**
 * 方言名称映射，用于将传入的方言名标准化
 */
const dialectNameMap: Record<
    keyof typeof allDialects,
    keyof typeof allDialects
> = {
    hive: "hive",
    mysql: "mysql",
    spark: "spark",
    sql: "sql",
}

export const supportedDialects = Object.keys(dialectNameMap)
export type SqlLanguage = keyof typeof dialectNameMap

/**
 * 普通用户使用的格式化配置类型
 */
export type FormatOptionsWithLanguage = Partial<FormatOptions> & {
    language?: SqlLanguage
}

/**
 * 高级用户使用的格式化配置类型，支持自定义方言配置
 */
export type FormatOptionsWithDialect = Partial<FormatOptions> & {
    dialect: DialectOptions
}

/**
 * 默认格式化配置
 */
const defaultOptions: FormatOptions = {
    tabWidth: 4,
    useTabs: false,
    keywordCase: "preserve",
    identifierCase: "preserve",
    dataTypeCase: "preserve",
    functionCase: "preserve",
    indentStyle: "standard",
    logicalOperatorNewline: "before",
    expressionWidth: 50,
    linesBetweenQueries: 1,
    denseOperators: false,
    newlineBeforeSemicolon: false,
    commaPosition: "after",
    alignColumnDefinitions: false,
    newlineAfterSelect: true,
    newlineAfterFrom: true,
    newlineBeforeWhere: true,
    newlineAfterWhere: true,
    newlineBeforeOrderBy: true,
    newlineBeforeGroupBy: true,
    newlineBeforeHaving: true,
    newlineBeforeLimit: true,
    maxLineLength: 120,
    tabulateAlias: false,
}

/**
 * 格式化SQL查询
 * @param query - 要格式化的SQL字符串
 * @param cfg - 格式化配置选项
 */
export const format = (
    query: string,
    cfg: FormatOptionsWithLanguage = {},
): string => {
    // 验证方言名称是否支持
    if (
        typeof cfg.language === "string" &&
        !supportedDialects.includes(cfg.language)
    ) {
        throw new ConfigError(`不支持的SQL方言: ${cfg.language}`)
    }

    const canonicalDialectName = dialectNameMap[cfg.language || "sql"]

    // 调用底层格式化函数，传入完整的方言配置
    return formatDialect(query, {
        ...cfg,
        dialect: allDialects[canonicalDialectName],
    })
}

/**
 * 使用自定义方言配置格式化SQL
 * @param query - 要格式化的SQL字符串
 * @param cfg - 包含方言配置的格式化选项
 */
export const formatDialect = (
    query: string,
    { dialect, ...cfg }: FormatOptionsWithDialect,
): string => {
    // 验证query类型
    if (typeof query !== "string") {
        throw new Error(
            "无效的查询语句入参，参数类型应为字符串，实际传入的类型是 " +
                typeof query,
        )
    }

    // 合并配置并验证
    const options = validateConfig({
        ...defaultOptions,
        ...cfg,
    })

    // 创建格式化器并执行格式化
    return new Formatter(createDialect(dialect), options).format(query)
}

export type FormatFn = typeof format
