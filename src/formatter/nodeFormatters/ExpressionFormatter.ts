import type { FormatOptions } from '../FormatOptions';
import Indentation from '../Indentation';
import { formatKeyword, formatFunctionName, hasProperty, isLogicalOperator } from './CommonFormatter';
import { AstNodeType } from '../AstNodeTypes';
import type { AstNode } from '../../parser/astTypes';
import { handleError, ErrorCategory } from '../../core/errorHandler';

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

    public reset(cfg: FormatOptions, indent: Indentation): void {
        this.cfg = cfg;
        this.indent = indent;
    }

    public format(expr: unknown): string {
        if (expr == null) return '';
        if (typeof expr === 'string') return expr;
        if (typeof expr === 'number') return String(expr);
        if (typeof expr === 'boolean') return String(expr).toUpperCase();
        if (!hasProperty(expr, 'type')) return String(expr);

        const node = expr as AstNode;
        const type = node.type;
        switch (type) {
            case AstNodeType.COLUMN_REF:
                return this.formatColumnRef(node);
            case AstNodeType.BINARY_EXPR:
                return this.formatBinaryExpr(node);
            case AstNodeType.STRING:
            case AstNodeType.SINGLE_QUOTE_STRING:
            case AstNodeType.DOUBLE_QUOTE_STRING:
                return "'" + String(node.value) + "'";
            case AstNodeType.NUMBER:
                return String(node.value);
            case AstNodeType.BIGINT:
                return String(node.value);
            case AstNodeType.BOOLEAN:
                return formatKeyword(String(node.value), this.cfg.booleanCase ?? this.cfg.keywordCase);
            case AstNodeType.NULL:
                return formatKeyword('NULL', this.cfg.nullCase ?? this.cfg.keywordCase);
            case AstNodeType.STAR:
                return '*';
            case AstNodeType.FUNCTION:
                return this.formatFunction(node);
            case AstNodeType.AGGR_FUNC:
                return this.formatAggrFunc(node);
            case AstNodeType.EXPR_LIST:
                return this.formatExprList(node);
            case AstNodeType.CASE:
                return this.formatCase(node);
            case AstNodeType.CAST:
                return this.formatCast(node);
            case AstNodeType.INTERVAL:
                return this.formatInterval(node);
            case AstNodeType.PARAM:
                return this.formatParam(node);
            case AstNodeType.UNARY_EXPR:
                return this.formatUnaryExpr(node);
            case AstNodeType.TERNARY_EXPR:
                return this.formatTernaryExpr(node);
            case AstNodeType.SELECT:
            case AstNodeType.UNION:
                return '(' + this.formatSubquery(node) + ')';
            case AstNodeType.ORIGIN:
                return String(node.value);
            case AstNodeType.DEFAULT:
                return formatKeyword('DEFAULT', this.cfg.keywordCase);
            default:
                return this.formatUnknown(expr);
        }
    }

    private formatColumnRef(expr: AstNode): string {
        const table = expr.table;
        const column = expr.column;
        let colStr: string;
        if (typeof column === 'object' && column !== null) {
            if ('expr' in (column as Record<string, unknown>)) {
                colStr = this.format((column as Record<string, unknown>).expr);
            } else {
                colStr = String((column as { value?: unknown }).value ?? column);
            }
        } else {
            colStr = String(column);
        }
        if (table) {
            return String(table) + '.' + colStr;
        }
        return colStr;
    }

    private formatBinaryExpr(expr: AstNode): string {
        const left = this.formatWithParentheses(expr.left as unknown);
        const op = String(expr.operator);
        const upperOp = op.toUpperCase();

        if (isLogicalOperator(op)) {
            const right = this.formatWithParentheses(expr.right as unknown);
            return this.formatLogicalBinary(left, upperOp, right);
        }

        // BETWEEN / NOT BETWEEN: parser stores the bounds as an expr_list of
        // two values in `right`. They must be joined with AND, not comma,
        // otherwise the output is invalid SQL (e.g. `x BETWEEN a, b`).
        // Note: parentheses on the BETWEEN expression itself are already
        // applied by formatWithParentheses(left) above, so we don't re-wrap.
        if (upperOp === 'BETWEEN' || upperOp === 'NOT BETWEEN') {
            const rightStr = this.formatBetweenRight(expr.right);
            const formattedOp = formatKeyword(upperOp, this.cfg.keywordCase);
            return left + ' ' + formattedOp + ' ' + rightStr;
        }

        // IN / NOT IN: parser stores the value list as an expr_list in
        // `right` without a `parentheses` flag (the parentheses are part of
        // the IN syntax, not expression grouping). Wrap the list in parens
        // so the output stays valid SQL.
        if (upperOp === 'IN' || upperOp === 'NOT IN') {
            const rightStr = this.formatInRight(expr.right);
            return left + ' ' + formatKeyword(upperOp, this.cfg.keywordCase) + ' ' + rightStr;
        }

        const right = this.formatWithParentheses(expr.right as unknown);

        if (this.cfg.denseOperators) {
            return left + op + right;
        }

        return left + ' ' + op + ' ' + right;
    }

    /**
     * Formats the right-hand side of a BETWEEN expression. node-sql-parser
     * represents `BETWEEN a AND b` as an `expr_list` containing the two
     * bounds; we join them with AND to produce valid SQL.
     */
    private formatBetweenRight(right: unknown): string {
        if (right && typeof right === 'object' && (right as AstNode).type === AstNodeType.EXPR_LIST) {
            const values = (right as AstNode).value as AstNode[];
            const andKw = formatKeyword('AND', this.cfg.keywordCase);
            return values.map((v: AstNode): string => this.format(v)).join(' ' + andKw + ' ');
        }
        return this.format(right);
    }

    /**
     * Formats the right-hand side of an IN expression. node-sql-parser
     * represents `IN (a, b)` as an `expr_list` without a `parentheses` flag
     * (the parens are part of IN syntax), so we must add them back here.
     */
    private formatInRight(right: unknown): string {
        if (right && typeof right === 'object' && (right as AstNode).type === AstNodeType.EXPR_LIST) {
            const values = (right as AstNode).value as AstNode[];
            return '(' + values.map((v: AstNode): string => this.format(v)).join(', ') + ')';
        }
        // Subqueries and other node types are already self-delimiting.
        return this.format(right);
    }

    private formatWithParentheses(expr: unknown): string {
        const result = this.format(expr);
        if (expr && typeof expr === 'object' && 'parentheses' in expr) {
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

    private formatFunction(expr: AstNode): string {
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

    private formatAggrFunc(expr: AstNode): string {
        const name = String(expr.name);
        const formattedName = formatFunctionName(name, this.cfg.functionCase);
        const args = expr.args as { distinct?: unknown; expr?: unknown } | undefined;
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

    private formatOver(over: unknown): string {
        let result = ' ' + formatKeyword('OVER', this.cfg.keywordCase) + ' (';

        if (typeof over === 'string') {
            result += over;
        } else if (over && typeof over === 'object') {
            const overObj = over as Record<string, unknown>;
            const spec = (overObj.window_specification || over) as Record<string, unknown>;
            const parts: string[] = [];

            if (spec.partitionby && Array.isArray(spec.partitionby) && spec.partitionby.length > 0) {
                const partitionExprs = (spec.partitionby as AstNode[]).map((p: AstNode): string => {
                    if (p.expr) return ((p.expr as AstNode[]).map((e: AstNode): string => this.format(e)).join(', '));
                    return this.format(p);
                });
                parts.push(formatKeyword('PARTITION BY', this.cfg.keywordCase) + ' ' + partitionExprs.join(', '));
            }

            if (spec.orderby && Array.isArray(spec.orderby) && spec.orderby.length > 0) {
                const orderExprs = (spec.orderby as AstNode[]).map((o: AstNode): string => {
                    const exprStr = this.format(o.expr);
                    const type = o.type ? ' ' + String(o.type) : '';
                    return exprStr + type;
                });
                parts.push(formatKeyword('ORDER BY', this.cfg.keywordCase) + ' ' + orderExprs.join(', '));
            }

            if (spec.window_frame_clause) {
                parts.push(String(spec.window_frame_clause));
            }

            result += parts.join(' ');
        }

        result += ')';
        return result;
    }

    private extractFunctionName(name: unknown): string {
        if (typeof name === 'string') return name;
        if (Array.isArray(name)) {
            return name.map((n: unknown): string => {
                if (typeof n === 'string') return n;
                if (n && typeof n === 'object' && 'value' in (n as Record<string, unknown>)) return String((n as { value: unknown }).value);
                return String(n);
            }).join('');
        }
        if (name && typeof name === 'object') {
            const nameObj = name as Record<string, unknown>;
            if ('name' in nameObj) {
                return this.extractFunctionName(nameObj.name);
            }
            if ('value' in nameObj) return String(nameObj.value);
        }
        return String(name);
    }

    private formatFunctionArgs(args: unknown): string {
        if (args == null) return '';
        if (typeof args === 'string') return args;

        if (typeof args === 'object' && 'type' in (args as Record<string, unknown>) && (args as AstNode).type === 'expr_list') {
            return this.formatExprListValues((args as AstNode).value as AstNode[]);
        }

        if (Array.isArray(args)) {
            return this.formatExprListValues(args as AstNode[]);
        }

        if (typeof args === 'object' && 'value' in (args as Record<string, unknown>)) {
            const argsObj = args as { value: unknown };
            if (Array.isArray(argsObj.value)) {
                return this.formatExprListValues(argsObj.value as AstNode[]);
            }
            return this.format(argsObj.value);
        }

        return this.format(args);
    }

    private formatExprListValues(values: AstNode[]): string {
        return values.map((v: AstNode): string => this.format(v)).join(', ');
    }

    private formatExprList(expr: AstNode): string {
        if (expr.parentheses) {
            return '(' + this.formatExprListValues(expr.value as AstNode[]) + ')';
        }
        return this.formatExprListValues(expr.value as AstNode[]);
    }

    private formatCase(expr: AstNode): string {
        const parts: string[] = [formatKeyword('CASE', this.cfg.keywordCase)];

        if (expr.expr) {
            parts.push(this.format(expr.expr));
        }

        if (expr.args) {
            for (const arg of expr.args as AstNode[]) {
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

    private formatCast(expr: AstNode): string {
        const inner = this.format(expr.expr);
        const target = expr.target as unknown;
        let targetStr = '';
        if (Array.isArray(target)) {
            targetStr = target.map((t: unknown): string => {
                const tNode = t as Record<string, unknown>;
                return String(tNode.dataType ?? t);
            }).join(' ');
        } else if (target) {
            const targetObj = target as Record<string, unknown>;
            targetStr = String(targetObj.dataType ?? target);
        }
        return formatKeyword('CAST', this.cfg.functionCase) + '(' + inner + ' ' + formatKeyword('AS', this.cfg.keywordCase) + ' ' + targetStr + ')';
    }

    private formatInterval(expr: AstNode): string {
        const unit = String(expr.unit);
        const value = this.format(expr.expr);
        return formatKeyword('INTERVAL', this.cfg.keywordCase) + ' ' + value + ' ' + unit;
    }

    private formatParam(expr: AstNode): string {
        return String(expr.value);
    }

    private formatUnaryExpr(expr: AstNode): string {
        const op = String(expr.operator);
        const operand = this.format(expr.expr);
        if (op === 'NOT') {
            return formatKeyword('NOT', this.cfg.keywordCase) + ' ' + operand;
        }
        return op + operand;
    }

    private formatTernaryExpr(expr: AstNode): string {
        const op = String(expr.operator);
        if (op.toUpperCase() === 'BETWEEN') {
            return this.format(expr.left) + ' ' + formatKeyword('BETWEEN', this.cfg.keywordCase) + ' ' +
                this.format(expr.right) + ' ' + formatKeyword('AND', this.cfg.keywordCase) + ' ' +
                this.format(expr.right2);
        }
        return this.format(expr.left) + ' ' + op + ' ' + this.format(expr.right) + ' ' + String(expr.right2);
    }

    private formatSubquery(expr: AstNode): string {
        if (this.formatSubqueryFn) {
            return '(' + this.formatSubqueryFn(expr) + ')';
        }
        return '(' + JSON.stringify(expr) + ')';
    }

    private formatUnknown(expr: unknown): string {
        if (typeof expr === 'string') return expr;
        try {
            return JSON.stringify(expr);
        } catch (e) {
            // JSON.stringify may fail on circular references; fall back to String()
            handleError(e, 'ExpressionFormatter.formatUnknown', ErrorCategory.FORMAT)
            return String(expr);
        }
    }

    private getCurrentIndent(): string {
        return this.indent.getSingleIndent().repeat(this.indent.getLevel());
    }
}
