import * as vscode from "vscode";
import type { RuleContext } from "./LintRule";
import { BaseRule } from "./BaseRule";
import { getNodeLocation } from "../../parser/astUtils";
import type { AstNode } from "../../parser/astTypes";

export class ImplicitCrossJoinRule extends BaseRule {
    readonly id = "implicit_cross_join";
    readonly applicableTypes = ["select"];
    readonly name = "linter.implicitCrossJoin.name";
    readonly description = "linter.implicitCrossJoin.description";
    readonly category = "best-practices";
    readonly defaultSeverity = vscode.DiagnosticSeverity.Warning;
    readonly defaultEnabled = true;

    check(context: RuleContext): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = [];
        const node = context.node;

        const fromItems = node.from;
        if (!Array.isArray(fromItems)) {
            return diagnostics;
        }

        for (const fromItem of fromItems) {
            if (!fromItem || typeof fromItem !== "object") {
                continue;
            }
            const item = fromItem as AstNode;
            if (item.join == null) {
                continue;
            }

            const joinType = String(item.join).toUpperCase();
            if (joinType === "CROSS JOIN" || joinType === "CROSS") {
                continue;
            }

            if (item.on == null && item.using == null) {
                const loc = getNodeLocation(item);
                if (loc) {
                    diagnostics.push(this.addDiagnostic(loc, String(item.join).length, "linter.implicitCrossJoin.description"));
                }
            }
        }

        return diagnostics;
    }
}
