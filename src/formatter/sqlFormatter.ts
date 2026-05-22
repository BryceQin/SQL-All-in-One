import type { FormatOptions } from "./FormatOptions"
import type { SqlDialect } from "../parser/dialectMapper"
import { AstFormatter } from "./AstFormatter"
import { ConfigError, validateConfig } from "./validateConfig"

const dialectNameMap: Record<string, SqlDialect> = {
    hive: "hive",
    mysql: "mysql",
    spark: "spark",
    sql: "sql",
    postgresql: "postgresql",
    bigquery: "bigquery",
    snowflake: "snowflake",
    sqlite: "sqlite",
}

export const supportedDialects = Object.keys(dialectNameMap)
export type SqlLanguage = keyof typeof dialectNameMap

export type FormatOptionsWithLanguage = Partial<FormatOptions> & {
    language?: SqlLanguage
}

export type FormatOptionsWithDialect = Partial<FormatOptions> & {
    dialect: SqlDialect
}

const defaultOptions: FormatOptions = {
    tabWidth: 4,
    useTabs: false,
    keywordCase: 'preserve',
    identifierCase: 'preserve',
    dataTypeCase: 'preserve',
    functionCase: 'preserve',
    indentStyle: 'standard',
    logicalOperatorNewline: 'before',
    expressionWidth: 50,
    linesBetweenQueries: 1,
    denseOperators: false,
    newlineBeforeSemicolon: false,
    commaPosition: 'after',
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
    reservedKeywordCase: 'preserve',
    builtinFunctionCase: 'preserve',
    newlineBeforeJoin: true,
    newlineAfterComma: true,
    alignWhereClauses: false,
    alignCaseStatements: false,
    breakAfterSelectItem: true,
    breakAfterFromItem: true,
    spaceBeforeComma: false,
    spaceInsideParentheses: false,
    trimTrailingSpaces: true,
    semicolonAtEnd: true,
    singleLineMaxLength: 80,
    nullCase: 'preserve',
    booleanCase: 'preserve',
    newlineAfterGroupBy: true,
    newlineAfterHaving: true,
    newlineAfterOrderBy: true,
    newlineAfterLimit: false,
    newlineAfterJoin: true,
    newlineBeforeSetOperation: true,
    newlineAfterSetOperation: true,
    newlineBeforeOn: true,
    newlineBeforeUsing: true,
    newlineBeforeWith: true,
    newlineAfterWith: true,
    indentCteBody: true,
    newlineBetweenCtes: true,
    cteCommaPosition: 'before',
    newlineAfterOver: false,
    newlineBeforePartitionBy: true,
    newlineAfterPartitionBy: true,
    newlineBeforeOrderByInWindow: true,
    indentJoinConditions: true,
    alignOnClauses: false,
    alignInsertColumns: false,
    alignInsertValuesGroups: false,
    newlineAfterInsert: true,
    newlineAfterInsertColumns: true,
    newlineBetweenValuesGroups: true,
    newlineAfterCase: true,
    newlineAfterWhen: true,
    newlineAfterThen: false,
    newlineAfterElse: false,
    indentWhen: true,
    indentThen: true,
    newlineAfterIn: false,
    maxItemsInlineList: 5,
    subqueryParenStyle: 'inline',
    commentPosition: 'preserve',
    blankLinesBeforeSetOperation: 1,
    blankLinesAfterSetOperation: 0,
    newlineBeforeLateralView: true,
    newlineBeforeDistributeBy: true,
    newlineBeforeClusterBy: true,
    newlineBeforeSortBy: true,
}

export const format = (
    query: string,
    cfg: FormatOptionsWithLanguage = {},
): string => {
    if (
        typeof cfg.language === "string" &&
        !supportedDialects.includes(cfg.language)
    ) {
        throw new ConfigError(`不支持的SQL方言: ${cfg.language}`)
    }

    const sqlDialectName = dialectNameMap[cfg.language || "sql"]

    return formatDialect(query, {
        ...cfg,
        dialect: sqlDialectName,
    })
}

export const formatDialect = (
    query: string,
    { dialect, ...cfg }: FormatOptionsWithDialect,
): string => {
    if (typeof query !== "string") {
        throw new Error(
            "无效的查询语句入参，参数类型应为字符串，实际传入的类型是 " +
                typeof query,
        )
    }

    const options = validateConfig({
        ...defaultOptions,
        ...cfg,
    })

    return new AstFormatter(options, dialect).format(query)
}

export type FormatFn = typeof format
