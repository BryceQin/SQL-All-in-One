import type { FormatOptions } from '../FormatOptions';
import Indentation from '../Indentation';
import Layout, { WS } from '../Layout';
import { formatKeyword, formatAlias } from './CommonFormatter';
import { ExpressionFormatter2 } from './ExpressionFormatter2';

export class InsertFormatter {
    private cfg: FormatOptions;
    private indent: Indentation;
    private layout: Layout;
    private exprFmt: ExpressionFormatter2;

    constructor(cfg: FormatOptions, indent: Indentation) {
        this.cfg = cfg;
        this.indent = indent;
        this.layout = new Layout(new Indentation(indent.getSingleIndent()));
        this.layout.indentation = indent;
        this.exprFmt = new ExpressionFormatter2(cfg, indent);
    }

    public format(stmt: any): string {
        const kw = stmt.type === 'replace' ? 'REPLACE' : 'INSERT';
        this.layout.add(formatKeyword(kw, this.cfg.keywordCase));

        if (stmt.prefix) {
            this.layout.add(WS.SPACE, formatKeyword(stmt.prefix.toUpperCase(), this.cfg.keywordCase));
        }

        this.formatTableRef(stmt.table);

        if (stmt.columns && Array.isArray(stmt.columns) && stmt.columns.length > 0) {
            this.formatColumns(stmt.columns);
        }

        if (stmt.values) {
            this.formatValues(stmt.values);
        }

        if (stmt.on_duplicate_update) {
            this.formatOnDuplicateUpdate(stmt.on_duplicate_update);
        }

        if (stmt.returning) {
            this.formatReturning(stmt.returning);
        }

        return this.layout.toString().trimEnd();
    }

    private formatTableRef(table: any): void {
        if (Array.isArray(table)) {
            table.forEach((t: any, i: number) => {
                if (i > 0) {
                    this.layout.add(WS.NO_SPACE, ',', WS.SPACE);
                }
                this.formatSingleTableRef(t);
            });
        } else if (typeof table === 'string') {
            this.layout.add(WS.SPACE, table);
        } else if (table && typeof table === 'object') {
            this.formatSingleTableRef(table);
        }
    }

    private formatSingleTableRef(table: any): void {
        let tableStr = '';
        if (table.db) {
            tableStr += table.db + '.';
        }
        if (typeof table.table === 'object' && table.table !== null) {
            tableStr += this.exprFmt.format(table.table);
        } else {
            tableStr += String(table.table ?? '');
        }
        this.layout.add(WS.SPACE, tableStr);
    }

    private formatColumns(columns: any[]): void {
        if (this.cfg.newlineAfterInsertColumns) {
            this.layout.add(WS.NEWLINE, WS.INDENT, '(');
            this.indent.increaseBlockLevel();
            this.layout.add(WS.NEWLINE, WS.INDENT);
        } else {
            this.layout.add(WS.SPACE, '(');
        }

        const colStrs = columns.map((c: any) => {
            if (typeof c === 'object' && c !== null) {
                if ('column' in c) return this.exprFmt.format(c);
                if ('value' in c) return String(c.value);
                return String(c);
            }
            return String(c);
        });

        colStrs.forEach((col, i) => {
            if (i > 0) {
                if (this.cfg.commaPosition === 'before') {
                    this.layout.add(WS.NEWLINE, WS.INDENT, ',', WS.SPACE);
                } else {
                    this.layout.add(WS.NO_SPACE, ',', WS.NEWLINE, WS.INDENT);
                }
            }
            this.layout.add(col);
        });

        if (this.cfg.newlineAfterInsertColumns) {
            this.indent.decreaseBlockLevel();
            this.layout.add(WS.NEWLINE, WS.INDENT, ')');
        } else {
            this.layout.add(')');
        }
    }

    private formatValues(values: any): void {
        this.layout.add(WS.NEWLINE, WS.INDENT, formatKeyword('VALUES', this.cfg.keywordCase));

        if (values.type === 'values') {
            const valueGroups = values.values || [];
            valueGroups.forEach((group: any, gi: number) => {
                if (gi > 0) {
                    if (this.cfg.newlineBetweenValuesGroups) {
                        this.layout.add(WS.NO_SPACE, ',', WS.NEWLINE, WS.INDENT);
                    } else {
                        this.layout.add(WS.NO_SPACE, ',', WS.SPACE);
                    }
                } else {
                    this.indent.increaseBlockLevel();
                    this.layout.add(WS.NEWLINE, WS.INDENT);
                }

                if (group.type === 'expr_list') {
                    const exprStrs = (group.value || []).map((v: any) => this.exprFmt.format(v));
                    this.layout.add('(' + exprStrs.join(', ') + ')');
                } else {
                    this.layout.add(this.exprFmt.format(group));
                }
            });
            this.indent.decreaseBlockLevel();
        } else if (values.type === 'select') {
            this.layout.add(WS.NEWLINE, WS.INDENT);
            const { SelectFormatter } = require('./SelectFormatter');
            const selectFmt = new SelectFormatter(this.cfg, this.indent);
            this.layout.add(selectFmt.format(values));
        }
    }

    private formatOnDuplicateUpdate(odu: any): void {
        this.layout.add(WS.NEWLINE, WS.INDENT, formatKeyword('ON DUPLICATE KEY UPDATE', this.cfg.keywordCase));
        this.indent.increaseTopLevel();
        this.layout.add(WS.NEWLINE, WS.INDENT);

        const sets = odu.set || [];
        sets.forEach((s: any, i: number) => {
            if (i > 0) {
                this.layout.add(WS.NO_SPACE, ',', WS.NEWLINE, WS.INDENT);
            }
            const col = s.column || '';
            const val = this.exprFmt.format(s.value);
            this.layout.add(col + ' = ' + val);
        });

        this.indent.decreaseTopLevel();
    }

    private formatReturning(returning: any): void {
        this.layout.add(WS.NEWLINE, WS.INDENT, formatKeyword('RETURNING', this.cfg.keywordCase));
        this.layout.add(WS.SPACE);

        if (returning.columns) {
            if (Array.isArray(returning.columns)) {
                const colStrs = returning.columns.map((c: any) => this.exprFmt.format(c));
                this.layout.add(colStrs.join(', '));
            } else {
                this.layout.add(this.exprFmt.format(returning.columns));
            }
        }
    }
}
