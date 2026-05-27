import {
    sqlKeywords, sqlDataTypes,
    hiveKeywords, hiveDataTypes,
    mysqlKeywords, mysqlDataTypes,
    sparkKeywords, sparkDataTypes,
    flinksqlKeywords, flinksqlDataTypes,
    pgKeywords, pgDataTypes,
    bqKeywords, bqDataTypes,
    sqliteKeywords, sqliteDataTypes,
} from '../allDialects'
import type { SqlLanguage } from '../../core/dialectRegistry'

/**
 * Tokenizer 级别的保留字（keywords + dataTypes）按方言分组，
 * 这些是词法分析器层面的单字保留字，覆盖比 hover 文档关键词更全面。
 */
const dialectReservedWords: Record<SqlLanguage, string[]> = {
    sql: [...sqlKeywords, ...sqlDataTypes],
    hive: [...hiveKeywords, ...hiveDataTypes],
    mysql: [...mysqlKeywords, ...mysqlDataTypes],
    spark: [...sparkKeywords, ...sparkDataTypes],
    flinksql: [...flinksqlKeywords, ...flinksqlDataTypes],
    postgresql: [...pgKeywords, ...pgDataTypes],
    bigquery: [...bqKeywords, ...bqDataTypes],
    sqlite: [...sqliteKeywords, ...sqliteDataTypes],
}

const cache = new Map<SqlLanguage, Set<string>>()

/**
 * 获取指定方言的保留字集合（大写）。
 * 结果会被缓存，避免重复计算。
 */
export function getReservedWordSet(dialect: SqlLanguage): Set<string> {
    const cached = cache.get(dialect)
    if (cached) return cached

    const words = dialectReservedWords[dialect] || []
    const result = new Set(words.map(w => w.toUpperCase()))
    cache.set(dialect, result)
    return result
}