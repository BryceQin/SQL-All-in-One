export type SqlDialect =
    | 'mysql'
    | 'hive'
    | 'spark'
    | 'flinksql'
    | 'postgresql'
    | 'bigquery'
    | 'sqlite'
    | 'sql'

const dialectMap: Record<SqlDialect, string> = {
    mysql: 'MySQL',
    hive: 'Hive',
    spark: 'Hive',
    flinksql: 'FlinkSQL',
    postgresql: 'PostgreSQL',
    bigquery: 'BigQuery',
    sqlite: 'SQLite',
    sql: 'MySQL',
}

export function toNodeSqlParserDialect(dialect: SqlDialect): string {
    return dialectMap[dialect]
}

export function getSupportedDialects(): SqlDialect[] {
    return Object.keys(dialectMap) as SqlDialect[]
}
