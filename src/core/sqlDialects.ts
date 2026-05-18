import { SqlLanguage } from "../formatter/sqlFormatter"

export const sqlDialects: Record<string, SqlLanguage> = {
    sql: "sql",
    mysql: "mysql",
    hql: "hive",
    "hive-sql": "hive",
}
