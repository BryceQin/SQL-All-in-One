import type { TransformContext, AstNodeTransformer } from '../AstTransformEngine'

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

function getOptionKeyword(option: unknown): string | null {
    if (typeof option === 'object' && option !== null && 'keyword' in option) {
        return String((option as { keyword: unknown }).keyword)
    }
    return null
}

function isUnsupported(keyword: string, unsupported: Set<string>): boolean {
    const upper = keyword.toUpperCase()
    for (const unsupportedKeyword of unsupported) {
        if (upper === unsupportedKeyword || upper.startsWith(unsupportedKeyword)) {
            return true
        }
    }
    return false
}

export class TableOptionTransformer implements AstNodeTransformer {
    matches(_node: Record<string, unknown>, parent: Record<string, unknown> | null, key: string | null): boolean {
        if (key !== 'table_options' || !parent) {
            return false
        }
        const options = parent.table_options
        return Array.isArray(options)
    }

    transform(_node: Record<string, unknown>, parent: Record<string, unknown> | null, _key: string | null, ctx: TransformContext): void {
        if (!parent || !Array.isArray(parent.table_options)) {
            return
        }

        const unsupported = ctx.to === 'hive'
            ? HIVE_UNSUPPORTED_TABLE_OPTIONS
            : ctx.to === 'mysql'
                ? MYSQL_UNSUPPORTED_TABLE_OPTIONS
                : null

        if (!unsupported || unsupported.size === 0) {
            return
        }

        parent.table_options = parent.table_options.filter((option) => {
            const keyword = getOptionKeyword(option)
            if (!keyword) return true
            return !isUnsupported(keyword, unsupported)
        })
    }
}
