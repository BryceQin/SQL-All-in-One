import { MYSQL_TO_HIVE_TYPES } from './typeMappings'
import { MYSQL_TO_HIVE_FUNCTIONS } from './functionMappings'
import { SqlParser } from './sqlParser'
import { getAstConverter } from './AstConverter'
import type { SqlDialect } from '../parser/dialectMapper'

export class MysqlToHiveConverter {
  private yearPlaceholders: { placeholder: string; original: string }[] = []
  private yearIndex = 0

  convert(sql: string): string {
    try {
      const astResult = getAstConverter().tryConvertCreateTable(sql, 'mysql' as SqlDialect, 'hive' as SqlDialect)
      if (astResult.success && astResult.result) {
        return astResult.result
      }

      let converted = sql

      converted = this.preserveYearColumnNames(converted)
      converted = this.processCreateTable(converted)
      converted = this.convertFunctions(converted)
      converted = this.restoreYearColumnNames(converted)

      return converted
    } catch (e) {
      this.yearPlaceholders = []
      this.yearIndex = 0
      throw e
    }
  }

  private preserveYearColumnNames(sql: string): string {
    return sql.replace(/`year`/gi, match => {
      const placeholder = `__YEAR_${this.yearIndex}__`
      this.yearPlaceholders.push({ placeholder, original: match })
      this.yearIndex++
      return placeholder
    })
  }

  private restoreYearColumnNames(sql: string): string {
    let result = sql
    for (let i = this.yearPlaceholders.length - 1; i >= 0; i--) {
      const { placeholder, original } = this.yearPlaceholders[i]
      result = result.replace(placeholder, original)
    }
    this.yearPlaceholders = []
    this.yearIndex = 0
    return result
  }

  private processCreateTable(sql: string): string {
    const tableInfo = SqlParser.findCreateTable(sql)
    if (!tableInfo) {
      return sql
    }

    const columnItems = SqlParser.splitColumnDefinitions(tableInfo.content)
    const cleanedItems = this.cleanColumnDefinitions(columnItems)
    const newCreateTable = this.rebuildCreateTable(
      tableInfo.before,
      cleanedItems,
      tableInfo.tableComment
    )

    return sql.replace(tableInfo.fullStatement, newCreateTable)
  }

  private cleanColumnDefinitions(items: string[]): string[] {
    const cleaned: string[] = []

    for (const item of items) {
      if (this.isIndexOrConstraint(item)) {
        continue
      }

      if (this.isInvalidColumn(item)) {
        continue
      }

      let cleanedItem = item
      cleanedItem = this.removeUnwantedAttributes(cleanedItem)
      cleanedItem = this.processEnumType(cleanedItem)
      cleanedItem = this.convertDataTypes(cleanedItem)
      cleanedItem = this.removeTypeLength(cleanedItem)

      if (cleanedItem.trim()) {
        cleaned.push(cleanedItem)
      }
    }

    return cleaned
  }

  private isIndexOrConstraint(item: string): boolean {
    return /^\s*(PRIMARY\s+KEY|KEY|INDEX|UNIQUE|FULLTEXT|FOREIGN\s+KEY)\s+/i.test(item)
  }

  private isInvalidColumn(item: string): boolean {
    return !!(item.trim() && !item.match(/\w+\s+\w+/) && !item.includes('COMMENT'))
  }

  private removeUnwantedAttributes(item: string): string {
    let result = item
    result = result.replace(/\bAUTO_INCREMENT\b/gi, '')
    result = result.replace(/\s+NOT\s+NULL/gi, '')
    result = result.replace(/\s+DEFAULT\s+NULL/gi, '')
    result = result.replace(/\s+CHARACTER\s+SET\s+\w+/gi, '')
    result = result.replace(/\s+COLLATE\s+\w+/gi, '')
    result = result.replace(/\s+USING\s+\w+/gi, '')
    result = result.replace(/\s+GENERATED\s+ALWAYS\s+AS\s+\([^)]*\)\s+(STORED|VIRTUAL)/gi, '')
    result = result.replace(/\s+ON\s+UPDATE\s+CURRENT_TIMESTAMP/gi, '')
    return result
  }

  private processEnumType(item: string): string {
    return item.replace(/\bENUM\s*\([^)]*\)/gi, 'STRING')
  }

  private convertDataTypes(item: string): string {
    let result = item

    for (const [mysqlType, hiveType] of Object.entries(MYSQL_TO_HIVE_TYPES)) {
      const regex = new RegExp(`\\b${mysqlType}\\b`, 'gi')
      result = result.replace(regex, hiveType)
    }

    return result
  }

  private removeTypeLength(item: string): string {
    return item.replace(/\b(STRING|VARCHAR|CHAR|TINYINT|SMALLINT|INT|INTEGER|BIGINT)\s*\(\s*\d+\s*\)/gi, (match, type) => {
      if (['STRING', 'VARCHAR', 'CHAR'].includes(type.toUpperCase())) {
        return 'STRING'
      }
      return type
    })
  }

  private rebuildCreateTable(before: string, items: string[], tableComment: string): string {
    let result = before + '\n  ' + items.join(',\n  ') + '\n'

    if (tableComment) {
      result += `) COMMENT '${tableComment}';`
    } else {
      result += ');'
    }

    return result
  }

  private convertFunctions(sql: string): string {
    let result = sql

    for (const mapping of MYSQL_TO_HIVE_FUNCTIONS) {
      result = result.replace(mapping.pattern, mapping.replacement)
    }

    return result
  }
}
