import type { Lazy } from '../utils/lazy'
import * as allDialects from './allDialects'
import type { FunctionSignature } from '../completion/functionSignatures'

type LazyKeywords = Lazy<string[]>
type LazyDataTypes = Lazy<string[]>
type LazyFunctionSigs = Lazy<FunctionSignature[]>

interface LazyKeywordEntry {
    keywords: LazyKeywords
    dataTypes: LazyDataTypes
}

interface KeywordData {
    keywords: string[]
    dataTypes: string[]
}

const _keywordMap: Record<string, LazyKeywordEntry> = {
    hive: { keywords: allDialects.hiveKeywords, dataTypes: allDialects.hiveDataTypes },
    mysql: { keywords: allDialects.mysqlKeywords, dataTypes: allDialects.mysqlDataTypes },
    spark: { keywords: allDialects.sparkKeywords, dataTypes: allDialects.sparkDataTypes },
    flinksql: { keywords: allDialects.flinksqlKeywords, dataTypes: allDialects.flinksqlDataTypes },
    sql: { keywords: allDialects.sqlKeywords, dataTypes: allDialects.sqlDataTypes },
    postgresql: { keywords: allDialects.pgKeywords, dataTypes: allDialects.pgDataTypes },
    bigquery: { keywords: allDialects.bqKeywords, dataTypes: allDialects.bqDataTypes },
    sqlite: { keywords: allDialects.sqliteKeywords, dataTypes: allDialects.sqliteDataTypes },
}

const _functionSigMap: Record<string, LazyFunctionSigs> = {
    hive: allDialects.hiveFunctionSignatures,
    mysql: allDialects.mysqlFunctionSignatures,
    spark: allDialects.sparkFunctionSignatures,
    flinksql: allDialects.flinksqlFunctionSignatures,
    sql: allDialects.sqlFunctionSignatures,
    postgresql: allDialects.pgFunctionSignatures,
    bigquery: allDialects.bqFunctionSignatures,
    sqlite: allDialects.sqliteFunctionSignatures,
}

const resolvedKeywordCache = new Map<string, KeywordData | undefined>()
const resolvedFunctionCache = new Map<string, FunctionSignature[] | undefined>()

export const keywordMap = new Proxy({} as Record<string, KeywordData>, {
    get(_target: Record<string, KeywordData>, dialect: string): KeywordData | undefined {
        const cached = resolvedKeywordCache.get(dialect)
        if (cached !== undefined) return cached
        const entry = _keywordMap[dialect]
        if (!entry) return undefined
        const resolved: KeywordData = { keywords: entry.keywords.get(), dataTypes: entry.dataTypes.get() }
        resolvedKeywordCache.set(dialect, resolved)
        return resolved
    },
    has(_target: Record<string, KeywordData>, dialect: string): boolean {
        return dialect in _keywordMap
    },
    ownKeys(_target: Record<string, KeywordData>): string[] {
        return Object.keys(_keywordMap)
    },
    getOwnPropertyDescriptor(_target: Record<string, KeywordData>, dialect: string): PropertyDescriptor | undefined {
        if (dialect in _keywordMap) return { configurable: true, enumerable: true }
        return undefined
    },
})

export const functionSigMap = new Proxy({} as Record<string, FunctionSignature[]>, {
    get(_target: Record<string, FunctionSignature[]>, dialect: string): FunctionSignature[] | undefined {
        const cached = resolvedFunctionCache.get(dialect)
        if (cached !== undefined) return cached
        const entry = _functionSigMap[dialect]
        if (!entry) return undefined
        const resolved = entry.get()
        resolvedFunctionCache.set(dialect, resolved)
        return resolved
    },
    has(_target: Record<string, FunctionSignature[]>, dialect: string): boolean {
        return dialect in _functionSigMap
    },
    ownKeys(_target: Record<string, FunctionSignature[]>): string[] {
        return Object.keys(_functionSigMap)
    },
    getOwnPropertyDescriptor(_target: Record<string, FunctionSignature[]>, dialect: string): PropertyDescriptor | undefined {
        if (dialect in _functionSigMap) return { configurable: true, enumerable: true }
        return undefined
    },
})
