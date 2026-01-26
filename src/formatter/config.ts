import type { FormatOptions } from './FormatOptions.ts';

// Utility functions for config options

/**
 * 生成单个缩进步骤的字符串
 */
export function indentString(cfg: FormatOptions): string {
    if (
        cfg.indentStyle === 'tabularLeft' ||
        cfg.indentStyle === 'tabularRight'
    ) {
        return ' '.repeat(10);
    }
    if (cfg.useTabs) {
        return '\t';
    }
    return ' '.repeat(cfg.tabWidth);
}

/**
 * 判断当前缩进风格是否为「制表符风格」.
 */
export function isTabularStyle(cfg: FormatOptions): boolean {
    return (
        cfg.indentStyle === 'tabularLeft' || cfg.indentStyle === 'tabularRight'
    );
}
