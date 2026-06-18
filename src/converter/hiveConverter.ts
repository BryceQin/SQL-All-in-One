import { HIVE_TO_MYSQL_TYPES } from './typeMappings'
import { HIVE_TO_MYSQL_FUNCTIONS, convertCoalesceToIfnull } from './functionMappings'

const HIVE_TYPE_REGEXES: [RegExp, string][] = Object.entries(HIVE_TO_MYSQL_TYPES).map(
  ([hiveType, mysqlType]) => [new RegExp(`\\b${hiveType}\\b`, 'gi'), mysqlType]
)

export class HiveToMysqlConverter {
  convert(sql: string): string {
    let converted = sql

    converted = this.convertFunctions(converted)
    converted = this.convertDataTypes(converted)

    return converted
  }

  private convertFunctions(sql: string): string {
    let result = convertCoalesceToIfnull(sql)

    for (const mapping of HIVE_TO_MYSQL_FUNCTIONS) {
      result = result.replace(mapping.pattern, mapping.replacement)
    }

    return result
  }

  private convertDataTypes(sql: string): string {
    let result = sql

    for (const [regex, mysqlType] of HIVE_TYPE_REGEXES) {
      result = result.replace(regex, mysqlType)
    }

    return result
  }
}
