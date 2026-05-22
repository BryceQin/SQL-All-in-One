export type SqlDialect =
    | 'mysql'
    | 'hive'
    | 'spark'
    | 'postgresql'
    | 'bigquery'
    | 'snowflake'
    | 'sqlite'
    | 'sql'

const dialectMap: Record<SqlDialect, string> = {
    mysql: 'MySQL',
    hive: 'Hive',
    spark: 'FlinkSQL',
    postgresql: 'PostgreSQL',
    bigquery: 'BigQuery',
    snowflake: 'Snowflake',
    sqlite: 'SQLite',
    sql: 'MySQL',
}

export function toNodeSqlParserDialect(dialect: SqlDialect): string {
    return dialectMap[dialect]
}

export function getSupportedDialects(): SqlDialect[] {
    return Object.keys(dialectMap) as SqlDialect[]
}
