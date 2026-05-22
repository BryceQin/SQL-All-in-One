import { SqlLanguage } from "../formatter/sqlFormatter"
import { SqlDialect } from "../parser/dialectMapper"

export const sqlDialects: Record<string, SqlLanguage> = {
    sql: "sql",
    mysql: "mysql",
    hive: "hive",
    "hive-sql": "hive",
    spark: "spark",
    postgresql: "postgresql",
    postgres: "postgresql",
    bigquery: "bigquery",
    snowflake: "snowflake",
    sqlite: "sqlite",
}

export function toSqlDialect(langId: string): SqlDialect {
    const dialectName = sqlDialects[langId as keyof typeof sqlDialects]
    return (dialectName as SqlDialect) || "sql"
}
