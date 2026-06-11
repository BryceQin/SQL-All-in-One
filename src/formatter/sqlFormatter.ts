import type { FormatOptions } from "./FormatOptions"
import type { SqlDialect, SqlLanguage } from "../core/dialectRegistry"
import { getDialectEntries } from "../core/dialectRegistry"
import { AstFormatter } from "./AstFormatter"
import { ConfigError, validateConfig } from "./validateConfig"
import { t } from "../i18n"
import { getFormatterDefaultOptions } from "../config/configDefinitions"

export type { SqlLanguage }

export const supportedDialects = [...new Set(getDialectEntries().map(e => e.sqlLanguage))]

export type FormatOptionsWithLanguage = Partial<FormatOptions> & {
    language?: SqlLanguage
}

export type FormatOptionsWithDialect = Partial<FormatOptions> & {
    dialect: SqlDialect
}

const defaultOptions = getFormatterDefaultOptions() as unknown as FormatOptions

export const format = (
    query: string,
    cfg: FormatOptionsWithLanguage = {},
): string => {
    if (
        typeof cfg.language === "string" &&
        !supportedDialects.includes(cfg.language)
    ) {
        throw new ConfigError(t('validate.unsupportedDialect', cfg.language || ''))
    }

    const sqlDialectName = (cfg.language || "sql") as SqlDialect

    return formatDialect(query, {
        ...cfg,
        dialect: sqlDialectName,
    })
}

// AstFormatter 缓存：按方言和配置哈希缓存实例
const formatterCache = new Map<string, AstFormatter>()
const MAX_FORMATTER_CACHE_SIZE = 50

let lastOptionsRef: WeakRef<object> | undefined;
let lastCacheKey: string | undefined;

function getFormatterCacheKey(dialect: string, options: FormatOptions): string {
    if (lastOptionsRef) {
        const cached = lastOptionsRef.deref();
        if (cached === options && lastCacheKey) {
            return lastCacheKey;
        }
    }
    const relevantOptions = {
        tabWidth: options.tabWidth,
        useTabs: options.useTabs,
        keywordCase: options.keywordCase,
        identifierCase: options.identifierCase,
        dataTypeCase: options.dataTypeCase,
        functionCase: options.functionCase,
        indentStyle: options.indentStyle,
        logicalOperatorNewline: options.logicalOperatorNewline,
        expressionWidth: options.expressionWidth,
        linesBetweenQueries: options.linesBetweenQueries,
        denseOperators: options.denseOperators,
        newlineBeforeSemicolon: options.newlineBeforeSemicolon,
        commaPosition: options.commaPosition,
        alignColumnDefinitions: options.alignColumnDefinitions,
        newlineAfterSelect: options.newlineAfterSelect,
        newlineAfterFrom: options.newlineAfterFrom,
        newlineBeforeWhere: options.newlineBeforeWhere,
        newlineAfterWhere: options.newlineAfterWhere,
        newlineBeforeOrderBy: options.newlineBeforeOrderBy,
        newlineBeforeGroupBy: options.newlineBeforeGroupBy,
        newlineBeforeHaving: options.newlineBeforeHaving,
        newlineBeforeLimit: options.newlineBeforeLimit,
        tabulateAlias: options.tabulateAlias,
        newlineBeforeJoin: options.newlineBeforeJoin,
        alignWhereClauses: options.alignWhereClauses,
        alignCaseStatements: options.alignCaseStatements,
        spaceBeforeComma: options.spaceBeforeComma,
        spaceInsideParentheses: options.spaceInsideParentheses,
        trimTrailingSpaces: options.trimTrailingSpaces,
        semicolonAtEnd: options.semicolonAtEnd,
        singleLineMaxLength: options.singleLineMaxLength,
        nullCase: options.nullCase,
        booleanCase: options.booleanCase,
        newlineAfterGroupBy: options.newlineAfterGroupBy,
        newlineAfterHaving: options.newlineAfterHaving,
        newlineAfterOrderBy: options.newlineAfterOrderBy,
        newlineAfterLimit: options.newlineAfterLimit,
        newlineAfterJoin: options.newlineAfterJoin,
        newlineBeforeSetOperation: options.newlineBeforeSetOperation,
        newlineAfterSetOperation: options.newlineAfterSetOperation,
        newlineBeforeOn: options.newlineBeforeOn,
        newlineBeforeUsing: options.newlineBeforeUsing,
        newlineBeforeWith: options.newlineBeforeWith,
        newlineAfterWith: options.newlineAfterWith,
        indentCteBody: options.indentCteBody,
        newlineBetweenCtes: options.newlineBetweenCtes,
        cteCommaPosition: options.cteCommaPosition,
        indentJoinConditions: options.indentJoinConditions,
        alignOnClauses: options.alignOnClauses,
        alignInsertColumns: options.alignInsertColumns,
        alignInsertValuesGroups: options.alignInsertValuesGroups,
        newlineAfterInsertColumns: options.newlineAfterInsertColumns,
        newlineBetweenValuesGroups: options.newlineBetweenValuesGroups,
        newlineAfterCase: options.newlineAfterCase,
        newlineAfterWhen: options.newlineAfterWhen,
        newlineAfterThen: options.newlineAfterThen,
        newlineAfterElse: options.newlineAfterElse,
        indentWhen: options.indentWhen,
        indentThen: options.indentThen,
        newlineAfterIn: options.newlineAfterIn,
        maxItemsInlineList: options.maxItemsInlineList,
        subqueryParenStyle: options.subqueryParenStyle,
        commentPosition: options.commentPosition,
        blankLinesBeforeSetOperation: options.blankLinesBeforeSetOperation,
        blankLinesAfterSetOperation: options.blankLinesAfterSetOperation,
        newlineBeforeLateralView: options.newlineBeforeLateralView,
        newlineBeforeDistributeBy: options.newlineBeforeDistributeBy,
        newlineBeforeClusterBy: options.newlineBeforeClusterBy,
        newlineBeforeSortBy: options.newlineBeforeSortBy
    }
    const key = `${dialect}:${JSON.stringify(relevantOptions)}`;
    lastOptionsRef = new WeakRef(options as object);
    lastCacheKey = key;
    return key;
}

export const formatDialect = (
    query: string,
    { dialect, ...cfg }: FormatOptionsWithDialect,
): string => {
    if (typeof query !== "string") {
        throw new Error(
            t('validate.invalidQueryType', typeof query),
        )
    }

    const options = validateConfig({
        ...defaultOptions,
        ...cfg,
    })

    const cacheKey = getFormatterCacheKey(dialect, options)
    let formatter = formatterCache.get(cacheKey)
    
    if (!formatter) {
        if (formatterCache.size >= MAX_FORMATTER_CACHE_SIZE) {
            const firstKey = formatterCache.keys().next().value
            if (firstKey !== undefined) {
                formatterCache.delete(firstKey)
            }
        }
        formatter = new AstFormatter(options, dialect)
        formatterCache.set(cacheKey, formatter)
    }
    
    return formatter.format(query)
}

export function clearFormatterCache(): void {
    formatterCache.clear();
    lastOptionsRef = undefined;
    lastCacheKey = undefined;
}

export type FormatFn = typeof format
