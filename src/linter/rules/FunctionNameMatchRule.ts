import * as vscode from "vscode";
import type { RuleContext } from "./LintRule";
import { BaseRule } from "./BaseRule";
import { findNodesOfType, findNodes, isAstNode } from "../../parser/AstVisitor";
import { getNodeLocation, getFunctionName } from "../../parser/astUtils";
import type { AstNode } from "../../parser/astTypes";

/**
 * Abstract base for lint rules that flag function calls by name.
 *
 * Concrete subclasses declare only:
 *  - {@link functionNameSet}: lower-cased function names to flag
 *  - {@link messageKey}: i18n key for the diagnostic message
 *  - {@link useStrictOfType}: when true, uses `findNodesOfType('function')`
 *    (matches only nodes whose `type` field is exactly `'function'`); when
 *    false, uses `findNodes` with a predicate (matches structurally).
 *
 * This eliminates the duplicated "find function nodes → for each → check
 * name in set → addDiagnostic" pattern that was copy-pasted across three
 * rules (UseCoalesceOverIsNull, UseCurrentTimestamp, DateFunctionUsage).
 */
export abstract class FunctionNameMatchRule extends BaseRule {
    /** Lower-cased function names this rule flags. */
    protected abstract readonly functionNameSet: Set<string>;
    /** i18n key (and optional args) used to build the diagnostic message. */
    protected abstract readonly messageKey: string;
    /**
     * If true, use the strict `findNodesOfType` walker; otherwise use the
     * predicate-based `findNodes` walker. The two walkers have historically
     * been used interchangeably; preserving the choice avoids behaviour
     * changes during refactor.
     */
    protected readonly useStrictOfType: boolean = true;

    protected buildMessageArgs(_name: string): string[] {
        return [];
    }

    check(context: RuleContext): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = [];
        const funcNodes = this.useStrictOfType
            ? findNodesOfType<AstNode>(context.node, "function")
            : findNodes(context.node, (n): n is AstNode => isAstNode(n) && (n as AstNode).type === "function");

        for (const func of funcNodes) {
            const name = getFunctionName(func);
            if (name && this.functionNameSet.has(name.toLowerCase())) {
                const loc = getNodeLocation(func);
                if (loc) {
                    diagnostics.push(this.addDiagnostic(loc, name.length, this.messageKey, ...this.buildMessageArgs(name)));
                }
            }
        }
        return diagnostics;
    }
}
