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
} from '../allDialects'
import type { SqlLanguage } from '../../core/dialectRegistry'

const dialectReservedWordsLoaders: Record<SqlLanguage, () => string[]> = {
    sql: () => [...sqlKeywords.get(), ...sqlDataTypes.get()],
    hive: () => [...hiveKeywords.get(), ...hiveDataTypes.get()],
    mysql: () => [...mysqlKeywords.get(), ...mysqlDataTypes.get()],
    spark: () => [...sparkKeywords.get(), ...sparkDataTypes.get()],
    flinksql: () => [...flinksqlKeywords.get(), ...flinksqlDataTypes.get()],
    postgresql: () => [...pgKeywords.get(), ...pgDataTypes.get()],
    bigquery: () => [...bqKeywords.get(), ...bqDataTypes.get()],
    sqlite: () => [...sqliteKeywords.get(), ...sqliteDataTypes.get()],
    starrocks: () => [...starrocksKeywords.get(), ...starrocksDataTypes.get()],
    sqlserver: () => [...sqlserverKeywords.get(), ...sqlserverDataTypes.get()],
}

const cache = new Map<SqlLanguage, Set<string>>()

export function getReservedWordSet(dialect: SqlLanguage): Set<string> {
    const cached = cache.get(dialect)
    if (cached) return cached

    const loader = dialectReservedWordsLoaders[dialect]
    const words = loader ? loader() : []
    const result = new Set(words.map(w => w.toUpperCase()))
    cache.set(dialect, result)
    return result
}
