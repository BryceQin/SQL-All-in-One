import * as vscode from "vscode";
import type { RuleContext } from "./LintRule";
import { BaseRule } from "./BaseRule";
import { getNodeLocation, getFunctionName } from "../../parser/astUtils";
import { findNodesOfType } from "../../parser/AstVisitor";
import type { AstNode } from "../../parser/astTypes";

const DEPRECATED_FUNCTIONS: Record<string, string> = {
    length: "linter.deprecatedFunction.length",
    greatest: "linter.deprecatedFunction.greatest",
    least: "linter.deprecatedFunction.least",
};

export class DeprecatedFunctionRule extends BaseRule {
    readonly id = "deprecated_function";
    readonly applicableTypes = ["select", "insert", "update", "delete"];
    readonly name = "linter.deprecatedFunction.name";
    readonly description = "linter.deprecatedFunction.description";
    readonly category = "best-practices";
    readonly defaultSeverity = vscode.DiagnosticSeverity.Information;
    readonly defaultEnabled = true;

    check(context: RuleContext): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = [];
        const node = context.node;

        const functionNodes = findNodesOfType<AstNode>(node, "function");
        for (const funcNode of functionNodes) {
            const name = getFunctionName(funcNode);
            if (!name) {
                continue;
            }

            const lowerName = name.toLowerCase();
            const messageKey = DEPRECATED_FUNCTIONS[lowerName];
            if (messageKey) {
                const loc = getNodeLocation(funcNode);
                if (loc) {
                    diagnostics.push(this.addDiagnostic(loc, name.length, messageKey));
                }
            }
        }

        return diagnostics;
    }
}
