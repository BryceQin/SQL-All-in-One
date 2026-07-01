import {
    sqlKeywords, sqlDataTypes,
    hiveKeywords, hiveDataTypes,
    mysqlKeywords, mysqlDataTypes,
    sparkKeywords, sparkDataTypes,
    flinksqlKeywords, flinksqlDataTypes,
    pgKeywords, pgDataTypes,
    bqKeywords, bqDataTypes,
    sqliteKeywords, sqliteDataTypes,
    starrocksKeywords, starrocksDataTypes,
    sqlserverKeywords, sqlserverDataTypes,
    oracleKeywords, oracleDataTypes,
} from '../../languages/allDialects'
import type { SqlLanguage } from '../../core/dialectRegistry'

const dialectReservedWordsLoaders: Record<SqlLanguage, string[]> = {
    sql: [...sqlKeywords, ...sqlDataTypes],
    hive: [...hiveKeywords, ...hiveDataTypes],
    mysql: [...mysqlKeywords, ...mysqlDataTypes],
    spark: [...sparkKeywords, ...sparkDataTypes],
    flinksql: [...flinksqlKeywords, ...flinksqlDataTypes],
    postgresql: [...pgKeywords, ...pgDataTypes],
    bigquery: [...bqKeywords, ...bqDataTypes],
    sqlite: [...sqliteKeywords, ...sqliteDataTypes],
    starrocks: [...starrocksKeywords, ...starrocksDataTypes],
    sqlserver: [...sqlserverKeywords, ...sqlserverDataTypes],
    oracle: [...oracleKeywords, ...oracleDataTypes],
    dameng: [...oracleKeywords, ...oracleDataTypes],
}

const cache = new Map<SqlLanguage, Set<string>>()

export function getReservedWordSet(dialect: SqlLanguage): Set<string> {
    const cached = cache.get(dialect)
    if (cached) return cached

    const words = dialectReservedWordsLoaders[dialect] ?? []
    const result = new Set(words.map(w => w.toUpperCase()))
    cache.set(dialect, result)
    return result
}
