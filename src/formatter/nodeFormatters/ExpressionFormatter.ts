import type { FormatOptions } from '../FormatOptions';
import Indentation from '../Indentation';
import { formatKeyword, formatFunctionName, hasProperty, isLogicalOperator } from './CommonFormatter';
import { AstNodeType } from '../AstNodeTypes';

export type SubqueryFormatter = (expr: unknown) => string;

export class ExpressionFormatter {
    private cfg: FormatOptions;
    private indent: Indentation;
    private formatSubqueryFn?: SubqueryFormatter;

    constructor(cfg: FormatOptions, indent: Indentation, formatSubqueryFn?: SubqueryFormatter) {
        this.cfg = cfg;
        this.indent = indent;
        this.formatSubqueryFn = formatSubqueryFn;
    }

    public format(expr: unknown): string {
        if (expr == null) return '';
        if (typeof expr === 'string') return expr;
        if (typeof expr === 'number') return String(expr);
        if (typeof expr === 'boolean') return String(expr).toUpperCase();
        if (!hasProperty(expr, 'type')) return String(expr);

        const type = (expr as any).type;
        switch (type) {
            case AstNodeType.COLUMN_REF:
                return this.formatColumnRef(expr);
            case AstNodeType.BINARY_EXPR:
                return this.formatBinaryExpr(expr);
            case AstNodeType.STRING:
            case AstNodeType.SINGLE_QUOTE_STRING:
            case AstNodeType.DOUBLE_QUOTE_STRING:
                return "'" + (expr as any).value + "'";
            case AstNodeType.NUMBER:
                return String((expr as any).value);
            case AstNodeType.BIGINT:
                return String((expr as any).value);
            case AstNodeType.BOOLEAN:
                return formatKeyword(String((expr as any).value), this.cfg.booleanCase ?? this.cfg.keywordCase);
            case AstNodeType.NULL:
                return formatKeyword('NULL', this.cfg.nullCase ?? this.cfg.keywordCase);
            case AstNodeType.STAR:
                return '*';
            case AstNodeType.FUNCTION:
                return this.formatFunction(expr);
            case AstNodeType.AGGR_FUNC:
                return this.formatAggrFunc(expr);
            case AstNodeType.EXPR_LIST:
                return this.formatExprList(expr);
            case AstNodeType.CASE:
                return this.formatCase(expr);
            case AstNodeType.CAST:
                return this.formatCast(expr);
            case AstNodeType.INTERVAL:
                return this.formatInterval(expr);
            case AstNodeType.PARAM:
                return this.formatParam(expr);
            case AstNodeType.UNARY_EXPR:
                return this.formatUnaryExpr(expr);
            case AstNodeType.TERNARY_EXPR:
                return this.formatTernaryExpr(expr);
            case AstNodeType.SELECT:
            case AstNodeType.UNION:
                return '(' + this.formatSubquery(expr) + ')';
            case AstNodeType.ORIGIN:
                return String((expr as any).value);
            case AstNodeType.DEFAULT:
                return formatKeyword('DEFAULT', this.cfg.keywordCase);
            default:
                return this.formatUnknown(expr);
        }
    }

    private formatColumnRef(expr: any): string {
        const table = expr.table;
        const column = expr.column;
        let colStr: string;
        if (typeof column === 'object' && column !== null) {
            if ('expr' in column) {
                colStr = this.format(column.expr);
            } else {
                colStr = String(column.value ?? column);
            }
        } else {
            colStr = String(column);
        }
        if (table) {
            return table + '.' + colStr;
        }
        return colStr;
    }

    private formatBinaryExpr(expr: any): string {
        const left = this.formatWithParentheses(expr.left);
        const right = this.formatWithParentheses(expr.right);
        const op = expr.operator;
        const upperOp = op.toUpperCase();

        if (isLogicalOperator(op)) {
            return this.formatLogicalBinary(left, upperOp, right);
        }

        if (upperOp === 'IN' || upperOp === 'NOT IN') {
            return left + ' ' + formatKeyword(upperOp, this.cfg.keywordCase) + ' ' + right;
        }

        if (this.cfg.denseOperators) {
            return left + op + right;
        }

        return left + ' ' + op + ' ' + right;
    }

    private formatWithParentheses(expr: any): string {
        const result = this.format(expr);
        if (expr && typeof expr === 'object' && expr.parentheses) {
            return '(' + result + ')';
        }
        return result;
    }

    private formatLogicalBinary(left: string, op: string, right: string): string {
        const formattedOp = formatKeyword(op, this.cfg.keywordCase);
        if (this.cfg.logicalOperatorNewline === 'before') {
            return left + '\n' + this.getCurrentIndent() + formattedOp + ' ' + right;
        } else {
            return left + ' ' + formattedOp + '\n' + this.getCurrentIndent() + right;
        }
    }

    private formatFunction(expr: any): string {
        const name = this.extractFunctionName(expr.name);
        const formattedName = formatFunctionName(name, this.cfg.functionCase);
        const args = this.formatFunctionArgs(expr.args);
        let result = formattedName + '(' + args + ')';

        if (expr.over) {
            result += this.formatOver(expr.over);
        }

        if (expr.suffix) {
            result += ' ' + this.format(expr.suffix);
        }

        return result;
    }

    private formatAggrFunc(expr: any): string {
        const name = String(expr.name);
        const formattedName = formatFunctionName(name, this.cfg.functionCase);
        const args = expr.args;
        let inner = '';

        if (args) {
            if (args.distinct) {
                inner += formatKeyword('DISTINCT', this.cfg.keywordCase) + ' ';
            }
            if (args.expr) {
                inner += this.format(args.expr);
            }
        }

        let result = formattedName + '(' + inner + ')';

        if (expr.over) {
            result += this.formatOver(expr.over);
        }

        return result;
    }

