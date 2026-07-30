import type { FormatOptions } from "../FormatOptions";
import Indentation from "../Indentation";
import Layout, { WS } from "../Layout";
import { formatKeyword } from "./CommonFormatter";
import { ExpressionFormatter } from "./ExpressionFormatter";
import { SelectFormatter } from "./SelectFormatter";
import { CommonLayoutHelper } from "./CommonLayoutHelper";
import type { AstNode } from "../../parser/astTypes";
import type { FormatterFactory } from "./FormatterFactory";

export class DDLFormatter {
    private cfg: FormatOptions;
    private indent: Indentation;
    private layout: Layout;
    private exprFmt: ExpressionFormatter;
    private helper: CommonLayoutHelper;
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
        this.helper = new CommonLayoutHelper(cfg, indent, this.layout);
    }

    public reset(cfg: FormatOptions, indent: Indentation): void {
        this.cfg = cfg;
        this.indent = indent;
        this.layout = new Layout(indent);
        this.exprFmt.reset(cfg, indent);
        this.helper.reset(cfg, indent, this.layout);
    }

    public format(stmt: AstNode): string {
        try {
            this.layout.clear();
            switch (stmt.type) {
                case "create":
                    return this.formatCreate(stmt);
                case "alter":
                    return this.formatAlter(stmt);
                case "drop":
                    return this.formatDrop(stmt);
                default:
                    return this.formatUnknown(stmt);
            }
        } finally {
            if (this.factory) {
                this.factory.releaseInstance(this);
            }
        }
    }

    private formatCreate(stmt: AstNode): string {
        this.layout.add(formatKeyword("CREATE", this.cfg.keywordCase));

        if (stmt.temporary) {
            this.layout.add(WS.SPACE, formatKeyword("TEMPORARY", this.cfg.keywordCase));
        }

        const keyword = stmt.keyword ? String(stmt.keyword).toUpperCase() : "TABLE";
        this.layout.add(WS.SPACE, formatKeyword(keyword, this.cfg.keywordCase));

        if (stmt.if_not_exists) {
            this.layout.add(WS.SPACE, formatKeyword("IF NOT EXISTS", this.cfg.keywordCase));
        }

        this.formatCreateTarget(stmt);

        if (stmt.like) {
            const likeObj = stmt.like as AstNode;
            this.layout.add(WS.SPACE, formatKeyword("LIKE", this.cfg.keywordCase), WS.SPACE);
            this.layout.add(String(likeObj.table));
            return this.layout.toString().trimEnd();
        }

        if (stmt.create_definitions && Array.isArray(stmt.create_definitions) && (stmt.create_definitions as AstNode[]).length > 0) {
            this.formatCreateDefinitions(stmt.create_definitions as AstNode[]);
        }

        if (stmt.table_options && Array.isArray(stmt.table_options) && (stmt.table_options as AstNode[]).length > 0) {
            this.formatTableOptions(stmt.table_options as Record<string, unknown>[]);
        }

        if (stmt.query_expr) {
            this.layout.add(WS.SPACE, formatKeyword("AS", this.cfg.keywordCase));
            this.layout.add(WS.NEWLINE, WS.INDENT);
            const selectFmt = this.factory
                ? this.factory.getSelectFormatter(this.cfg, this.indent)
                : new SelectFormatter(this.cfg, this.indent);
            this.layout.add(selectFmt.format(stmt.query_expr));
        }

        return this.layout.toString().trimEnd();
    }

    private formatCreateTarget(stmt: AstNode): void {
        const table = stmt.table;
        if (table) {
            this.layout.add(WS.SPACE);
            if (Array.isArray(table)) {
                const tableStrs = (table as AstNode[]).map((t: AstNode): string => this.formatTableName(t));
                this.layout.add(tableStrs.join(", "));
            } else {
                this.layout.add(this.formatTableName(table as AstNode));
            }
        }

        if (stmt.index) {
            this.layout.add(WS.SPACE);
            if (typeof stmt.index === "object" && stmt.index !== null) {
                const indexObj = stmt.index as Record<string, unknown>;
                if (indexObj.name) {
                    this.layout.add(String(indexObj.name));
                } else {
                    this.layout.add(String(stmt.index));
                }
            } else {
                this.layout.add(String(stmt.index));
            }
        }

        if (stmt.on_kw) {
            this.layout.add(WS.SPACE, formatKeyword("ON", this.cfg.keywordCase), WS.SPACE);
        }

        if (stmt.index_columns) {
            const colStrs = (stmt.index_columns as AstNode[]).map((c: AstNode): string => this.exprFmt.format(c));
            this.layout.add("(" + colStrs.join(", ") + ")");
        }
    }

    private formatTableName(table: AstNode): string {
        return this.helper.formatTableName(table, this.exprFmt);
    }

    private formatCreateDefinitions(defs: AstNode[]): void {
        this.layout.add(WS.SPACE, "(");
        this.indent.increaseBlockLevel();
        this.layout.add(WS.NEWLINE, WS.INDENT);

        defs.forEach((def: AstNode, i: number): void => {
            if (i > 0) {
                this.layout.add(WS.NO_SPACE, ",", WS.NEWLINE, WS.INDENT);
            }

            if (def.resource === "column") {
                this.formatColumnDefinition(def);
            } else if (def.resource === "index") {
                this.formatIndexDefinition(def);
            } else if (def.resource === "constraint") {
                this.formatConstraintDefinition(def);
            } else {
                // 任务 3（P5）：未知 resource 类型原先输出 JSON.stringify(def) 会破坏 SQL 输出，
                // 改为注释占位符保持输出为合法 SQL。
                this.layout.add(`/* unsupported: ${String(def.resource || "unknown")} */`);
            }
        });

        this.indent.decreaseBlockLevel();
        this.layout.add(WS.NEWLINE, WS.INDENT, ")");
    }

    private formatColumnDefinition(def: AstNode): void {
        const colName = this.exprFmt.format(def.column);
        const dataType = this.formatDataType(def.definition as Record<string, unknown>);
        this.layout.add(colName, WS.SPACE, dataType);

        if (def.nullable) {
            const nullable = def.nullable as { type: string };
            if (nullable.type === "not null") {
                this.layout.add(WS.SPACE, formatKeyword("NOT NULL", this.cfg.keywordCase));
            } else {
                this.layout.add(WS.SPACE, formatKeyword("NULL", this.cfg.keywordCase));
            }
        }

        if (def.default_val) {
            const defaultVal = def.default_val as { value: unknown };
            this.layout.add(WS.SPACE, formatKeyword("DEFAULT", this.cfg.keywordCase), WS.SPACE);
            this.layout.add(this.exprFmt.format(defaultVal.value));
        }

        if (def.auto_increment) {
            this.layout.add(WS.SPACE, formatKeyword("AUTO_INCREMENT", this.cfg.keywordCase));
        }

        if (def.unique) {
            this.layout.add(WS.SPACE, formatKeyword(String(def.unique).toUpperCase(), this.cfg.keywordCase));
        }

        if (def.primary) {
            this.layout.add(WS.SPACE, formatKeyword(String(def.primary).toUpperCase(), this.cfg.keywordCase));
        }

        if (def.comment) {
            const comment = def.comment as { value: unknown };
            this.layout.add(WS.SPACE, formatKeyword("COMMENT", this.cfg.keywordCase), WS.SPACE);
            this.layout.add("'" + String(comment.value) + "'");
        }
    }

    private formatDataType(def: Record<string, unknown>): string {
        if (typeof def === "string") return formatKeyword(def, this.cfg.dataTypeCase);

        let result = formatKeyword(String(def.dataType || ""), this.cfg.dataTypeCase);

        if (def.length != null) {
            result += "(" + String(def.length);
            if (def.scale != null) {
                result += "," + String(def.scale);
            }
            result += ")";
        }

        if (def.suffix) {
            if (Array.isArray(def.suffix)) {
                if (def.suffix.length > 0) {
                    result += " " + (def.suffix as unknown[]).join(" ");
                }
            } else {
                result += " " + String(def.suffix);
            }
        }

        return result;
    }

    private formatIndexDefinition(def: AstNode): void {
        if (def.keyword) {
            this.layout.add(formatKeyword(String(def.keyword).toUpperCase(), this.cfg.keywordCase), WS.SPACE);
        }
        if (def.index) {
            this.layout.add(String(def.index), WS.SPACE);
        }
        const colStrs = ((def.definition || []) as AstNode[]).map((c: AstNode): string => this.exprFmt.format(c));
        this.layout.add("(" + colStrs.join(", ") + ")");
    }

    private formatConstraintDefinition(def: AstNode): void {
        if (def.keyword === "constraint" && def.constraint) {
            this.layout.add(formatKeyword("CONSTRAINT", this.cfg.keywordCase), WS.SPACE, String(def.constraint), WS.SPACE);
        }
        this.layout.add(formatKeyword(String(def.constraint_type).toUpperCase(), this.cfg.keywordCase));

        if (def.definition) {
            const colStrs = (def.definition as AstNode[]).map((c: AstNode): string => this.exprFmt.format(c));
            this.layout.add(WS.SPACE, "(" + colStrs.join(", ") + ")");
        }
    }

    private formatTableOptions(options: Record<string, unknown>[]): void {
        for (const opt of options) {
            this.layout.add(WS.MANDATORY_NEWLINE, WS.INDENT);
            if (typeof opt === "string") {
                this.layout.add(opt);
            } else if (typeof opt === "object") {
                const entries = Object.entries(opt);
                for (const [key, val] of entries) {
                    this.layout.add(formatKeyword(key.toUpperCase(), this.cfg.keywordCase));
                    if (val !== undefined && val !== null) {
                        this.layout.add(WS.SPACE, "=", WS.SPACE, String(val));
                    }
                }
            }
        }
    }

    private formatAlter(stmt: AstNode): string {
        this.layout.add(formatKeyword("ALTER", this.cfg.keywordCase), WS.SPACE, formatKeyword("TABLE", this.cfg.keywordCase));

        if (stmt.table) {
            const tables = Array.isArray(stmt.table) ? stmt.table : [stmt.table];
            for (const t of tables as AstNode[]) {
                this.layout.add(WS.SPACE, this.formatTableName(t));
            }
        }

        if (stmt.expr) {
            const exprs = Array.isArray(stmt.expr) ? stmt.expr : [stmt.expr];
            for (const expr of exprs as AstNode[]) {
                this.formatAlterExpression(expr);
            }
        }

        return this.layout.toString().trimEnd();
    }

    private formatAlterExpression(expr: AstNode): void {
        if (expr.action) {
            this.layout.add(WS.SPACE, formatKeyword(String(expr.action).toUpperCase(), this.cfg.keywordCase));
        }

        if (expr.keyword) {
            this.layout.add(WS.SPACE, formatKeyword(String(expr.keyword).toUpperCase(), this.cfg.keywordCase));
        }

        if (expr.resource === "column") {
            if (expr.column) {
                this.layout.add(WS.SPACE, this.exprFmt.format(expr.column));
            }
            if (expr.definition) {
                this.layout.add(WS.SPACE, this.formatDataType(expr.definition as Record<string, unknown>));
            }
        } else if (expr.resource === "index") {
            if (expr.index) {
                this.layout.add(WS.SPACE, String(expr.index));
            }
        }
    }

    private formatDrop(stmt: AstNode): string {
        this.layout.add(formatKeyword("DROP", this.cfg.keywordCase));

        if (stmt.keyword) {
            this.layout.add(WS.SPACE, formatKeyword(String(stmt.keyword).toUpperCase(), this.cfg.keywordCase));
        }

        if (stmt.name && Array.isArray(stmt.name)) {
            const nameStrs = (stmt.name as AstNode[]).map((n: AstNode): string => {
                if (typeof n === "object" && n !== null) {
                    if ("table" in n) return this.formatTableName(n);
                    if ("value" in n) return String((n as unknown as { value: unknown }).value);
                    // 任务 3（P5）：未知节点结构原先输出 JSON.stringify(n) 会破坏 SQL 输出，
                    // 改为注释占位符保持输出为合法 SQL。
                    const nodeType = (n as Record<string, unknown>).type;
                    return `/* unsupported: ${String(nodeType || "unknown")} */`;
                }
                return String(n);
            });
            this.layout.add(WS.SPACE, nameStrs.join(", "));
        }

        return this.layout.toString().trimEnd();
    }

    private formatUnknown(stmt: AstNode): string {
        return JSON.stringify(stmt);
    }
}
