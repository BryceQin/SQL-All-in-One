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

const RELEVANT_KEYS: (keyof FormatOptions)[] = [
    'tabWidth', 'useTabs', 'keywordCase', 'identifierCase', 'dataTypeCase',
    'functionCase', 'indentStyle', 'logicalOperatorNewline', 'expressionWidth',
    'linesBetweenQueries', 'denseOperators', 'newlineBeforeSemicolon',
    'commaPosition', 'alignColumnDefinitions', 'newlineAfterSelect',
    'newlineAfterFrom', 'newlineBeforeWhere', 'newlineAfterWhere',
    'newlineBeforeOrderBy', 'newlineBeforeGroupBy', 'newlineBeforeHaving',
    'newlineBeforeLimit', 'tabulateAlias', 'newlineBeforeJoin',
    'alignWhereClauses', 'alignCaseStatements', 'spaceBeforeComma',
    'spaceInsideParentheses', 'trimTrailingSpaces', 'semicolonAtEnd',
    'singleLineMaxLength', 'nullCase', 'booleanCase', 'newlineAfterGroupBy',
    'newlineAfterHaving', 'newlineAfterOrderBy', 'newlineAfterLimit',
    'newlineAfterJoin', 'newlineBeforeSetOperation', 'newlineAfterSetOperation',
    'newlineBeforeOn', 'newlineBeforeUsing', 'newlineBeforeWith',
    'newlineAfterWith', 'indentCteBody', 'newlineBetweenCtes',
    'cteCommaPosition', 'indentJoinConditions', 'alignOnClauses',
    'alignInsertColumns', 'alignInsertValuesGroups', 'newlineAfterInsertColumns',
    'newlineBetweenValuesGroups', 'newlineAfterCase', 'newlineAfterWhen',
    'newlineAfterThen', 'newlineAfterElse', 'indentWhen', 'indentThen',
    'newlineAfterIn', 'maxItemsInlineList', 'subqueryParenStyle',
    'commentPosition', 'blankLinesBeforeSetOperation',
    'blankLinesAfterSetOperation', 'newlineBeforeLateralView',
    'newlineBeforeDistributeBy', 'newlineBeforeClusterBy', 'newlineBeforeSortBy',
]

function getFormatterCacheKey(dialect: string, options: FormatOptions): string {
    if (lastOptionsRef) {
        const cached = lastOptionsRef.deref();
        if (cached === options && lastCacheKey) {
            return lastCacheKey;
        }
    }
    const parts = [dialect];
    for (const key of RELEVANT_KEYS) {
        parts.push(String(options[key]));
    }
    const key = parts.join('|');
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
            const evictKey = formatterCache.keys().next().value
            if (evictKey !== undefined) {
                formatterCache.delete(evictKey)
            }
        }
        formatter = new AstFormatter(options, dialect)
        formatterCache.set(cacheKey, formatter)
    } else {
        formatterCache.delete(cacheKey)
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
