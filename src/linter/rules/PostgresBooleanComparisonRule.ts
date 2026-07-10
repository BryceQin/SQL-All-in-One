import * as vscode from "vscode";
import type { RuleContext } from "./LintRule";
import { BaseRule } from "./BaseRule";
import { getNodeLocation } from "../../parser/astUtils";
import { findNodesOfType } from "../../parser/AstVisitor";
import type { AstNode } from "../../parser/astTypes";

export class PostgresBooleanComparisonRule extends BaseRule {
    readonly id = "postgres_boolean_comparison";
    readonly applicableTypes = ["select", "update", "delete"];
    readonly name = "linter.postgresBooleanComparison.name";
    readonly description = "linter.postgresBooleanComparison.description";
    readonly category = "dialect-specific";
    readonly defaultSeverity = vscode.DiagnosticSeverity.Hint;
    readonly defaultEnabled = true;

    check(context: RuleContext): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = [];

        if (context.dialect !== "postgresql") {
            return diagnostics;
        }

        const node = context.node;
        const binaryExprs = findNodesOfType<AstNode>(node, "binary_expr");
        for (const expr of binaryExprs) {
            const operator = String(expr.operator ?? "").toUpperCase();
            if (operator !== "=" && operator !== "!=") {
                continue;
            }

            const right = expr.right;
            const left = expr.left;
            const booleanLiteral = this.findBooleanLiteral(right) ?? this.findBooleanLiteral(left);
            if (booleanLiteral) {
                const loc = getNodeLocation(expr);
                if (loc) {
                    diagnostics.push(this.addDiagnostic(loc, 1, "linter.postgresBooleanComparison.description"));
                }
            }
        }

        return diagnostics;
    }

    private findBooleanLiteral(node: unknown): boolean {
        if (!node || typeof node !== "object") {
            return false;
        }
        const obj = node as Record<string, unknown>;
        if (obj.type === "bool" || obj.type === "boolean") {
            return true;
        }
        if (obj.type === "literal" || obj.type === "single_quote_string") {
            const value = String(obj.value ?? "").toLowerCase();
            if (value === "true" || value === "false") {
                return true;
            }
        }
        return false;
    }
}
