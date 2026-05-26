import * as vscode from 'vscode'
import { walkAst, isAstNode } from '../parser/AstVisitor'
import { resolveAstList } from '../parser/astUtils'
import type { AstNode } from '../parser/astTypes'
import type { SqlDialect } from '../parser/dialectMapper'
import { createRuleRegistry } from '../linter/RuleRegistry'
import type { RuleContext } from '../linter/rules/LintRule'

export class AstLinter {
    private registry = createRuleRegistry()

    lint(sql: string, dialect: SqlDialect, document?: vscode.TextDocument, preParsedAst?: unknown[]): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = []
        const astList = resolveAstList(sql, dialect, preParsedAst)

        for (const ast of astList) {
            if (!isAstNode(ast)) {
                continue
            }
            const node = ast as AstNode
            this.processStatement(node, sql, dialect, diagnostics, document)
        }

        const globalContext: RuleContext = { sql, dialect, document, node: {} as AstNode }
        diagnostics.push(...this.registry.runGlobalRules(globalContext))

        return diagnostics
    }

    private processStatement(node: AstNode, sql: string, dialect: SqlDialect, diagnostics: vscode.Diagnostic[], document?: vscode.TextDocument): void {
        if (node.type === 'select') {
            this.processSelectChain(node, sql, dialect, diagnostics, document)
        } else {
            const context: RuleContext = { sql, dialect, document, node }
            diagnostics.push(...this.registry.runRules(context))
            this.walkForSubStatements(node, sql, dialect, diagnostics, document)
        }
    }

    private processSelectChain(node: AstNode, sql: string, dialect: SqlDialect, diagnostics: vscode.Diagnostic[], document?: vscode.TextDocument): void {
        const context: RuleContext = { sql, dialect, document, node }
        diagnostics.push(...this.registry.runRules(context))
        this.walkForSubStatements(node, sql, dialect, diagnostics, document)

        if (isAstNode(node._next)) {
            const next = node._next as AstNode
            if (next.type === 'select') {
                this.processSelectChain(next, sql, dialect, diagnostics, document)
            }
        }
    }

    private walkForSubStatements(root: AstNode, sql: string, dialect: SqlDialect, diagnostics: vscode.Diagnostic[], document?: vscode.TextDocument): void {
        walkAst(root, {
            enter: (child) => {
                if (child !== root && isAstNode(child)) {
                    const childNode = child as AstNode
                    const childContext: RuleContext = { sql, dialect, document, node: childNode }
                    diagnostics.push(...this.registry.runRules(childContext))
                }
            },
        })
    }
}
