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
        // CREATE UNIQUE INDEX / CREATE FULLTEXT INDEX: node-sql-parser keeps
        // the modifier in `index_type`, separate from `keyword`.
        if (keyword === "INDEX" && stmt.index_type) {
            this.layout.add(WS.SPACE, formatKeyword(String(stmt.index_type).toUpperCase(), this.cfg.keywordCase));
        }
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
        if (stmt.keyword && String(stmt.keyword).toUpperCase() === "INDEX") {
            this.formatCreateIndexTarget(stmt);
            return;
        }

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

    /**
     * CREATE [UNIQUE] INDEX <index> ON <table> [USING <method>] (<columns>)
     *
     * node-sql-parser stores the index name and the target table in separate
     * fields (`index`, `table`); emitting them in AST property order produced
     * `CREATE INDEX <table> <index> ON (...)`, so the order is explicit here.
     */
    private formatCreateIndexTarget(stmt: AstNode): void {
        if (stmt.index != null) {
            this.layout.add(WS.SPACE, this.formatIndexName(stmt.index));
        }

        this.layout.add(WS.SPACE, formatKeyword(String(stmt.on_kw ?? "ON").toUpperCase(), this.cfg.keywordCase), WS.SPACE);
        const table = stmt.table;
        if (Array.isArray(table)) {
            this.layout.add((table as AstNode[]).map((t: AstNode): string => this.formatTableName(t)).join(", "));
        } else if (table) {
            this.layout.add(this.formatTableName(table as AstNode));
        }

        const using = stmt.index_using as { keyword?: string; type?: string } | null;
        if (using && using.type) {
            this.layout.add(WS.SPACE, formatKeyword(String(using.keyword ?? "USING").toUpperCase(), this.cfg.keywordCase), WS.SPACE);
            this.layout.add(String(using.type));
        }

        if (stmt.index_columns && Array.isArray(stmt.index_columns)) {
            const colStrs = (stmt.index_columns as AstNode[]).map((c: AstNode): string => this.exprFmt.format(c));
            this.layout.add(WS.SPACE, "(" + colStrs.join(", ") + ")");
        }
    }

    private formatIndexName(index: unknown): string {
        if (typeof index === "object" && index !== null) {
            const name = (index as Record<string, unknown>).name;
            return name != null ? String(name) : String(index);
        }
        return String(index);
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
        this.formatColumnAttributes(def);
    }

    /**
     * Renders the column-level clauses shared by CREATE TABLE definitions and
     * ALTER TABLE ADD/MODIFY/CHANGE expressions. Previously the ALTER path
     * only emitted COMMENT, silently dropping NOT NULL and DEFAULT values.
     */
    private formatColumnAttributes(node: AstNode): void {
        if (node.nullable) {
            const nullable = node.nullable as { type: string };
            if (nullable.type === "not null") {
                this.layout.add(WS.SPACE, formatKeyword("NOT NULL", this.cfg.keywordCase));
            } else {
                this.layout.add(WS.SPACE, formatKeyword("NULL", this.cfg.keywordCase));
            }
        }

        if (node.default_val) {
            const defaultVal = node.default_val as { type?: string; value?: unknown };
            if (defaultVal.type === "set default") {
                this.layout.add(WS.SPACE, formatKeyword("SET DEFAULT", this.cfg.keywordCase), WS.SPACE);
                this.layout.add(this.exprFmt.format(defaultVal.value));
            } else if (defaultVal.type === "drop default") {
                this.layout.add(WS.SPACE, formatKeyword("DROP DEFAULT", this.cfg.keywordCase));
            } else {
                this.layout.add(WS.SPACE, formatKeyword("DEFAULT", this.cfg.keywordCase), WS.SPACE);
                this.layout.add(this.exprFmt.format(defaultVal.value));
            }
        }

        if (node.auto_increment) {
            this.layout.add(WS.SPACE, formatKeyword("AUTO_INCREMENT", this.cfg.keywordCase));
        }

        if (node.unique) {
            this.layout.add(WS.SPACE, formatKeyword(String(node.unique).toUpperCase(), this.cfg.keywordCase));
        }

        // PostgreSQL stores inline PRIMARY KEY on `primary_key`; MySQL uses
        // `primary`. Emitting both when present is harmless.
        if (node.primary) {
            this.layout.add(WS.SPACE, formatKeyword(String(node.primary).toUpperCase(), this.cfg.keywordCase));
        }
        if (node.primary_key) {
            this.layout.add(WS.SPACE, formatKeyword(String(node.primary_key).toUpperCase(), this.cfg.keywordCase));
        }

        if (node.comment) {
            this.layout.add(WS.SPACE, formatKeyword("COMMENT", this.cfg.keywordCase), WS.SPACE);
            this.layout.add(this.formatCommentValue(node.comment));
        }
    }

    /**
     * Formats the value of a DDL COMMENT clause.
     *
     * node-sql-parser wraps the comment text in `{ type: "comment", value: {...} }`
     * where the inner value is itself a literal node such as
     * `{ type: "single_quote_string", value: "hello" }`. Stringifying that
     * object directly yields "[object Object]", so unwrap the wrapper and let
     * ExpressionFormatter render the literal (including its quotes).
     */
    private formatCommentValue(comment: unknown): string {
        if (comment == null) return "";
        if (typeof comment === "string") return comment;
        if (typeof comment !== "object") return String(comment);

        const node = comment as Record<string, unknown>;
        if (node.type === "comment") {
            return this.formatCommentValue(node.value);
        }
        if (typeof node.type === "string") {
            return this.exprFmt.format(node);
        }
        if ("value" in node) {
            return this.formatCommentValue(node.value);
        }
        return String(comment);
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

        // ALTER TABLE ... ADD UNIQUE INDEX <name> (...)
        if (def.index) {
            this.layout.add(WS.SPACE, this.formatIndexName(def.index));
        }

        if (def.definition) {
            const colStrs = (def.definition as AstNode[]).map((c: AstNode): string => this.exprFmt.format(c));
            this.layout.add(WS.SPACE, "(" + colStrs.join(", ") + ")");
        }

        this.formatReferenceDefinition(def.reference_definition as AstNode | null | undefined);
    }

    private formatReferenceDefinition(ref: AstNode | null | undefined): void {
        if (!ref) return;

        this.layout.add(WS.SPACE, formatKeyword(String(ref.keyword ?? "REFERENCES").toUpperCase(), this.cfg.keywordCase), WS.SPACE);
        const tables = Array.isArray(ref.table) ? (ref.table as AstNode[]) : ref.table ? [ref.table as AstNode] : [];
        this.layout.add(tables.map((t: AstNode): string => this.formatTableName(t)).join(", "));

        if (ref.definition && Array.isArray(ref.definition)) {
            const colStrs = (ref.definition as AstNode[]).map((c: AstNode): string => this.exprFmt.format(c));
            this.layout.add(WS.SPACE, "(" + colStrs.join(", ") + ")");
        }

        if (ref.match) {
            const match = typeof ref.match === "string" ? ref.match : (ref.match as AstNode).value;
            if (match != null) {
                this.layout.add(WS.SPACE, formatKeyword("MATCH", this.cfg.keywordCase), WS.SPACE, String(match).toUpperCase());
            }
        }

        if (Array.isArray(ref.on_action)) {
            for (const action of ref.on_action as AstNode[]) {
                const value = action.value as { value?: unknown } | undefined;
                this.layout.add(
                    WS.SPACE,
                    formatKeyword(String(action.type).toUpperCase(), this.cfg.keywordCase),
                    WS.SPACE,
                    String(value?.value ?? value ?? "").toUpperCase(),
                );
            }
        }
    }

    private formatTableOptions(options: Record<string, unknown>[]): void {
        for (const opt of options) {
            const text = this.formatTableOption(opt);
            if (!text) continue;
            this.layout.add(WS.MANDATORY_NEWLINE, WS.INDENT, text);
        }
    }

    /**
     * Formats a single table option.
     *
     * node-sql-parser represents most options as `{ keyword, symbol, value }`
     * (e.g. `COMMENT = 'x'`, `ENGINE = InnoDB`), and BigQuery nests the inner
     * options in an array under `value`. Iterating the raw object entries would
     * print the object keys (`keyword`, `symbol`, ...) and stringify the nested
     * value objects, which produced output like
     * "KEYWORD = commentSYMBOLVALUE = 'x'".
     */
    private formatTableOption(opt: Record<string, unknown> | string): string {
        if (typeof opt === "string") return opt;
        if (opt == null || typeof opt !== "object") return String(opt);

        if (opt.keyword != null) {
            const keyword = formatKeyword(String(opt.keyword).toUpperCase(), this.cfg.keywordCase);
            const value = opt.value;
            if (opt.parentheses) {
                return keyword + "(" + this.formatTableOptionValue(value) + ")";
            }
            if (opt.symbol != null) {
                return keyword + " " + String(opt.symbol) + " " + this.formatTableOptionValue(value);
            }
            if (value == null) return keyword;
            return keyword + " " + this.formatTableOptionValue(value);
        }

        return Object.entries(opt)
            .map(([key, val]) => {
                let text = formatKeyword(key.toUpperCase(), this.cfg.keywordCase);
                if (val != null) {
                    text += " = " + this.formatTableOptionValue(val);
                }
                return text;
            })
            .join(" ");
    }

    private formatTableOptionValue(value: unknown): string {
        if (value == null) return "";
        if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
            return String(value);
        }
        if (Array.isArray(value)) {
            return value
                .map((item) =>
                    item !== null && typeof item === "object" ? this.formatTableOption(item as Record<string, unknown>) : String(item),
                )
                .join(", ");
        }
        if (typeof value === "object") {
            const node = value as Record<string, unknown>;
            // `DEFAULT CHARSET = utf8mb4` parses to `{ type: "default", value: "utf8mb4" }`;
            // the value is the charset, not the DEFAULT keyword itself.
            if (node.type === "default" && "value" in node) {
                return this.formatTableOptionValue(node.value);
            }
            if (node.type === "comment") {
                return this.formatCommentValue(node);
            }
            if (typeof node.type === "string") {
                return this.exprFmt.format(node);
            }
            if ("value" in node) {
                return this.formatTableOptionValue(node.value);
            }
        }
        return String(value);
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

        // ADD UNIQUE INDEX / ADD FULLTEXT INDEX: the modifier precedes INDEX.
        if (expr.resource === "index" && expr.index_type) {
            this.layout.add(WS.SPACE, formatKeyword(String(expr.index_type).toUpperCase(), this.cfg.keywordCase));
        }

        if (expr.keyword) {
            this.layout.add(WS.SPACE, formatKeyword(String(expr.keyword).toUpperCase(), this.cfg.keywordCase));
        }

        if (expr.resource === "column") {
            // CHANGE COLUMN <old> <new> / RENAME COLUMN <old> TO <new>
            if (expr.old_column) {
                this.layout.add(WS.SPACE, this.exprFmt.format(expr.old_column));
            }
            if (expr.prefix) {
                this.layout.add(WS.SPACE, formatKeyword(String(expr.prefix).toUpperCase(), this.cfg.keywordCase));
            }
            if (expr.column) {
                this.layout.add(WS.SPACE, this.exprFmt.format(expr.column));
            }
            if (expr.definition) {
                this.layout.add(WS.SPACE, this.formatDataType(expr.definition as Record<string, unknown>));
            }
            this.formatColumnAttributes(expr);
        } else if (expr.resource === "index") {
            if (expr.index) {
                this.layout.add(WS.SPACE, this.formatIndexName(expr.index));
            }
            if (expr.definition && Array.isArray(expr.definition)) {
                const colStrs = (expr.definition as AstNode[]).map((c: AstNode): string => this.exprFmt.format(c));
                this.layout.add(WS.SPACE, "(" + colStrs.join(", ") + ")");
            }
        } else if (expr.resource === "constraint") {
            // ALTER TABLE ... ADD {UNIQUE INDEX|UNIQUE KEY|PRIMARY KEY|FOREIGN KEY} ...
            const constraintDef = expr.create_definitions as AstNode | undefined;
            if (constraintDef) {
                this.layout.add(WS.SPACE);
                this.formatConstraintDefinition(constraintDef);
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
