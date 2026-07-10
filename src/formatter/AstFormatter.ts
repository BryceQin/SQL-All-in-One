import type { FormatOptions } from "./FormatOptions";
import { indentString } from "./config";
import { getParserEngine } from "../parser/SqlParserEngine";
import type { AST } from "node-sql-parser";
import type { SqlDialect } from "../parser/dialectMapper";
import { isAstNode } from "../parser/AstVisitor";
import type { AstNode } from "../parser/astTypes";
import Layout, { WS } from "./Layout";
import Indentation from "./Indentation";
import { ExpressionFormatter } from "./nodeFormatters/ExpressionFormatter";
import { FormatterFactory } from "./nodeFormatters/FormatterFactory";
import { formatKeyword } from "./nodeFormatters/CommonFormatter";
import { AstNodeType } from "./AstNodeTypes";
import { handleError, ErrorCategory } from "../core/errorHandler";

export class AstFormatter {
    private cfg: FormatOptions;
    private dialect: SqlDialect;
    private indent: Indentation;
    private factory: FormatterFactory;
    private expressionFormatter: ExpressionFormatter;

    constructor(cfg: FormatOptions, dialect: SqlDialect) {
        this.cfg = cfg;
        this.dialect = dialect;
        this.indent = new Indentation(indentString(cfg));
        this.factory = new FormatterFactory();
        this.expressionFormatter = new ExpressionFormatter(cfg, this.indent);
    }

    public format(sql: string): string {
        this.indent.reset();
        const engine = getParserEngine();
        let ast: AST[] | AST;
        try {
            ast = engine.astify(sql, this.dialect);
        } catch (e) {
            // 任务 5（P3）：astify 失败会直接抛 ParseError，原先 format 没有 try-catch，
            // 错误会冒泡到 VSCode 调用方。捕获后记录错误并返回原始 SQL，保证调用方仍可用。
            handleError(e, "AstFormatter.format", ErrorCategory.FORMAT);
            return sql;
        }
        const statements = Array.isArray(ast) ? ast : [ast];
        return this.formatStatements(statements);
    }

    private formatStatements(statements: unknown[]): string {
        const results = statements.map((stmt, i) => {
            const formatted = this.formatStatement(stmt);
            if (i < statements.length - 1) {
                return formatted + ";";
            }
            return this.cfg.semicolonAtEnd ? formatted + ";" : formatted;
        });
        return results.join("\n".repeat(this.cfg.linesBetweenQueries + 1));
    }

    private formatStatement(stmt: unknown): string {
        if (!isAstNode(stmt)) return "";
        const type = stmt.type as string;
        switch (type) {
            case AstNodeType.SELECT:
                return this.factory.getSelectFormatter(this.cfg, this.indent).format(stmt as AstNode);
            case AstNodeType.INSERT:
            case AstNodeType.REPLACE:
                return this.factory.getInsertFormatter(this.cfg, this.indent).format(stmt as AstNode);
            case AstNodeType.UPDATE:
                return this.formatUpdate(stmt);
            case AstNodeType.DELETE:
                return this.formatDelete(stmt);
            case AstNodeType.CREATE:
            case AstNodeType.ALTER:
            case AstNodeType.DROP:
                return this.factory.getDDLFormatter(this.cfg, this.indent).format(stmt as AstNode);
            case AstNodeType.USE:
                return this.formatUse(stmt);
            default:
                return this.formatUnknown(stmt);
        }
    }

