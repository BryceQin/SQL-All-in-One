import { MysqlToHiveConverter } from './mysqlConverter'
import { HiveToMysqlConverter } from './hiveConverter'

export class SqlConverter {
  private mysqlConverter = new MysqlToHiveConverter()
  private hiveConverter = new HiveToMysqlConverter()

  public mysqlToHive(sql: string): string {
    return this.mysqlConverter.convert(sql)
  }

  public hiveToMysql(sql: string): string {
    return this.hiveConverter.convert(sql)
  }
}
