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
] as const

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
    return dialectEntries.find(e => e.vscodeLangId === langId)
}

export function getSqlLanguageIds(): readonly string[] {
    return [...new Set(dialectEntries.map(e => e.vscodeLangId))]
}

export function isSqlDocument(document: { languageId: string }): boolean {
    return dialectEntries.some(e => e.vscodeLangId === document.languageId)
}

export function toSqlDialect(langId: string): SqlDialect {
    const entry = findDialectByLangId(langId)
    if (!entry) return 'sql'
    return entry.sqlDialect as SqlDialect
}

export function toNodeSqlParserDialect(dialect: SqlDialect): string {
    const entry = dialectEntries.find(e => e.sqlDialect === dialect)
    return entry ? entry.nodeSqlParserDialect : 'MySQL'
}