    private formatOver(over: any): string {
        let result = ' ' + formatKeyword('OVER', this.cfg.keywordCase) + ' (';

        if (typeof over === 'string') {
            result += over;
        } else if (over && typeof over === 'object') {
            const spec = over.window_specification || over;
            const parts: string[] = [];

            if (spec.partitionby && spec.partitionby.length > 0) {
                const partitionExprs = spec.partitionby.map((p: any) => {
                    if (p.expr) return p.expr.map((e: any) => this.format(e)).join(', ');
                    return this.format(p);
                });
                parts.push(formatKeyword('PARTITION BY', this.cfg.keywordCase) + ' ' + partitionExprs.join(', '));
            }

            if (spec.orderby && spec.orderby.length > 0) {
                const orderExprs = spec.orderby.map((o: any) => {
                    const exprStr = this.format(o.expr);
                    const type = o.type ? ' ' + o.type : '';
                    return exprStr + type;
                });
                parts.push(formatKeyword('ORDER BY', this.cfg.keywordCase) + ' ' + orderExprs.join(', '));
            }

            if (spec.window_frame_clause) {
                parts.push(spec.window_frame_clause);
            }

            result += parts.join(' ');
        }

        result += ')';
        return result;
    }

    private extractFunctionName(name: any): string {
        if (typeof name === 'string') return name;
        if (Array.isArray(name)) {
            return name.map((n: any) => {
                if (typeof n === 'string') return n;
                if (n && typeof n === 'object' && 'value' in n) return String(n.value);
                return String(n);
            }).join('');
        }
        if (name && typeof name === 'object') {
            if ('name' in name) {
                return this.extractFunctionName(name.name);
            }
            if ('value' in name) return String(name.value);
        }
        return String(name);
    }

    private formatFunctionArgs(args: any): string {
        if (args == null) return '';
        if (typeof args === 'string') return args;

        if (args.type === 'expr_list') {
            return this.formatExprListValues(args.value);
        }

        if (Array.isArray(args)) {
            return this.formatExprListValues(args);
        }

        if (typeof args === 'object' && 'value' in args) {
            if (Array.isArray(args.value)) {
                return this.formatExprListValues(args.value);
            }
            return this.format(args.value);
        }

        return this.format(args);
    }

    private formatExprListValues(values: any[]): string {
        return values.map((v: any) => this.format(v)).join(', ');
    }

    private formatExprList(expr: any): string {
        if (expr.parentheses) {
            return '(' + this.formatExprListValues(expr.value) + ')';
        }
        return this.formatExprListValues(expr.value);
    }

    private formatCase(expr: any): string {
        const parts: string[] = [formatKeyword('CASE', this.cfg.keywordCase)];

        if (expr.expr) {
            parts.push(this.format(expr.expr));
        }

        if (expr.args) {
            for (const arg of expr.args) {
                if (arg.type === 'when') {
                    parts.push(formatKeyword('WHEN', this.cfg.keywordCase));
                    parts.push(this.format(arg.cond));
                    parts.push(formatKeyword('THEN', this.cfg.keywordCase));
                    parts.push(this.format(arg.result));
                } else if (arg.type === 'else') {
                    parts.push(formatKeyword('ELSE', this.cfg.keywordCase));
                    parts.push(this.format(arg.result));
                }
            }
        }

        parts.push(formatKeyword('END', this.cfg.keywordCase));
        return parts.join(' ');
    }

    private formatCast(expr: any): string {
        const inner = this.format(expr.expr);
        const target = expr.target;
        let targetStr = '';
        if (Array.isArray(target)) {
            targetStr = target.map((t: any) => t.dataType || String(t)).join(' ');
        } else if (target) {
            targetStr = target.dataType || String(target);
        }
        return formatKeyword('CAST', this.cfg.functionCase) + '(' + inner + ' ' + formatKeyword('AS', this.cfg.keywordCase) + ' ' + targetStr + ')';
    }

    private formatInterval(expr: any): string {
        const unit = expr.unit;
        const value = this.format(expr.expr);
        return formatKeyword('INTERVAL', this.cfg.keywordCase) + ' ' + value + ' ' + unit;
    }

    private formatParam(expr: any): string {
        return String(expr.value);
    }

    private formatUnaryExpr(expr: any): string {
        const op = expr.operator;
        const operand = this.format(expr.expr);
        if (op === 'NOT') {
            return formatKeyword('NOT', this.cfg.keywordCase) + ' ' + operand;
        }
        return op + operand;
    }

    private formatTernaryExpr(expr: any): string {
        const op = expr.operator;
        if (op.toUpperCase() === 'BETWEEN') {
            return this.format(expr.left) + ' ' + formatKeyword('BETWEEN', this.cfg.keywordCase) + ' ' +
                this.format(expr.right) + ' ' + formatKeyword('AND', this.cfg.keywordCase) + ' ' +
                this.format(expr.right2);
        }
        return this.format(expr.left) + ' ' + op + ' ' + this.format(expr.right) + ' ' + String(expr.right2);
    }

    private formatSubquery(expr: any): string {
        if (this.formatSubqueryFn) {
            return '(' + this.formatSubqueryFn(expr) + ')';
        }
        return '(' + JSON.stringify(expr) + ')';
    }

    private formatUnknown(expr: any): string {
        if (typeof expr === 'string') return expr;
        try {
            return JSON.stringify(expr);
        } catch {
            return String(expr);
        }
    }

    private getCurrentIndent(): string {
        return this.indent.getSingleIndent().repeat(this.indent.getLevel());
    }
}
