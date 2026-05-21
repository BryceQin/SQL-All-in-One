import { SqlLanguage } from "../formatter/sqlFormatter"

export const sqlDialects: Record<string, SqlLanguage> = {
    sql: "sql",
    mysql: "mysql",
    hive: "hive",
    "hive-sql": "hive",
    spark: "spark",
    postgresql: "postgresql",
    postgres: "postgresql",
    plsql: "oracle",
    oracle: "oracle",
    bigquery: "bigquery",
    snowflake: "snowflake",
    presto: "presto",
    trino: "presto",
    sqlite: "sqlite",
}
