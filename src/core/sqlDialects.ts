import { SqlLanguage } from "../formatter/sqlFormatter"
import { SqlDialect } from "../parser/dialectMapper"

export const sqlDialects: Record<string, SqlLanguage> = {
    sql: "sql",
    mysql: "mysql",
    hive: "hive",
    "hive-sql": "hive",
    spark: "spark",
    flinksql: "flinksql",
    "flink-sql": "flinksql",
    postgresql: "postgresql",
    postgres: "postgresql",
    bigquery: "bigquery",
    sqlite: "sqlite",
}

const sqlLanguageIds = Object.keys(sqlDialects)

export function isSqlDocument(document: { languageId: string }): boolean {
    return sqlLanguageIds.includes(document.languageId)
}

export function toSqlDialect(langId: string): SqlDialect {
    const dialectName = sqlDialects[langId as keyof typeof sqlDialects]
    return (dialectName as SqlDialect) || "sql"
}

export function getSqlLanguageIds(): readonly string[] {
    return sqlLanguageIds
}