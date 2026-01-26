import { SqlLanguage } from "./formatter/sqlFormatter"

export const sqlDialects: { [lang: string]: SqlLanguage } = {
    sql: "sql",
    mysql: "mysql",
    hql: "hive",
    "hive-sql": "hive",
}
