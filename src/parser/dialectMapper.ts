export type SqlDialect =
    | 'mysql'
    | 'hive'
    | 'spark'
    | 'flinksql'
    | 'postgresql'
    | 'bigquery'
    | 'sqlite'
    | 'sql'

export { toNodeSqlParserDialect } from '../core/dialectRegistry'

export function getSupportedDialects(): SqlDialect[] {
    return ['mysql', 'hive', 'spark', 'flinksql', 'postgresql', 'bigquery', 'sqlite', 'sql'] as SqlDialect[]
}