import type { AST, Create, CreateColumnDefinition, CreateDefinition } from 'node-sql-parser'
import { getParserEngine } from '../parser/SqlParserEngine'
import type { SqlDialect } from '../parser/dialectMapper'
import { MYSQL_TO_HIVE_TYPES, HIVE_TO_MYSQL_TYPES } from './typeMappings'

interface ConvertResult {
    success: boolean
    result: string | null
    error: Error | null
}

const HIVE_UNSUPPORTED_TABLE_OPTIONS = new Set([
    'ENGINE',
    'AUTO_INCREMENT',
    'DEFAULT CHARSET',
    'CHARSET',
    'COLLATE',
    'ROW_FORMAT',
    'AVG_ROW_LENGTH',
    'MAX_ROWS',
    'MIN_ROWS',
    'PACK_KEYS',
    'CHECKSUM',
    'DELAY_KEY_WRITE',
    'INSERT_METHOD',
    'DATA DIRECTORY',
    'INDEX DIRECTORY',
    'STATS_PERSISTENT',
    'STATS_AUTO_RECALC',
    'STATS_SAMPLE_PAGES',
    'TABLESPACE',
    'CONNECTION',
])

const MYSQL_UNSUPPORTED_TABLE_OPTIONS = new Set([
    'STORED AS',
    'LOCATION',
    'TBLPROPERTIES',
    'ROW FORMAT',
    'SERDE',
    'SERDEPROPERTIES',
    'INPUTFORMAT',
    'OUTPUTFORMAT',
])

class AstConverter {
    convertCreateTable(sql: string, fromDialect: SqlDialect, toDialect: SqlDialect): string {
        const ast = getParserEngine().astify(sql, fromDialect)
        const astArray = Array.isArray(ast) ? ast : [ast]
        let modified = false

        for (const node of astArray) {
            if (this.isCreateTableNode(node)) {
                this.transformCreateTableNode(node, fromDialect, toDialect)
                modified = true
            }
        }

        if (!modified) {
            throw new Error('No CREATE TABLE statement found in the input SQL')
        }

        return getParserEngine().sqlify(astArray.length === 1 ? astArray[0] : astArray, toDialect)
    }

    tryConvertCreateTable(sql: string, fromDialect: SqlDialect, toDialect: SqlDialect): ConvertResult {
        try {
            const result = this.convertCreateTable(sql, fromDialect, toDialect)
            return { success: true, result, error: null }
        } catch (e) {
            const error = e instanceof Error ? e : new Error(String(e))
            return { success: false, result: null, error }
        }
    }

    private isCreateTableNode(node: AST): node is Create {
        return (
            typeof node === 'object' &&
            node !== null &&
            'type' in node &&
            (node as Create).type === 'create' &&
            'keyword' in node &&
            (node as Create).keyword === 'table'
        )
    }

    private transformCreateTableNode(node: Create, fromDialect: SqlDialect, toDialect: SqlDialect): void {
        if (node.create_definitions) {
            node.create_definitions = this.transformCreateDefinitions(
                node.create_definitions,
                fromDialect,
                toDialect,
            )
        }

        if (node.table_options) {
            node.table_options = this.transformTableOptions(node.table_options, toDialect)
        }
    }

    private transformCreateDefinitions(
        definitions: CreateDefinition[],
        fromDialect: SqlDialect,
        toDialect: SqlDialect,
    ): CreateDefinition[] {
        const result: CreateDefinition[] = []

        for (const def of definitions) {
            if (this.isColumnDefinition(def)) {
                const transformed = this.transformColumnDefinition(def, fromDialect, toDialect)
                result.push(transformed)
            } else if (this.shouldKeepConstraint(def, toDialect)) {
                result.push(def)
            }
        }

        return result
    }

    private isColumnDefinition(def: CreateDefinition): def is CreateColumnDefinition {
        return (def as CreateColumnDefinition).resource === 'column'
    }

    private shouldKeepConstraint(def: CreateDefinition, toDialect: SqlDialect): boolean {
        if (toDialect === 'hive') {
            const constraint = def as { resource: string; constraint_type?: string }
            if (constraint.resource === 'index' || constraint.resource === 'constraint') {
                return false
            }
        }
        return true
    }

