import * as vscode from "vscode";
import { walkAst, isAstNode } from "../parser/AstVisitor";
import { resolveAstList } from "../parser/astUtils";
import type { AstNode } from "../parser/astTypes";
import type { SqlDialect } from "../parser/dialectMapper";
import { getRuleRegistry, type RuleRegistry } from "../linter/RuleRegistry";
import type { RuleContext } from "../linter/rules/LintRule";

/**
 * Minimal cancellation token shape accepted by the async lint path.
 * `vscode.CancellationToken` satisfies this structurally, so callers can pass
 * either a real VS Code token or a plain object (e.g. in tests).
 */
export interface LintCancellationToken {
    readonly isCancellationRequested: boolean;
}

interface YieldState {
    /** Number of nodes processed since the last yield to the event loop. */
    sinceLastYield: number;
    /** Total nodes processed; used for diagnostics / debugging. */
    total: number;
}

/**
 * Yield to the event loop (via `setImmediate`) once this many AST nodes have
 * had their rules evaluated since the previous yield. This is a hard, node
 * count-based bound (rather than a wall-clock threshold) so that the maximum
 * number of rule evaluations between yields is predictable regardless of how
 * fast or slow the host machine is. With ~36 rules, most of which only apply
 * to a handful of node types, processing 64 nodes is well under a frame on
 * typical hardware, keeping the extension host responsive while linting large
 * SQL files without imposing per-file overhead on small files (small ASTs
 * simply never reach the threshold and complete synchronously inside one
 * `lintAsync` call).
 */
const LINT_YIELD_NODE_INTERVAL = 64;

export class AstLinter {
    private get registry(): RuleRegistry {
        return getRuleRegistry();
    }

    lint(sql: string, dialect: SqlDialect, document?: vscode.TextDocument, preParsedAst?: unknown[]): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = [];
        const globalContext: RuleContext = { sql, dialect, document, node: {} as AstNode };
        diagnostics.push(...this.registry.runGlobalRules(globalContext));
        const astList = resolveAstList(sql, dialect, preParsedAst);

        for (const ast of astList) {
            if (!isAstNode(ast)) {
                continue;
            }
            const node = ast as AstNode;
            this.processStatement(node, sql, dialect, diagnostics, document);
        }

