import type { SqlDialect } from '../parser/dialectMapper'
import { SqlConverter } from './sqlConverter'

export class RegexFallbackConverter {
    private sqlConverter = new SqlConverter()

    convert(sql: string, from: SqlDialect, to: SqlDialect): string {
        if (from === 'mysql' && to === 'hive') {
            return this.sqlConverter.mysqlToHive(sql)
        }
        if (from === 'hive' && to === 'mysql') {
            return this.sqlConverter.hiveToMysql(sql)
        }
        return sql
    }
}
