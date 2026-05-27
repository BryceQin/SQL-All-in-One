import { HIVE_TO_MYSQL_TYPES } from './typeMappings'
import { HIVE_TO_MYSQL_FUNCTIONS } from './functionMappings'

export class HiveToMysqlConverter {
  convert(sql: string): string {
    let converted = sql

    converted = this.convertFunctions(converted)
    converted = this.convertDataTypes(converted)

    return converted
  }

  private convertFunctions(sql: string): string {
    let result = sql

    for (const mapping of HIVE_TO_MYSQL_FUNCTIONS) {
      result = result.replace(mapping.pattern, mapping.replacement)
    }

    return result
  }

  private convertDataTypes(sql: string): string {
    let result = sql

    for (const [hiveType, mysqlType] of Object.entries(HIVE_TO_MYSQL_TYPES)) {
      const regex = new RegExp(`\\b${hiveType}\\b`, 'gi')
      result = result.replace(regex, mysqlType)
    }

    return result
  }
}
