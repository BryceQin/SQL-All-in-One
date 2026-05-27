import * as vscode from 'vscode'
import type { RuleContext } from './LintRule'
import { BaseRule } from './BaseRule'
import { walkAst, isAstNode } from '../../parser/AstVisitor'
import { getNodeLocation, getStatementEndLocation } from '../../parser/astUtils'
import type { AstNode } from '../../parser/astTypes'
import { getConfigManager } from '../../core/configManager'

export class MissingQueryCommentRule extends BaseRule {
    readonly id = 'missing_query_comment'
    readonly applicableTypes = ['select']
    readonly name = 'Missing Query Comment'
    readonly description = 'linter.complexQueryComment.description'
    readonly category = 'best-practices'
    readonly defaultSeverity = vscode.DiagnosticSeverity.Warning
    readonly defaultEnabled = true

    check(context: RuleContext): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = []
        const { node, document } = context

        if (!document) {
            return diagnostics
        }

        const cfgMgr = getConfigManager()
        const thresholdLines = cfgMgr.get<number>('lint.missing_query_comment_threshold_line_count', 20)
        const thresholdJoins = cfgMgr.get<number>('lint.missing_query_comment_threshold_join_count', 3)
        const thresholdSubqueries = cfgMgr.get<number>('lint.missing_query_comment_threshold_subquery_count', 2)

        const loc = getNodeLocation(node)
        if (!loc) {
            return diagnostics
        }

        const selectStartLine = loc.line - 1

        const from = node.from
        const joinCount = Array.isArray(from)
            ? from.filter((e): e is AstNode => isAstNode(e) && typeof (e as AstNode).join === 'string').length
            : 0

        let subqueryCount = 0
        walkAst(node, {
            enter(child) {
                if (isAstNode(child) && child !== node) {
                    const childNode = child as AstNode
                    if (childNode.type === 'select') {
                        subqueryCount++
                    }
                }
            },
        })

        const endLoc = getStatementEndLocation(node)
        const statementEndLine = endLoc ? endLoc.line - 1 : selectStartLine
        const lineCount = statementEndLine - selectStartLine + 1

        const isComplex = lineCount >= thresholdLines || joinCount >= thresholdJoins || subqueryCount >= thresholdSubqueries
        if (!isComplex) {
            return diagnostics
        }

        const hasCommentAbove = this.hasCommentAboveLine(document, selectStartLine)
        if (hasCommentAbove) {
            return diagnostics
        }

        const details: string[] = []
        if (lineCount >= thresholdLines) details.push(`${lineCount}行`)
        if (joinCount >= thresholdJoins) details.push(`${joinCount}个JOIN`)
        if (subqueryCount >= thresholdSubqueries) details.push(`${subqueryCount}个子查询`)

        diagnostics.push(this.addDiagnostic(loc, 6, 'linter.complexQueryComment.description', details.join('/')))
        return diagnostics
    }

    private hasCommentAboveLine(document: vscode.TextDocument, line: number): boolean {
        for (let i = Math.max(0, line - 3); i < line; i++) {
            const lineText = document.lineAt(i).text.trim()
            if (lineText.startsWith('--') || lineText.startsWith('/*')) {
                return true
            }
        }
        return false
    }
}
