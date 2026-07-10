import type { FormatOptions } from "../FormatOptions";
import Indentation from "../Indentation";
import Layout, { WS } from "../Layout";
import { formatKeyword } from "./CommonFormatter";
import type { AstNode } from "../../parser/astTypes";

export class CTEFormatter {
    private cfg: FormatOptions;
    private indent: Indentation;
    private layout: Layout;
    private subqueryFormatter: (stmt: unknown) => string;

    constructor(cfg: FormatOptions, indent: Indentation, subqueryFormatter: (stmt: unknown) => string) {
        this.cfg = cfg;
        this.indent = indent;
        this.layout = new Layout(new Indentation(indent.getSingleIndent()));
        this.layout.indentation = indent;
        this.subqueryFormatter = subqueryFormatter;
    }

    public format(withClause: AstNode[]): string {
        if (this.cfg.newlineBeforeWith !== false) {
            this.layout.add(WS.INDENT);
        }

        this.layout.add(formatKeyword("WITH", this.cfg.keywordCase));

        if (this.cfg.newlineAfterWith) {
            this.layout.add(WS.NEWLINE, WS.INDENT);
        } else {
            this.layout.add(WS.SPACE);
        }

        this.indent.increaseTopLevel();

        withClause.forEach((cte: AstNode, i: number): void => {
            if (i > 0) {
                if (this.cfg.cteCommaPosition === "before") {
                    this.layout.add(WS.NEWLINE, WS.INDENT, ",", WS.SPACE);
                } else {
                    this.layout.add(WS.NO_SPACE, ",");
                    if (this.cfg.newlineBetweenCtes) {
                        this.layout.add(WS.NEWLINE, WS.INDENT);
                    } else {
                        this.layout.add(WS.SPACE);
                    }
                }
            }

            this.formatCTE(cte);
        });

        this.indent.decreaseTopLevel();

        return this.layout.toString().trimEnd();
    }

    private formatCTE(cte: AstNode): void {
        const name = cte.name;
        const nameStr =
            typeof name === "object" && name !== null && "value" in (name as Record<string, unknown>)
                ? String((name as { value: unknown }).value)
                : String(name);

        this.layout.add(nameStr);

        if (cte.columns && Array.isArray(cte.columns) && (cte.columns as AstNode[]).length > 0) {
            const colStrs = (cte.columns as AstNode[]).map((c: AstNode): string => {
                if (typeof c === "object" && c !== null && "value" in c) return String((c as unknown as { value: unknown }).value);
                return String(c);
            });
            this.layout.add(" (" + colStrs.join(", ") + ")");
        }

        this.layout.add(WS.SPACE, formatKeyword("AS", this.cfg.keywordCase), WS.SPACE, "(");

        if (this.cfg.indentCteBody !== false) {
            this.indent.increaseBlockLevel();
            this.layout.add(WS.NEWLINE, WS.INDENT);
        } else {
            this.layout.add(WS.SPACE);
        }

        const stmt = cte.stmt as { ast?: unknown } | undefined;
        if (stmt && stmt.ast) {
            this.layout.add(this.subqueryFormatter(stmt.ast));
        }

        if (this.cfg.indentCteBody !== false) {
            this.indent.decreaseBlockLevel();
            this.layout.add(WS.NEWLINE, WS.INDENT);
        } else {
            this.layout.add(WS.SPACE);
        }

        this.layout.add(")");
    }
}
