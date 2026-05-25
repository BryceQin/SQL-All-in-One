import type { FormatOptions } from '../FormatOptions';
import Indentation from '../Indentation';
import Layout, { WS } from '../Layout';
import { formatKeyword } from './CommonFormatter';

export class CommonLayoutHelper {
    constructor(
        private cfg: FormatOptions,
        private indent: Indentation,
        private layout: Layout,
    ) {}

    clauseStart(keyword: string, newlineBefore: boolean): void {
        if (newlineBefore) {
            this.layout.add(WS.NEWLINE, WS.INDENT);
        } else {
            this.layout.add(WS.SPACE);
        }
        this.layout.add(formatKeyword(keyword, this.cfg.keywordCase));
    }

    clauseBody(newlineAfter: boolean, formatFn: () => void): void {
        if (newlineAfter) {
            this.indent.increaseTopLevel();
            this.layout.add(WS.NEWLINE, WS.INDENT);
        } else {
            this.layout.add(WS.SPACE);
            this.indent.increaseTopLevel();
        }
        formatFn();
        this.indent.decreaseTopLevel();
    }

    formatTableName(item: any, exprFmt: { format(expr: unknown): string }): string {
        if (typeof item === 'string') return item;
        let result = '';
        if (item.db) result += item.db + '.';
        if (typeof item.table === 'object' && item.table !== null) {
            result += exprFmt.format(item.table);
        } else {
            result += String(item.table ?? '');
        }
        return result;
    }
}