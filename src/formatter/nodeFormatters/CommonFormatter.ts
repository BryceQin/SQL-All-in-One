import type { FormatOptions, KeywordCase, FunctionCase } from '../FormatOptions';
import Indentation from '../Indentation';
import Layout, { WS } from '../Layout';

export function formatKeyword(text: string, caseOption: KeywordCase): string {
    switch (caseOption) {
        case 'upper':
            return text.toUpperCase();
        case 'lower':
            return text.toLowerCase();
        case 'preserve':
            return text;
    }
}

export function formatFunctionName(name: string, caseOption: FunctionCase): string {
    switch (caseOption) {
        case 'upper':
            return name.toUpperCase();
        case 'lower':
            return name.toLowerCase();
        case 'preserve':
            return name;
    }
}

export function addIndent(layout: Layout, indent: Indentation): void {
    for (let i = 0; i < indent.getLevel(); i++) {
        layout.add(WS.SINGLE_INDENT);
    }
}

export function formatAlias(as: unknown, cfg: FormatOptions): string {
    if (as == null) return '';
    const aliasStr = typeof as === 'object' && 'value' in (as as any)
        ? String((as as any).value)
        : String(as);
    if (!aliasStr) return '';
    return ' ' + formatKeyword('AS', cfg.keywordCase) + ' ' + aliasStr;
}

export function joinWithComma(items: string[], cfg: FormatOptions, layout: Layout, indent: Indentation): void {
    items.forEach((item, i) => {
        if (i > 0) {
            if (cfg.commaPosition === 'before') {
                layout.add(WS.NEWLINE, WS.INDENT);
                layout.add(',', WS.SPACE, item);
            } else {
                layout.add(WS.NO_SPACE, ',', WS.NEWLINE, WS.INDENT, item);
            }
        } else {
            layout.add(item);
        }
    });
}

export function joinInline(items: string[], separator: string): string {
    return items.join(separator);
}

export function hasProperty(obj: unknown, prop: string): boolean {
    return typeof obj === 'object' && obj !== null && prop in obj;
}

export function getStringValue(obj: unknown, prop: string): string | null {
    if (!hasProperty(obj, prop)) return null;
    const val = (obj as any)[prop];
    if (val == null) return null;
    if (typeof val === 'object' && 'value' in val) return String(val.value);
    return String(val);
}

export function isLogicalOperator(op: string): boolean {
    const upper = op.toUpperCase();
    return upper === 'AND' || upper === 'OR' || upper === 'XOR';
}

export function isComparisonOperator(op: string): boolean {
    return ['=', '!=', '<>', '<', '>', '<=', '>=', 'LIKE', 'NOT LIKE', 'IN', 'NOT IN', 'IS', 'IS NOT'].includes(op.toUpperCase());
}
