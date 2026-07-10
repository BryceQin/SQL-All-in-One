import * as vscode from "vscode";
import { BaseRule } from "./BaseRule";
import type { RuleContext } from "./LintRule";
import { isAstNode } from "../../parser/AstVisitor";
import { getNodeLocation } from "../../parser/astUtils";
import type { AstNode } from "../../parser/astTypes";

export class ConsistentAliasingRule extends BaseRule {
    readonly id = "consistent_aliasing";
    readonly applicableTypes = ["select"];
    readonly name = "linter.consistentAliasing.name";
    readonly description = "linter.consistentAliasing.description";
    readonly category = "code-style";
    readonly defaultSeverity = vscode.DiagnosticSeverity.Information;
    readonly defaultEnabled = false;

    check(context: RuleContext): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = [];
        const node = context.node;

        const aliasMap = this.collectTableAliases(node);
        if (aliasMap.size === 0) {
            return diagnostics;
        }

        this.checkColumnRefs(node, aliasMap, diagnostics);

        return diagnostics;
    }

    private collectTableAliases(node: AstNode): Map<string, string> {
        const aliasMap = new Map<string, string>();
        const from = node.from;
        if (!Array.isArray(from)) {
            return aliasMap;
        }

        for (const entry of from) {
            if (!isAstNode(entry)) {
                continue;
            }
            const fromEntry = entry as AstNode;
            const as = fromEntry.as;
            const tableName = this.resolveName(fromEntry.table);
            if (typeof as === "string" && as.length > 0 && tableName) {
                aliasMap.set(tableName.toLowerCase(), as);
            }
        }

        return aliasMap;
    }

    private checkColumnRefs(node: AstNode, aliasMap: Map<string, string>, diagnostics: vscode.Diagnostic[]): void {
        const columns = node.columns;
        if (!Array.isArray(columns)) {
            return;
        }

        for (const col of columns) {
            if (!isAstNode(col)) {
                continue;
            }
            const colNode = col as AstNode;
            if (colNode.type === "column_ref") {
                this.checkSingleColumnRef(colNode, aliasMap, diagnostics);
            }
            const expr = colNode.expr;
            if (isAstNode(expr)) {
                this.walkForColumnRefs(expr as AstNode, aliasMap, diagnostics);
            }
        }

        const where = node.where;
        if (isAstNode(where)) {
            this.walkForColumnRefs(where as AstNode, aliasMap, diagnostics);
        }
    }

    private walkForColumnRefs(node: AstNode, aliasMap: Map<string, string>, diagnostics: vscode.Diagnostic[]): void {
        if (node.type === "column_ref") {
            this.checkSingleColumnRef(node, aliasMap, diagnostics);
        }
        for (const value of Object.values(node)) {
            if (isAstNode(value)) {
                this.walkForColumnRefs(value as AstNode, aliasMap, diagnostics);
            } else if (Array.isArray(value)) {
                for (const item of value) {
                    if (isAstNode(item)) {
                        this.walkForColumnRefs(item as AstNode, aliasMap, diagnostics);
                    }
                }
            }
        }
    }

    private checkSingleColumnRef(colRef: AstNode, aliasMap: Map<string, string>, diagnostics: vscode.Diagnostic[]): void {
        const tableRef = this.resolveName(colRef.table);
        if (!tableRef) {
            return;
        }
        const alias = aliasMap.get(tableRef.toLowerCase());
        if (alias && tableRef.toLowerCase() !== alias.toLowerCase()) {
            const loc = getNodeLocation(colRef);
            if (loc) {
                diagnostics.push(this.addDiagnostic(loc, tableRef.length, "linter.consistentAliasing.description", tableRef, alias));
            }
        }
    }

    private resolveName(name: unknown): string | null {
        if (typeof name === "string" && name.length > 0) {
            return name;
        }
        if (name != null && typeof name === "object") {
            const nameObj = name as Record<string, unknown>;
            if (typeof nameObj.value === "string" && nameObj.value.length > 0) {
                return nameObj.value;
            }
        }
        return null;
    }
}
