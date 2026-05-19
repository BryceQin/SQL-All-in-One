import { SqlLanguage } from "../formatter/sqlFormatter"

export const sqlDialects: Record<string, SqlLanguage> = {
    sql: "sql",
    mysql: "mysql",
    hive: "hive",
    "hive-sql": "hive",
}
