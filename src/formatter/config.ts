import type { FormatOptions } from './FormatOptions.ts'

/**
 * 生成单个缩进步骤的字符串
 */
export function indentString(cfg: FormatOptions): string {
    if (
        cfg.indentStyle === 'tabularLeft' ||
        cfg.indentStyle === 'tabularRight'
    ) {
        return ' '.repeat(10)
    }
    if (cfg.useTabs) {
        return '\t'
    }
    return ' '.repeat(cfg.tabWidth)
}

/**
 * 判断当前缩进风格是否为表格风格
 */
export function isTabularStyle(cfg: FormatOptions): boolean {
    return (
        cfg.indentStyle === 'tabularLeft' || cfg.indentStyle === 'tabularRight'
    )
}
