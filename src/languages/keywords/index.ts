import type { KeywordInfo } from '../../hover/HoverResolver'
import type { SqlLanguage } from '../../formatter/sqlFormatter'
import { baseKeywords } from './baseKeywords'
import { hiveKeywords } from './hiveKeywords'
import { sparkKeywords } from './sparkKeywords'
import { flinksqlKeywords } from './flinksqlKeywords'
import { mysqlKeywords } from './mysqlKeywords'
import { postgresqlKeywords } from './postgresqlKeywords'
import { bigqueryKeywords } from './bigqueryKeywords'
import { sqliteKeywords } from './sqliteKeywords'

const dialectKeywordMap: Record<string, KeywordInfo[]> = {
    hive: hiveKeywords,
    mysql: mysqlKeywords,
    spark: sparkKeywords,
    flinksql: flinksqlKeywords,
    sql: [],
    postgresql: postgresqlKeywords,
    bigquery: bigqueryKeywords,
    sqlite: sqliteKeywords,
}

const cache = new Map<SqlLanguage, KeywordInfo[]>()

export function getKeywordsForDialect(dialect: SqlLanguage): KeywordInfo[] {
    const cached = cache.get(dialect)
    if (cached) return cached

    const dialectSpecific = dialectKeywordMap[dialect] || []
    const merged = new Map<string, KeywordInfo>()

    for (const kw of baseKeywords) {
        merged.set(kw.keyword.toUpperCase(), kw)
    }
    for (const kw of dialectSpecific) {
        merged.set(kw.keyword.toUpperCase(), kw)
    }

    const result = Array.from(merged.values())
    cache.set(dialect, result)
    return result
}