    private transformColumnDefinition(
        col: CreateColumnDefinition,
        fromDialect: SqlDialect,
        toDialect: SqlDialect,
    ): CreateColumnDefinition {
        const transformed = { ...col }

        if (transformed.definition) {
            transformed.definition = this.transformDataType(transformed.definition, fromDialect, toDialect)
        }

        if (toDialect === 'hive') {
            this.stripMysqlColumnAttributes(transformed)
        }

        if (toDialect === 'mysql') {
            this.stripHiveColumnAttributes(transformed)
        }

        return transformed
    }

    private transformDataType(
        definition: CreateColumnDefinition['definition'],
        fromDialect: SqlDialect,
        toDialect: SqlDialect,
    ): CreateColumnDefinition['definition'] {
        const upperType = definition.dataType.toUpperCase()
        const mapping = this.getTypeMapping(fromDialect, toDialect)
        const mappedType = mapping[upperType]

        if (!mappedType) {
            return { ...definition }
        }

        const result = { ...definition }
        result.dataType = mappedType

        if (mappedType === 'STRING') {
            delete result.length
            delete result.parentheses
        } else if (mappedType.includes('(')) {
            const match = mappedType.match(/^(\w+)\((\d+)\)$/)
            if (match) {
                result.dataType = match[1]
                result.length = Number(match[2])
                result.parentheses = true
            }
        }

        return result
    }

    private getTypeMapping(fromDialect: SqlDialect, toDialect: SqlDialect): Record<string, string> {
        if (fromDialect === 'mysql' && toDialect === 'hive') {
            return MYSQL_TO_HIVE_TYPES
        }
        if (fromDialect === 'hive' && toDialect === 'mysql') {
            return HIVE_TO_MYSQL_TYPES
        }
        return {}
    }

    private stripMysqlColumnAttributes(col: CreateColumnDefinition): void {
        if ('auto_increment' in col) {
            delete (col as Record<string, unknown>).auto_increment
        }
        if ('nullable' in col && col.nullable && col.nullable.type === 'not null') {
            delete (col as Record<string, unknown>).nullable
        }
        if ('default_val' in col && col.default_val) {
            const val = col.default_val.value
            if (this.isDefaultValueNull(val)) {
                delete (col as Record<string, unknown>).default_val
            }
        }
        if ('collate' in col) {
            delete (col as Record<string, unknown>).collate
        }
        if ('character_set' in col) {
            delete (col as Record<string, unknown>).character_set
        }
        if ('column_format' in col) {
            delete (col as Record<string, unknown>).column_format
        }
        if ('storage' in col) {
            delete (col as Record<string, unknown>).storage
        }
        if ('reference_definition' in col) {
            delete (col as Record<string, unknown>).reference_definition
        }
        if (col.definition) {
            const def = col.definition as Record<string, unknown>
            if ('suffix' in def) {
                delete def.suffix
            }
        }
    }

    private isDefaultValueNull(val: unknown): boolean {
        if (val === null || val === 'null') {
            return true
        }
        if (typeof val === 'object' && val !== null && 'type' in val) {
            return (val as { type: string }).type === 'null'
        }
        return false
    }

    private stripHiveColumnAttributes(_col: CreateColumnDefinition): void {
        // Hive-specific column attributes that MySQL doesn't support are minimal
        // The main transformation is handled by type mapping
    }

    private transformTableOptions(tableOptions: Record<string, unknown>[], toDialect: SqlDialect): Record<string, unknown>[] {
        const unsupported = toDialect === 'hive'
            ? HIVE_UNSUPPORTED_TABLE_OPTIONS
            : toDialect === 'mysql'
                ? MYSQL_UNSUPPORTED_TABLE_OPTIONS
                : new Set<string>()

        if (unsupported.size === 0) {
            return tableOptions
        }

        return tableOptions.filter((option) => {
            const keyword = this.getOptionKeyword(option)
            if (!keyword) return true
            const upperKeyword = keyword.toUpperCase()
            for (const unsupportedKeyword of unsupported) {
                if (upperKeyword === unsupportedKeyword || upperKeyword.startsWith(unsupportedKeyword)) {
                    return false
                }
            }
            return true
        })
    }

    private getOptionKeyword(option: unknown): string | null {
        if (typeof option === 'object' && option !== null) {
            if ('keyword' in option) {
                return String((option as { keyword: unknown }).keyword)
            }
        }
        return null
    }
}

let converterInstance: AstConverter | null = null

export function getAstConverter(): AstConverter {
    if (!converterInstance) {
        converterInstance = new AstConverter()
    }
    return converterInstance
}

export { AstConverter, type ConvertResult }
