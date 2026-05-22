import type { FormatOptions } from '../FormatOptions';
import Indentation from '../Indentation';
import Layout, { WS } from '../Layout';
import { formatKeyword, formatAlias, getStringValue, hasProperty } from './CommonFormatter';
import { ExpressionFormatter2 } from './ExpressionFormatter2';
import { CTEFormatter } from './CTEFormatter';

export class SelectFormatter {
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
        if (stmt.with) {
            this.formatWith(stmt.with);
        }

        this.formatSelectClause(stmt);

        if (stmt.from) {
            this.formatFromClause(stmt.from);
        }

        if (stmt.where) {
            this.formatWhereClause(stmt.where);
        }

        if (stmt.groupby) {
            this.formatGroupByClause(stmt.groupby);
        }

        if (stmt.having) {
            this.formatHavingClause(stmt.having);
        }

        if (stmt.orderby) {
            this.formatOrderByClause(stmt.orderby);
        }

        if (stmt.limit) {
            this.formatLimitClause(stmt.limit);
        }

        if (stmt._next) {
            this.formatSetOperation(stmt);
        }

        return this.layout.toString().trimEnd();
    }

    private formatSelectClause(stmt: any): void {
        this.layout.add(formatKeyword('SELECT', this.cfg.keywordCase));

        if (stmt.distinct) {
            this.layout.add(WS.SPACE, formatKeyword('DISTINCT', this.cfg.keywordCase));
        }

        if (this.cfg.newlineAfterSelect) {
            this.layout.indentation.increaseTopLevel();
            this.layout.add(WS.NEWLINE, WS.INDENT);
        } else {
            this.layout.add(WS.SPACE);
        }

        const columns = stmt.columns || [];
        this.formatColumns(columns);

        if (this.cfg.newlineAfterSelect) {
            this.layout.indentation.decreaseTopLevel();
        }
    }

    private formatColumns(columns: any[]): void {
        columns.forEach((col, i) => {
            if (i > 0) {
                if (this.cfg.commaPosition === 'before') {
                    this.layout.add(WS.NEWLINE, WS.INDENT, ',', WS.SPACE);
                } else {
                    this.layout.add(WS.NO_SPACE, ',', WS.NEWLINE, WS.INDENT);
                }
            }
            this.layout.add(this.formatColumn(col));
        });
    }

    private formatColumn(col: any): string {
        if (col.type === 'star') {
            return '*';
        }

        if (col.type === 'column_ref') {
            return this.exprFmt.format(col);
        }

        if (col.expr) {
            let result = this.exprFmt.format(col.expr);
            if (col.as) {
                result += formatAlias(col.as, this.cfg);
            }
            return result;
        }

        return this.exprFmt.format(col);
    }

    private formatFromClause(from: any): void {
        if (this.cfg.newlineAfterSelect) {
            this.layout.indentation.decreaseTopLevel();
        }

        this.layout.add(WS.NEWLINE, WS.INDENT, formatKeyword('FROM', this.cfg.keywordCase));

        if (this.cfg.newlineAfterFrom) {
            this.layout.indentation.increaseTopLevel();
            this.layout.add(WS.NEWLINE, WS.INDENT);
        } else {
            this.layout.add(WS.SPACE);
            this.layout.indentation.increaseTopLevel();
        }

        const fromList = Array.isArray(from) ? from : [from];
        this.formatFromList(fromList);

        this.layout.indentation.decreaseTopLevel();
    }

    private formatFromList(fromList: any[]): void {
        fromList.forEach((item, i) => {
            if (i > 0 && !item.join) {
                this.layout.add(WS.NO_SPACE, ',', WS.NEWLINE, WS.INDENT);
            }

            if (item.join) {
                this.formatJoin(item);
            } else if (item.type === 'dual') {
                this.layout.add(formatKeyword('DUAL', this.cfg.keywordCase));
            } else if (item.expr && item.expr.ast) {
                this.formatSubqueryFrom(item);
            } else {
                this.formatTableRef(item);
            }
        });
    }

    private formatTableRef(item: any): void {
        let tableStr = '';
        if (item.db) {
            tableStr += item.db + '.';
        }
        if (typeof item.table === 'object' && item.table !== null) {
            tableStr += this.exprFmt.format(item.table);
        } else {
            tableStr += String(item.table ?? '');
        }
        this.layout.add(tableStr);

        if (item.as) {
            this.layout.add(formatAlias(item.as, this.cfg));
        }
    }

    private formatSubqueryFrom(item: any): void {
        const { SelectFormatter } = require('./SelectFormatter');
        const subFmt = new SelectFormatter(this.cfg, this.indent);
        const subSql = subFmt.format(item.expr.ast);
        this.layout.add('(', WS.NEWLINE);
        this.indent.increaseBlockLevel();
        this.layout.add(WS.INDENT, subSql, WS.NEWLINE);
        this.indent.decreaseBlockLevel();
        this.layout.add(WS.INDENT, ')');

        if (item.as) {
            this.layout.add(formatAlias(item.as, this.cfg));
        }
    }

    private formatJoin(item: any): void {
        const joinType = formatKeyword(item.join, this.cfg.keywordCase);

        if (this.cfg.newlineBeforeJoin) {
            this.layout.add(WS.NEWLINE, WS.INDENT);
        } else {
            this.layout.add(WS.SPACE);
        }

        this.layout.add(joinType);

        if (this.cfg.newlineAfterJoin !== false) {
            this.layout.indentation.increaseBlockLevel();
            this.layout.add(WS.NEWLINE, WS.INDENT);
        } else {
            this.layout.add(WS.SPACE);
        }

        if (item.expr && item.expr.ast) {
            this.formatSubqueryFrom(item);
        } else {
            this.formatTableRef(item);
        }

        if (this.cfg.newlineAfterJoin !== false) {
            this.layout.indentation.decreaseBlockLevel();
        }

        if (item.on) {
            this.formatOnClause(item.on);
        }

        if (item.using) {
            this.formatUsingClause(item.using);
        }
    }

    private formatOnClause(on: any): void {
        const onKw = formatKeyword('ON', this.cfg.keywordCase);
        if (this.cfg.newlineBeforeOn) {
            this.layout.add(WS.NEWLINE, WS.INDENT, onKw, WS.SPACE);
        } else {
            this.layout.add(WS.SPACE, onKw, WS.SPACE);
        }
        this.layout.add(this.exprFmt.format(on));
    }

    private formatUsingClause(using: any): void {
        const usingKw = formatKeyword('USING', this.cfg.keywordCase);
        if (this.cfg.newlineBeforeUsing) {
            this.layout.add(WS.NEWLINE, WS.INDENT, usingKw, WS.SPACE);
        } else {
            this.layout.add(WS.SPACE, usingKw, WS.SPACE);
        }
        const cols = Array.isArray(using) ? using.join(', ') : String(using);
        this.layout.add('(' + cols + ')');
    }

    private formatWhereClause(where: any): void {
        if (this.cfg.newlineBeforeWhere) {
            this.layout.add(WS.NEWLINE, WS.INDENT);
        } else {
            this.layout.add(WS.SPACE);
        }

        this.layout.add(formatKeyword('WHERE', this.cfg.keywordCase));

        if (this.cfg.newlineAfterWhere) {
            this.layout.indentation.increaseTopLevel();
            this.layout.add(WS.NEWLINE, WS.INDENT);
        } else {
            this.layout.add(WS.SPACE);
            this.layout.indentation.increaseTopLevel();
        }

        this.layout.add(this.exprFmt.format(where));
        this.layout.indentation.decreaseTopLevel();
    }

    private formatGroupByClause(groupby: any): void {
        if (this.cfg.newlineBeforeGroupBy) {
            this.layout.add(WS.NEWLINE, WS.INDENT);
        } else {
            this.layout.add(WS.SPACE);
        }

        this.layout.add(formatKeyword('GROUP BY', this.cfg.keywordCase));

        if (this.cfg.newlineAfterGroupBy) {
            this.layout.indentation.increaseTopLevel();
            this.layout.add(WS.NEWLINE, WS.INDENT);
        } else {
            this.layout.add(WS.SPACE);
            this.layout.indentation.increaseTopLevel();
        }

        const columns = groupby.columns || (Array.isArray(groupby) ? groupby : []);
        const colStrs = columns.map((c: any) => this.exprFmt.format(c));
        this.layout.add(colStrs.join(', '));
        this.layout.indentation.decreaseTopLevel();
    }

    private formatHavingClause(having: any): void {
        if (this.cfg.newlineBeforeHaving) {
            this.layout.add(WS.NEWLINE, WS.INDENT);
        } else {
            this.layout.add(WS.SPACE);
        }

        this.layout.add(formatKeyword('HAVING', this.cfg.keywordCase));

        if (this.cfg.newlineAfterHaving) {
            this.layout.indentation.increaseTopLevel();
            this.layout.add(WS.NEWLINE, WS.INDENT);
        } else {
            this.layout.add(WS.SPACE);
            this.layout.indentation.increaseTopLevel();
        }

        this.layout.add(this.exprFmt.format(having));
        this.layout.indentation.decreaseTopLevel();
    }

    private formatOrderByClause(orderby: any): void {
        if (this.cfg.newlineBeforeOrderBy) {
            this.layout.add(WS.NEWLINE, WS.INDENT);
        } else {
            this.layout.add(WS.SPACE);
        }

        this.layout.add(formatKeyword('ORDER BY', this.cfg.keywordCase));

        if (this.cfg.newlineAfterOrderBy) {
            this.layout.indentation.increaseTopLevel();
            this.layout.add(WS.NEWLINE, WS.INDENT);
        } else {
            this.layout.add(WS.SPACE);
            this.layout.indentation.increaseTopLevel();
        }

        const items = Array.isArray(orderby) ? orderby : [];
        const itemStrs = items.map((o: any) => {
            const expr = this.exprFmt.format(o.expr);
            const type = o.type ? ' ' + o.type : '';
            return expr + type;
        });
        this.layout.add(itemStrs.join(', '));
        this.layout.indentation.decreaseTopLevel();
    }

    private formatLimitClause(limit: any): void {
        if (this.cfg.newlineBeforeLimit) {
            this.layout.add(WS.NEWLINE, WS.INDENT);
        } else {
            this.layout.add(WS.SPACE);
        }

        this.layout.add(formatKeyword('LIMIT', this.cfg.keywordCase));

        if (this.cfg.newlineAfterLimit) {
            this.layout.indentation.increaseTopLevel();
            this.layout.add(WS.NEWLINE, WS.INDENT);
        } else {
            this.layout.add(WS.SPACE);
        }

        if (limit.value) {
            const values = Array.isArray(limit.value) ? limit.value : [limit.value];
            const valStrs = values.map((v: any) => {
                if (typeof v === 'object' && v !== null) {
                    return String(v.value ?? v);
                }
                return String(v);
            });
            const sep = limit.seperator || ',';
            this.layout.add(valStrs.join(sep + ' '));
        }
    }

    private formatWith(withClause: any[]): void {
        const cteFmt = new CTEFormatter(this.cfg, this.indent);
        const cteResult = cteFmt.format(withClause);
        this.layout.add(cteResult, WS.NEWLINE);
    }

    private formatSetOperation(stmt: any): void {
        const next = stmt._next;
        const setOp = stmt.set_op || 'UNION';
        const formattedOp = formatKeyword(setOp, this.cfg.keywordCase);

        if (this.cfg.newlineBeforeSetOperation !== false) {
            const blankBefore = this.cfg.blankLinesBeforeSetOperation ?? 1;
            for (let i = 0; i < blankBefore; i++) {
                this.layout.add(WS.NEWLINE);
            }
            this.layout.add(WS.NEWLINE, WS.INDENT, formattedOp);
        } else {
            this.layout.add(WS.SPACE, formattedOp);
        }

        if (this.cfg.newlineAfterSetOperation !== false) {
            const blankAfter = this.cfg.blankLinesAfterSetOperation ?? 0;
            for (let i = 0; i < blankAfter; i++) {
                this.layout.add(WS.NEWLINE);
            }
            this.layout.add(WS.NEWLINE, WS.INDENT);
        } else {
            this.layout.add(WS.SPACE);
        }

        const { SelectFormatter } = require('./SelectFormatter');
        const nextFmt = new SelectFormatter(this.cfg, this.indent);
        this.layout.add(nextFmt.format(next));
    }
}
