import type { FormatOptions } from "../FormatOptions";
import Indentation from "../Indentation";
import Layout, { WS } from "../Layout";
import { formatKeyword } from "./CommonFormatter";
import { ExpressionFormatter } from "./ExpressionFormatter";
import { SelectFormatter } from "./SelectFormatter";
import type { AstNode } from "../../parser/astTypes";
import type { FormatterFactory } from "./FormatterFactory";

export class InsertFormatter {
    private cfg: FormatOptions;
    private indent: Indentation;
    private layout: Layout;
    private exprFmt: ExpressionFormatter;
    private factory?: FormatterFactory;

    constructor(cfg: FormatOptions, indent: Indentation, factory?: FormatterFactory) {
        this.cfg = cfg;
        this.indent = indent;
        this.layout = new Layout(indent);
        this.factory = factory;
        this.exprFmt = new ExpressionFormatter(cfg, indent, (expr: unknown): string => {
            const selectFmt = factory ? factory.getSelectFormatter(this.cfg, this.indent) : new SelectFormatter(this.cfg, this.indent);
            return selectFmt.format(expr);
        });
    }

    public reset(cfg: FormatOptions, indent: Indentation): void {
        this.cfg = cfg;
        this.indent = indent;
        this.layout = new Layout(indent);
        this.exprFmt.reset(cfg, indent);
    }

    public format(stmt: AstNode): string {
        try {
            this.layout.clear();
            const kw = stmt.type === "replace" ? "REPLACE" : "INSERT";
            this.layout.add(formatKeyword(kw, this.cfg.keywordCase));

            if (stmt.prefix) {
                this.layout.add(WS.SPACE, formatKeyword(String(stmt.prefix).toUpperCase(), this.cfg.keywordCase));
            }

            this.formatTableRef(stmt.table);

            if (stmt.columns && Array.isArray(stmt.columns) && (stmt.columns as AstNode[]).length > 0) {
                this.formatColumns(stmt.columns as AstNode[]);
            }

            if (stmt.values) {
                this.formatValues(stmt.values as Record<string, unknown>);
            }

            if (stmt.on_duplicate_update) {
                this.formatOnDuplicateUpdate(stmt.on_duplicate_update as Record<string, unknown>);
            }

            if (stmt.returning) {
                this.formatReturning(stmt.returning as Record<string, unknown>);
            }

            return this.layout.toString().trimEnd();
        } finally {
            if (this.factory) {
                this.factory.releaseInstance(this);
            }
        }
    }

    private formatTableRef(table: unknown): void {
        if (Array.isArray(table)) {
            (table as AstNode[]).forEach((t: AstNode, i: number): void => {
                if (i > 0) {
                    this.layout.add(WS.NO_SPACE, ",", WS.SPACE);
                }
                this.formatSingleTableRef(t);
            });
        } else if (typeof table === "string") {
            this.layout.add(WS.SPACE, table);
        } else if (table && typeof table === "object") {
            this.formatSingleTableRef(table as AstNode);
        }
    }

    private formatSingleTableRef(table: AstNode): void {
        let tableStr = "";
        if (table.db) {
            tableStr += String(table.db) + ".";
        }
        if (typeof table.table === "object" && table.table !== null) {
            tableStr += this.exprFmt.format(table.table);
        } else {
            tableStr += String(table.table ?? "");
        }
        this.layout.add(WS.SPACE, tableStr);
    }

    private formatColumns(columns: AstNode[]): void {
        if (this.cfg.newlineAfterInsertColumns) {
            this.layout.add(WS.NEWLINE, WS.INDENT, "(");
            this.indent.increaseBlockLevel();
            this.layout.add(WS.NEWLINE, WS.INDENT);
        } else {
            this.layout.add(WS.SPACE, "(");
        }

        const colStrs = columns.map((c: AstNode): string => {
            if (typeof c === "object" && c !== null) {
                if ("column" in c) return this.exprFmt.format(c);
                if ("value" in c) return String((c as unknown as { value: unknown }).value);
                return String(c);
            }
            return String(c);
        });

        colStrs.forEach((col: string, i: number): void => {
            if (i > 0) {
                if (this.cfg.commaPosition === "before") {
                    this.layout.add(WS.NEWLINE, WS.INDENT, ",", WS.SPACE);
                } else {
                    this.layout.add(WS.NO_SPACE, ",", WS.NEWLINE, WS.INDENT);
                }
            }
            this.layout.add(col);
        });

        if (this.cfg.newlineAfterInsertColumns) {
            this.indent.decreaseBlockLevel();
            this.layout.add(WS.NEWLINE, WS.INDENT, ")");
        } else {
            this.layout.add(")");
        }
    }

    private formatValues(values: Record<string, unknown>): void {
        this.layout.add(WS.NEWLINE, WS.INDENT, formatKeyword("VALUES", this.cfg.keywordCase));

        if (values.type === "values") {
            const valueGroups = (values.values || []) as AstNode[];
            valueGroups.forEach((group: AstNode, gi: number): void => {
                if (gi > 0) {
                    if (this.cfg.newlineBetweenValuesGroups) {
                        this.layout.add(WS.NO_SPACE, ",", WS.NEWLINE, WS.INDENT);
                    } else {
                        this.layout.add(WS.NO_SPACE, ",", WS.SPACE);
                    }
                } else {
                    this.indent.increaseBlockLevel();
                    this.layout.add(WS.NEWLINE, WS.INDENT);
                }

                if (group.type === "expr_list") {
                    const exprStrs = ((group.value || []) as AstNode[]).map((v: AstNode): string => this.exprFmt.format(v));
                    this.layout.add("(" + exprStrs.join(", ") + ")");
                } else {
                    this.layout.add(this.exprFmt.format(group));
                }
            });
            this.indent.decreaseBlockLevel();
        } else if (values.type === "select") {
            this.layout.add(WS.NEWLINE, WS.INDENT);
            const selectFmt = this.factory
                ? this.factory.getSelectFormatter(this.cfg, this.indent)
                : new SelectFormatter(this.cfg, this.indent);
            this.layout.add(selectFmt.format(values));
        }
    }

    private formatOnDuplicateUpdate(odu: Record<string, unknown>): void {
        this.layout.add(WS.NEWLINE, WS.INDENT, formatKeyword("ON DUPLICATE KEY UPDATE", this.cfg.keywordCase));
        this.indent.increaseTopLevel();
        this.layout.add(WS.NEWLINE, WS.INDENT);

        const sets = (odu.set || []) as { column?: unknown; value?: unknown }[];
        sets.forEach((s: { column?: unknown; value?: unknown }, i: number): void => {
            if (i > 0) {
                this.layout.add(WS.NO_SPACE, ",", WS.NEWLINE, WS.INDENT);
            }
            const col = s.column || "";
            const val = this.exprFmt.format(s.value);
            this.layout.add(String(col) + " = " + val);
        });

        this.indent.decreaseTopLevel();
    }

    private formatReturning(returning: Record<string, unknown>): void {
        this.layout.add(WS.NEWLINE, WS.INDENT, formatKeyword("RETURNING", this.cfg.keywordCase));
        this.layout.add(WS.SPACE);

        if (returning.columns) {
            if (Array.isArray(returning.columns)) {
                const colStrs = (returning.columns as AstNode[]).map((c: AstNode): string => this.exprFmt.format(c));
                this.layout.add(colStrs.join(", "));
            } else {
                this.layout.add(this.exprFmt.format(returning.columns));
            }
        }
    }
}
