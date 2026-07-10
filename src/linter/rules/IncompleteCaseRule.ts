import * as vscode from "vscode";
import type { RuleContext } from "./LintRule";
import { BaseRule } from "./BaseRule";
import { isAstNode, findNodes } from "../../parser/AstVisitor";
import { getNodeLocation } from "../../parser/astUtils";
import type { AstNode } from "../../parser/astTypes";

export class IncompleteCaseRule extends BaseRule {
    readonly id = "incomplete_case";
    readonly applicableTypes = ["select"];
    readonly name = "linter.incompleteCase.name";
    readonly description = "linter.incompleteCase.description";
    readonly category = "error-check";
    readonly defaultSeverity = vscode.DiagnosticSeverity.Error;
    readonly defaultEnabled = true;

    check(context: RuleContext): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = [];
        const node = context.node;

        const caseNodes = findNodes(node, (n): n is AstNode => {
            return isAstNode(n) && (n as AstNode).type === "case";
        });

        for (const caseNode of caseNodes) {
            const when = caseNode.when;
            if (when == null || (Array.isArray(when) && when.length === 0)) {
                const loc = getNodeLocation(caseNode);
                if (loc) {
                    diagnostics.push(this.addDiagnostic(loc, 4, "enhanced.caseMissingEnd", String(loc.line)));
                }
            }
        }

        return diagnostics;
    }
}
