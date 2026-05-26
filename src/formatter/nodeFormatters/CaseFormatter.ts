import type { FormatOptions } from '../FormatOptions';
import Indentation from '../Indentation';
import Layout, { WS } from '../Layout';
import { formatKeyword } from './CommonFormatter';
import { ExpressionFormatter } from './ExpressionFormatter';

export class CaseFormatter {
    private cfg: FormatOptions;
    private indent: Indentation;
    private layout: Layout;
    private exprFmt: ExpressionFormatter;

    constructor(cfg: FormatOptions, indent: Indentation) {
        this.cfg = cfg;
        this.indent = indent;
        this.layout = new Layout(new Indentation(indent.getSingleIndent()));
        this.layout.indentation = indent;
        this.exprFmt = new ExpressionFormatter(cfg, indent);
    }

    public format(expr: any): string {
        this.layout.add(formatKeyword('CASE', this.cfg.keywordCase));

        if (expr.expr) {
            this.layout.add(WS.SPACE, this.exprFmt.format(expr.expr));
        }

        if (this.cfg.newlineAfterCase !== false) {
            this.indent.increaseBlockLevel();
        }

        if (expr.args) {
            for (const arg of expr.args) {
                if (arg.type === 'when') {
                    this.formatWhen(arg);
                } else if (arg.type === 'else') {
                    this.formatElse(arg);
                }
            }
        }

        if (this.cfg.newlineAfterCase !== false) {
            this.indent.decreaseBlockLevel();
        }

        this.layout.add(WS.NEWLINE, WS.INDENT, formatKeyword('END', this.cfg.keywordCase));

        return this.layout.toString().trimEnd();
    }

    private formatWhen(arg: any): void {
        if (this.cfg.indentWhen !== false) {
            this.layout.add(WS.NEWLINE, WS.INDENT);
        } else {
            this.layout.add(WS.SPACE);
        }

        this.layout.add(formatKeyword('WHEN', this.cfg.keywordCase));

        if (this.cfg.newlineAfterWhen) {
            this.layout.add(WS.NEWLINE, WS.INDENT);
        } else {
            this.layout.add(WS.SPACE);
        }

        this.layout.add(this.exprFmt.format(arg.cond));

        this.layout.add(WS.SPACE, formatKeyword('THEN', this.cfg.keywordCase));

        if (this.cfg.newlineAfterThen) {
            this.layout.add(WS.NEWLINE, WS.INDENT);
        } else {
            this.layout.add(WS.SPACE);
        }

        this.layout.add(this.exprFmt.format(arg.result));
    }

    private formatElse(arg: any): void {
        this.layout.add(WS.NEWLINE, WS.INDENT, formatKeyword('ELSE', this.cfg.keywordCase));

        if (this.cfg.newlineAfterElse) {
            this.layout.add(WS.NEWLINE, WS.INDENT);
        } else {
            this.layout.add(WS.SPACE);
        }

        this.layout.add(this.exprFmt.format(arg.result));
    }
}
