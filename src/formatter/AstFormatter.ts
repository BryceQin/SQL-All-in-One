import type { FormatOptions } from './FormatOptions';
import { indentString } from './config';
import { getParserEngine } from '../parser/SqlParserEngine';
import type { AST } from 'node-sql-parser';
import type { SqlDialect } from '../parser/dialectMapper';
import { isAstNode } from '../parser/AstVisitor';
import Layout, { WS } from './Layout';
import Indentation from './Indentation';
import { SelectFormatter } from './nodeFormatters/SelectFormatter';
import { InsertFormatter } from './nodeFormatters/InsertFormatter';
import { DDLFormatter } from './nodeFormatters/DDLFormatter';
import { ExpressionFormatter } from './nodeFormatters/ExpressionFormatter';
import { formatKeyword } from './nodeFormatters/CommonFormatter';
import { AstNodeType } from './AstNodeTypes';

export class AstFormatter {
    private cfg: FormatOptions;
    private dialect: SqlDialect;
    private indent: Indentation;

    constructor(cfg: FormatOptions, dialect: SqlDialect) {
        this.cfg = cfg;
        this.dialect = dialect;
        this.indent = new Indentation(indentString(cfg));
    }

    public format(sql: string): string {
        const engine = getParserEngine();
        const ast = engine.astify(sql, this.dialect);
        const statements = Array.isArray(ast) ? ast : [ast];
        return this.formatStatements(statements);
    }

    private formatStatements(statements: unknown[]): string {
        const results = statements.map((stmt, i) => {
            const formatted = this.formatStatement(stmt);
            if (i < statements.length - 1) {
                return formatted + ';';
            }
            return this.cfg.semicolonAtEnd ? formatted + ';' : formatted;
        });
        return results.join('\n'.repeat(this.cfg.linesBetweenQueries + 1));
    }

    private formatStatement(stmt: unknown): string {
        if (!isAstNode(stmt)) return '';
        const type = stmt.type as string;
        switch (type) {
            case AstNodeType.SELECT:
                return this.formatSelect(stmt);
            case AstNodeType.INSERT:
            case AstNodeType.REPLACE:
                return new InsertFormatter(this.cfg, this.indent).format(stmt);
            case AstNodeType.UPDATE:
                return this.formatUpdate(stmt);
            case AstNodeType.DELETE:
                return this.formatDelete(stmt);
            case AstNodeType.CREATE:
            case AstNodeType.ALTER:
            case AstNodeType.DROP:
                return new DDLFormatter(this.cfg, this.indent).format(stmt);
            case AstNodeType.USE:
                return this.formatUse(stmt);
            default:
                return this.formatUnknown(stmt);
        }
    }

    private formatSelect(stmt: Record<string, unknown>): string {
        const selectFmt = new SelectFormatter(this.cfg, this.indent);
        return selectFmt.format(stmt);
    }

    private formatUpdate(stmt: Record<string, unknown>): string {
        const layout = new Layout(this.indent);
        const exprFmt = new ExpressionFormatter(this.cfg, this.indent);

        layout.add(formatKeyword('UPDATE', this.cfg.keywordCase));

        if (stmt.table) {
            const tables = (Array.isArray(stmt.table) ? stmt.table : [stmt.table]) as Record<string, unknown>[];
            for (const t of tables) {
                layout.add(WS.SPACE);
                if (t.type === 'dual') {
                    layout.add(formatKeyword('DUAL', this.cfg.keywordCase));
                } else if (typeof t.table === 'object' && t.table !== null) {
                    let tableStr = '';
                    if (t.db) tableStr += String(t.db) + '.';
                    tableStr += exprFmt.format(t.table);
                    layout.add(tableStr);
                } else {
                    let tableStr = '';
                    if (t.db) tableStr += String(t.db) + '.';
                    tableStr += String(t.table ?? '');
                    layout.add(tableStr);
                }
            }
        }

        layout.add(WS.NEWLINE, WS.INDENT, formatKeyword('SET', this.cfg.keywordCase));
        layout.indentation.increaseTopLevel();
        layout.add(WS.NEWLINE, WS.INDENT);

        if (stmt.set) {
            (stmt.set as Record<string, unknown>[]).forEach((s, i) => {
                if (i > 0) {
                    layout.add(WS.NO_SPACE, ',', WS.NEWLINE, WS.INDENT);
                }
                const col = String(s.column || '');
                const val = exprFmt.format(s.value);
                layout.add(col + ' = ' + val);
            });
        }

        layout.indentation.decreaseTopLevel();

        if (stmt.where) {
            layout.add(WS.NEWLINE, WS.INDENT, formatKeyword('WHERE', this.cfg.keywordCase));
            layout.indentation.increaseTopLevel();
            layout.add(WS.NEWLINE, WS.INDENT);
            layout.add(exprFmt.format(stmt.where));
            layout.indentation.decreaseTopLevel();
        }

        return layout.toString().trimEnd();
    }

    private formatDelete(stmt: Record<string, unknown>): string {
        const layout = new Layout(this.indent);
        const exprFmt = new ExpressionFormatter(this.cfg, this.indent);

        layout.add(formatKeyword('DELETE', this.cfg.keywordCase));

        if (stmt.from) {
            layout.add(WS.NEWLINE, WS.INDENT, formatKeyword('FROM', this.cfg.keywordCase));
            layout.indentation.increaseTopLevel();
            layout.add(WS.NEWLINE, WS.INDENT);

            const fromList = (Array.isArray(stmt.from) ? stmt.from : [stmt.from]) as Record<string, unknown>[];
            fromList.forEach((item, i) => {
                if (i > 0) {
                    layout.add(WS.NO_SPACE, ',', WS.NEWLINE, WS.INDENT);
                }
                if (item.type === 'dual') {
                    layout.add(formatKeyword('DUAL', this.cfg.keywordCase));
                } else {
                    let tableStr = '';
                    if (item.db) tableStr += String(item.db) + '.';
                    if (typeof item.table === 'object' && item.table !== null) {
                        tableStr += exprFmt.format(item.table);
                    } else {
                        tableStr += String(item.table ?? '');
                    }
                    layout.add(tableStr);
                    if (item.as) {
                        layout.add(' ' + formatKeyword('AS', this.cfg.keywordCase) + ' ' + String(item.as));
                    }
                }
            });

            layout.indentation.decreaseTopLevel();
        }

        if (stmt.where) {
            layout.add(WS.NEWLINE, WS.INDENT, formatKeyword('WHERE', this.cfg.keywordCase));
            layout.indentation.increaseTopLevel();
            layout.add(WS.NEWLINE, WS.INDENT);
            layout.add(exprFmt.format(stmt.where));
            layout.indentation.decreaseTopLevel();
        }

        return layout.toString().trimEnd();
    }

    private formatUse(stmt: Record<string, unknown>): string {
        return formatKeyword('USE', this.cfg.keywordCase) + ' ' + String(stmt.db);
    }

    private formatUnknown(stmt: Record<string, unknown>): string {
        const engine = getParserEngine();
        try {
            return engine.sqlify(stmt as unknown as AST, this.dialect);
        } catch {
            return JSON.stringify(stmt);
        }
    }
}
