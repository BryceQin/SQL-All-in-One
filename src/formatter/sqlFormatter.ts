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
const formatterCacheOrder: string[] = []
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
    const parts = [
        dialect,
        String(options.tabWidth),
        String(options.useTabs),
        String(options.keywordCase),
        String(options.identifierCase),
        String(options.dataTypeCase),
        String(options.functionCase),
        String(options.indentStyle),
        String(options.logicalOperatorNewline),
        String(options.expressionWidth),
        String(options.linesBetweenQueries),
        String(options.denseOperators),
        String(options.newlineBeforeSemicolon),
        String(options.commaPosition),
        String(options.alignColumnDefinitions),
        String(options.newlineAfterSelect),
        String(options.newlineAfterFrom),
        String(options.newlineBeforeWhere),
        String(options.newlineAfterWhere),
        String(options.newlineBeforeOrderBy),
        String(options.newlineBeforeGroupBy),
        String(options.newlineBeforeHaving),
        String(options.newlineBeforeLimit),
        String(options.tabulateAlias),
        String(options.newlineBeforeJoin),
        String(options.alignWhereClauses),
        String(options.alignCaseStatements),
        String(options.spaceBeforeComma),
        String(options.spaceInsideParentheses),
        String(options.trimTrailingSpaces),
        String(options.semicolonAtEnd),
        String(options.singleLineMaxLength),
        String(options.nullCase),
        String(options.booleanCase),
        String(options.newlineAfterGroupBy),
        String(options.newlineAfterHaving),
        String(options.newlineAfterOrderBy),
        String(options.newlineAfterLimit),
        String(options.newlineAfterJoin),
        String(options.newlineBeforeSetOperation),
        String(options.newlineAfterSetOperation),
        String(options.newlineBeforeOn),
        String(options.newlineBeforeUsing),
        String(options.newlineBeforeWith),
        String(options.newlineAfterWith),
        String(options.indentCteBody),
        String(options.newlineBetweenCtes),
        String(options.cteCommaPosition),
        String(options.indentJoinConditions),
        String(options.alignOnClauses),
        String(options.alignInsertColumns),
        String(options.alignInsertValuesGroups),
        String(options.newlineAfterInsertColumns),
        String(options.newlineBetweenValuesGroups),
        String(options.newlineAfterCase),
        String(options.newlineAfterWhen),
        String(options.newlineAfterThen),
        String(options.newlineAfterElse),
        String(options.indentWhen),
        String(options.indentThen),
        String(options.newlineAfterIn),
        String(options.maxItemsInlineList),
        String(options.subqueryParenStyle),
        String(options.commentPosition),
        String(options.blankLinesBeforeSetOperation),
        String(options.blankLinesAfterSetOperation),
        String(options.newlineBeforeLateralView),
        String(options.newlineBeforeDistributeBy),
        String(options.newlineBeforeClusterBy),
        String(options.newlineBeforeSortBy),
    ];
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
            const evictKey = formatterCacheOrder.shift()
            if (evictKey !== undefined) {
                formatterCache.delete(evictKey)
            }
        }
        formatter = new AstFormatter(options, dialect)
        formatterCache.set(cacheKey, formatter)
        formatterCacheOrder.push(cacheKey)
    } else {
        // LRU: 将已访问的 key 移到末尾
        const idx = formatterCacheOrder.indexOf(cacheKey)
        if (idx !== -1) {
            formatterCacheOrder.splice(idx, 1)
            formatterCacheOrder.push(cacheKey)
        }
    }
    
    return formatter.format(query)
}

export function clearFormatterCache(): void {
    formatterCache.clear();
    formatterCacheOrder.length = 0;
    lastOptionsRef = undefined;
    lastCacheKey = undefined;
}

export type FormatFn = typeof format
