import type { FormatOptions } from "./FormatOptions"
import type { SqlDialect, SqlLanguage } from "../core/dialectRegistry"
import { getDialectEntries } from "../core/dialectRegistry"
import { AstFormatter } from "./AstFormatter"
import { ConfigError, validateConfig } from "./validateConfig"
import { t } from "../i18n"
import { getFormatterDefaultOptions } from "../config/configDefinitions"
import { LRUCache } from "../utils/lruCache"

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
const MAX_FORMATTER_CACHE_SIZE = 50
const formatterCache = new LRUCache<string, AstFormatter>({ maxSize: MAX_FORMATTER_CACHE_SIZE, maxAge: Infinity })

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

function hashOptions(dialect: string, options: FormatOptions): string {
    // Build a deterministic, collision-free cache key by serialising the
    // dialect and every relevant option with its type prefix.  Unlike a
    // numeric hash this cannot produce false cache hits between differing
    // option sets (e.g. semicolonAtEnd true vs false), which previously
    // caused incorrect formatting output to be returned from the cache.
    const parts: string[] = [dialect];
    for (const key of RELEVANT_KEYS) {
        const val = options[key];
        // Use distinct sentinel strings for undefined/null to avoid collisions
        // with the literal strings "undefined"/"null". Also prefix with the
        // value's type so that e.g. the number 1 and the string "1" serialise
        // differently (String(1) === String("1") === "1" otherwise).
        let valStr: string;
        if (val === undefined) {
            valStr = "__undef__";
        } else if (val === null) {
            valStr = "__null__";
        } else {
            valStr = `${typeof val}:${String(val)}`;
        }
        parts.push(`${key}=${valStr}`);
    }
    return parts.join('|');
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

    const cacheKey = hashOptions(dialect, options)
    // LRUCache.get() already promotes the entry to MRU on access, and
    // set() handles LRU eviction internally, so no manual FIFO logic needed.
    let formatter = formatterCache.get(cacheKey)

    if (!formatter) {
        formatter = new AstFormatter(options, dialect)
        formatterCache.set(cacheKey, formatter)
    }

    return formatter.format(query)
}

export function clearFormatterCache(): void {
    formatterCache.clear();
}

export type FormatFn = typeof format