    private formatUpdate(stmt: Record<string, unknown>): string {
        const layout = new Layout(this.indent);
        const exprFmt = this.expressionFormatter;

        layout.add(formatKeyword("UPDATE", this.cfg.keywordCase));

        if (stmt.table) {
            const tables = (Array.isArray(stmt.table) ? stmt.table : [stmt.table]) as Record<string, unknown>[];
            for (const t of tables) {
                layout.add(WS.SPACE);
                if (t.type === "dual") {
                    layout.add(formatKeyword("DUAL", this.cfg.keywordCase));
                } else if (typeof t.table === "object" && t.table !== null) {
                    let tableStr = "";
                    if (t.db) tableStr += String(t.db) + ".";
                    tableStr += exprFmt.format(t.table);
                    layout.add(tableStr);
                } else {
                    let tableStr = "";
                    if (t.db) tableStr += String(t.db) + ".";
                    tableStr += String(t.table ?? "");
                    layout.add(tableStr);
                }
            }
        }

        layout.add(WS.NEWLINE, WS.INDENT, formatKeyword("SET", this.cfg.keywordCase));
        layout.indentation.increaseTopLevel();
        layout.add(WS.NEWLINE, WS.INDENT);

        if (stmt.set) {
            (stmt.set as Record<string, unknown>[]).forEach((s, i) => {
                if (i > 0) {
                    layout.add(WS.NO_SPACE, ",", WS.NEWLINE, WS.INDENT);
                }
                const col = String(s.column || "");
                const val = exprFmt.format(s.value);
                layout.add(col + " = " + val);
            });
        }

        layout.indentation.decreaseTopLevel();

        if (stmt.where) {
            layout.add(WS.NEWLINE, WS.INDENT, formatKeyword("WHERE", this.cfg.keywordCase));
            layout.indentation.increaseTopLevel();
            layout.add(WS.NEWLINE, WS.INDENT);
            layout.add(exprFmt.format(stmt.where));
            layout.indentation.decreaseTopLevel();
        }

        return layout.toString().trimEnd();
    }

    private formatDelete(stmt: Record<string, unknown>): string {
        const layout = new Layout(this.indent);
        const exprFmt = this.expressionFormatter;

        layout.add(formatKeyword("DELETE", this.cfg.keywordCase));

        if (stmt.from) {
            layout.add(WS.NEWLINE, WS.INDENT, formatKeyword("FROM", this.cfg.keywordCase));
            layout.indentation.increaseTopLevel();
            layout.add(WS.NEWLINE, WS.INDENT);

            const fromList = (Array.isArray(stmt.from) ? stmt.from : [stmt.from]) as Record<string, unknown>[];
            fromList.forEach((item, i) => {
                if (i > 0) {
                    layout.add(WS.NO_SPACE, ",", WS.NEWLINE, WS.INDENT);
                }
                if (item.type === "dual") {
                    layout.add(formatKeyword("DUAL", this.cfg.keywordCase));
                } else {
                    let tableStr = "";
                    if (item.db) tableStr += String(item.db) + ".";
                    if (typeof item.table === "object" && item.table !== null) {
                        tableStr += exprFmt.format(item.table);
                    } else {
                        tableStr += String(item.table ?? "");
                    }
                    layout.add(tableStr);
                    if (item.as) {
                        layout.add(" " + formatKeyword("AS", this.cfg.keywordCase) + " " + String(item.as));
                    }
                }
            });

            layout.indentation.decreaseTopLevel();
        }

        if (stmt.where) {
            layout.add(WS.NEWLINE, WS.INDENT, formatKeyword("WHERE", this.cfg.keywordCase));
            layout.indentation.increaseTopLevel();
            layout.add(WS.NEWLINE, WS.INDENT);
            layout.add(exprFmt.format(stmt.where));
            layout.indentation.decreaseTopLevel();
        }

        return layout.toString().trimEnd();
    }

    private quoteIdentifier(name: string): string {
        return "`" + name.replace(/`/g, "``") + "`";
    }

    private formatUse(stmt: Record<string, unknown>): string {
        return formatKeyword("USE", this.cfg.keywordCase) + " " + this.quoteIdentifier(String(stmt.db));
    }

    private formatUnknown(stmt: Record<string, unknown>): string {
        const engine = getParserEngine();
        try {
            return engine.sqlify(stmt as unknown as AST, this.dialect);
        } catch (e) {
            // sqlify failed for unsupported statement; emit a comment placeholder
            handleError(e, "AstFormatter.formatUnknown", ErrorCategory.FORMAT);
            const type = String(
                (stmt as Record<string, unknown>).type ||
                    ((stmt as Record<string, unknown>).ast as Record<string, unknown> | undefined)?.["type"] ||
                    "unknown",
            );
            return `/* unsupported: ${type} */`;
        }
    }
}