        return diagnostics;
    }

    /**
     * Async variant of {@link lint} that periodically yields to the event loop
     * (via `setImmediate`) while traversing AST nodes, so that linting large
     * SQL files does not block the extension host / main thread.
     *
     * The diagnostic output is identical to {@link lint}; only the scheduling
     * differs. Cancellation is cooperative: when `token.isCancellationRequested`
     * becomes true, traversal stops early and the diagnostics collected so far
     * are returned — callers should check the token before consuming the
     * result, as a cancelled run may be partial.
     *
     * This is the safe fallback for moving lint work off the main thread when a
     * `worker_threads` based implementation is impractical. The lint rules are
     * deeply coupled to the `vscode` API (every rule constructs
     * `vscode.Diagnostic` / `vscode.Range` via `astUtils.createDiagnostic`,
     * the rule registry is config-manager-backed, and some rules call
     * `document.lineAt(...)`). Moving them into a worker would require either
     * shimming the `vscode` API inside the worker and serialising diagnostics
     * across the thread boundary (reconstructing `Diagnostic` instances on the
     * main thread, since `postMessage` strips class prototypes) or refactoring
     * ~40 rule files plus `astUtils`/`RuleRegistry`/`i18n` to remove vscode
     * coupling. Both are large, risky changes that break many existing tests.
     * Yielding on the main thread achieves the goal (no 50–200ms blocking on
     * large files) with a minimal, behaviour-preserving change.
     */
    async lintAsync(
        sql: string,
        dialect: SqlDialect,
        document?: vscode.TextDocument,
        preParsedAst?: unknown[],
        token?: LintCancellationToken,
    ): Promise<vscode.Diagnostic[]> {
        const diagnostics: vscode.Diagnostic[] = [];
        const globalContext: RuleContext = { sql, dialect, document, node: {} as AstNode };
        diagnostics.push(...this.registry.runGlobalRules(globalContext));

        if (token?.isCancellationRequested) {
            return diagnostics;
        }

        const astList = resolveAstList(sql, dialect, preParsedAst);
        const yieldState: YieldState = { sinceLastYield: 0, total: 0 };

        for (const ast of astList) {
            if (!isAstNode(ast)) {
                continue;
            }
            const node = ast as AstNode;
            await this.processStatementAsync(node, sql, dialect, diagnostics, document, token, yieldState);
            if (token?.isCancellationRequested) {
                return diagnostics;
            }
        }

        return diagnostics;
    }

    private processStatement(
        node: AstNode,
        sql: string,
        dialect: SqlDialect,
        diagnostics: vscode.Diagnostic[],
        document?: vscode.TextDocument,
    ): void {
        const context: RuleContext = { sql, dialect, document, node };
        diagnostics.push(...this.registry.runRules(context));
        this.walkForSubStatements(node, sql, dialect, diagnostics, document);
    }

    private async processStatementAsync(
        node: AstNode,
        sql: string,
        dialect: SqlDialect,
        diagnostics: vscode.Diagnostic[],
        document: vscode.TextDocument | undefined,
        token: LintCancellationToken | undefined,
        yieldState: YieldState,
    ): Promise<void> {
        const context: RuleContext = { sql, dialect, document, node };
        diagnostics.push(...this.registry.runRules(context));
        yieldState.sinceLastYield++;
        yieldState.total++;
        await this.maybeYield(yieldState);
        if (token?.isCancellationRequested) {
            return;
        }
        await this.walkForSubStatementsAsync(node, sql, dialect, diagnostics, document, token, yieldState);
    }

    private walkForSubStatements(
        root: AstNode,
        sql: string,
        dialect: SqlDialect,
        diagnostics: vscode.Diagnostic[],
        document?: vscode.TextDocument,
    ): void {
        const reusableContext: RuleContext = { sql, dialect, document, node: root };
        walkAst(root, {
            enter: (child) => {
                if (child !== root && isAstNode(child)) {
                    reusableContext.node = child as AstNode;
                    diagnostics.push(...this.registry.runRules(reusableContext));
                }
            },
        });
    }

    private async walkForSubStatementsAsync(
        root: AstNode,
        sql: string,
        dialect: SqlDialect,
        diagnostics: vscode.Diagnostic[],
        document: vscode.TextDocument | undefined,
        token: LintCancellationToken | undefined,
        yieldState: YieldState,
    ): Promise<void> {
        const reusableContext: RuleContext = { sql, dialect, document, node: root };

        // Collect child nodes in pre-order (the same order in which the sync
        // walker invokes its `enter` callback) and process them in batches
        // with periodic yields. The collection pass is a single cheap walk
        // that only pushes references; the expensive per-node rule checks run
        // in the batched loop below where we can yield.
        const nodes: AstNode[] = [];
        walkAst(root, {
            enter: (child) => {
                if (child !== root && isAstNode(child)) {
                    nodes.push(child as AstNode);
                }
            },
        });

        for (const node of nodes) {
            if (token?.isCancellationRequested) {
                return;
            }
            reusableContext.node = node;
            diagnostics.push(...this.registry.runRules(reusableContext));
            yieldState.sinceLastYield++;
            yieldState.total++;
            await this.maybeYield(yieldState);
        }
    }

    /**
     * Yield to the event loop (via `setImmediate`) once
     * {@link LINT_YIELD_NODE_INTERVAL} nodes have been processed since the
     * previous yield. The counter resets after each yield. Using a fixed node
     * count — rather than a wall-clock threshold — makes the yielding
     * behaviour deterministic across machines of different speed.
     */
    private async maybeYield(yieldState: YieldState): Promise<void> {
        if (yieldState.sinceLastYield < LINT_YIELD_NODE_INTERVAL) {
            return;
        }
        await new Promise<void>((resolve) => setImmediate(resolve));
        yieldState.sinceLastYield = 0;
    }
}
