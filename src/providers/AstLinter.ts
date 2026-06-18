import * as vscode from 'vscode'
import { walkAst, isAstNode } from '../parser/AstVisitor'
import { resolveAstList } from '../parser/astUtils'
import type { AstNode } from '../parser/astTypes'
import type { SqlDialect } from '../parser/dialectMapper'
import { getRuleRegistry, type RuleRegistry } from '../linter/RuleRegistry'
import type { RuleContext } from '../linter/rules/LintRule'

export class AstLinter {
    private get registry(): RuleRegistry {
        return getRuleRegistry();
    }

    lint(sql: string, dialect: SqlDialect, document?: vscode.TextDocument, preParsedAst?: unknown[]): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = []
        const globalContext: RuleContext = { sql, dialect, document, node: {} as AstNode }
        diagnostics.push(...this.registry.runGlobalRules(globalContext))
        const astList = resolveAstList(sql, dialect, preParsedAst)

        for (const ast of astList) {
            if (!isAstNode(ast)) {
                continue
            }
            const node = ast as AstNode
            this.processStatement(node, sql, dialect, diagnostics, document)
        }

        return diagnostics
    }

    private processStatement(node: AstNode, sql: string, dialect: SqlDialect, diagnostics: vscode.Diagnostic[], document?: vscode.TextDocument): void {
        const context: RuleContext = { sql, dialect, document, node }
        diagnostics.push(...this.registry.runRules(context))
        this.walkForSubStatements(node, sql, dialect, diagnostics, document)
    }

    private walkForSubStatements(root: AstNode, sql: string, dialect: SqlDialect, diagnostics: vscode.Diagnostic[], document?: vscode.TextDocument): void {
        const reusableContext: RuleContext = { sql, dialect, document, node: root }
        walkAst(root, {
            enter: (child) => {
                if (child !== root && isAstNode(child)) {
                    reusableContext.node = child as AstNode
                    diagnostics.push(...this.registry.runRules(reusableContext))
                }
            },
        })
    }
}
