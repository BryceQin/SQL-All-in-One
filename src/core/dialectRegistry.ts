const dialectEntries = [
    { vscodeLangId: 'sql', sqlLanguage: 'sql', sqlDialect: 'sql', nodeSqlParserDialect: 'MySQL' },
    { vscodeLangId: 'hive', sqlLanguage: 'hive', sqlDialect: 'hive', nodeSqlParserDialect: 'Hive' },
    { vscodeLangId: 'hive-sql', sqlLanguage: 'hive', sqlDialect: 'hive', nodeSqlParserDialect: 'Hive' },
    { vscodeLangId: 'mysql', sqlLanguage: 'mysql', sqlDialect: 'mysql', nodeSqlParserDialect: 'MySQL' },
    { vscodeLangId: 'spark', sqlLanguage: 'spark', sqlDialect: 'spark', nodeSqlParserDialect: 'Hive' },
    { vscodeLangId: 'flinksql', sqlLanguage: 'flinksql', sqlDialect: 'flinksql', nodeSqlParserDialect: 'FlinkSQL' },
    { vscodeLangId: 'flink-sql', sqlLanguage: 'flinksql', sqlDialect: 'flinksql', nodeSqlParserDialect: 'FlinkSQL' },
    { vscodeLangId: 'postgresql', sqlLanguage: 'postgresql', sqlDialect: 'postgresql', nodeSqlParserDialect: 'PostgreSQL' },
    { vscodeLangId: 'postgres', sqlLanguage: 'postgresql', sqlDialect: 'postgresql', nodeSqlParserDialect: 'PostgreSQL' },
    { vscodeLangId: 'bigquery', sqlLanguage: 'bigquery', sqlDialect: 'bigquery', nodeSqlParserDialect: 'BigQuery' },
    { vscodeLangId: 'sqlite', sqlLanguage: 'sqlite', sqlDialect: 'sqlite', nodeSqlParserDialect: 'SQLite' },
    { vscodeLangId: 'starrocks', sqlLanguage: 'starrocks', sqlDialect: 'starrocks', nodeSqlParserDialect: 'StarRocks' },
    { vscodeLangId: 'sqlserver', sqlLanguage: 'sqlserver', sqlDialect: 'sqlserver', nodeSqlParserDialect: 'SQLServer' },
    { vscodeLangId: 'plsql', sqlLanguage: 'oracle', sqlDialect: 'oracle', nodeSqlParserDialect: 'Oracle' },
    { vscodeLangId: 'oracle', sqlLanguage: 'oracle', sqlDialect: 'oracle', nodeSqlParserDialect: 'Oracle' },
    { vscodeLangId: 'dameng', sqlLanguage: 'dameng', sqlDialect: 'dameng', nodeSqlParserDialect: 'Oracle' },
] as const

const langIdSet = new Set<string>(dialectEntries.map(e => e.vscodeLangId))
const langIdMap = new Map<string, DialectEntry>(dialectEntries.map(e => [e.vscodeLangId, e] as const))
const dialectMap = new Map<string, DialectEntry>(dialectEntries.map(e => [e.sqlDialect, e] as const))

export type SqlDialect = (typeof dialectEntries)[number]['sqlDialect']
export type SqlLanguage = (typeof dialectEntries)[number]['sqlLanguage']

export interface DialectEntry {
    vscodeLangId: string
    sqlLanguage: string
    sqlDialect: string
    nodeSqlParserDialect: string
}

export function getDialectEntries(): readonly DialectEntry[] {
    return dialectEntries
}

export function findDialectByLangId(langId: string): DialectEntry | undefined {
    return langIdMap.get(langId)
}

/**
 * Maps a SQL dialect (as stored in ConnectionConfig.dialect) to the
 * corresponding VS Code language ID. Returns `'sql'` when no match is found.
 * Prefers the first registered vscodeLangId for each dialect (e.g.
 * 'postgresql' over 'postgres', 'plsql' over 'oracle').
 */
export function findVscodeLangIdByDialect(dialect: string): string {
    for (const entry of dialectEntries) {
        if (entry.sqlDialect === dialect) {
            return entry.vscodeLangId;
        }
    }
    return 'sql';
}

let _cachedLanguageIds: readonly string[] | null = null

export function getSqlLanguageIds(): readonly string[] {
    if (!_cachedLanguageIds) {
        _cachedLanguageIds = [...new Set(dialectEntries.map(e => e.vscodeLangId))]
    }
    return _cachedLanguageIds
}

export function isSqlDocument(document: { languageId: string }): boolean {
    return langIdSet.has(document.languageId)
}

export function toSqlDialect(langId: string): SqlDialect {
    const entry = findDialectByLangId(langId)
    if (!entry) return 'sql'
    return entry.sqlDialect as SqlDialect
}

export function toNodeSqlParserDialect(dialect: SqlDialect): string {
    const entry = dialectMap.get(dialect)
    return entry ? entry.nodeSqlParserDialect : 'MySQL'
}