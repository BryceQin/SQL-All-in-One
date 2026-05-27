import * as vscode from 'vscode'
import { getDocumentAstCache } from '../parser/DocumentAstCache'
import { toSqlDialect } from '../core/sqlDialects'
import { isAstNode, walkAst } from '../parser/AstVisitor'
import { getNodeLocation, getStatementEndLocation } from '../parser/astUtils'
import type { AstNode } from '../parser/astTypes'

export class SqlFoldingRangeProvider implements vscode.FoldingRangeProvider {
    provideFoldingRanges(
        document: vscode.TextDocument,
        _context: vscode.FoldingContext,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.FoldingRange[]> {
        try {
            const dialect = toSqlDialect(document.languageId)
            const result = getDocumentAstCache().getOrParse(document, dialect)
            if (token.isCancellationRequested) return []
            if (result.success && result.ast) {
                return this.provideFoldingRangesFromAst(result.ast)
            }
            return []
        } catch {
            return []
        }
    }

    private provideFoldingRangesFromAst(ast: unknown): vscode.FoldingRange[] {
        const ranges: vscode.FoldingRange[] = []
        const seen = new Set<string>()

        const addRange = (range: vscode.FoldingRange | null) => {
            if (range && !seen.has(`${range.start}-${range.end}`)) {
                seen.add(`${range.start}-${range.end}`)
                ranges.push(range)
            }
        }

        // 处理 AST 可能是数组或单个节点
        const astArray = Array.isArray(ast) ? ast : [ast]

        for (const stmt of astArray) {
            if (!isAstNode(stmt)) continue

            // CREATE 语句
            if (stmt.type === 'create') {
                addRange(this.createFoldingRangeFromNode(stmt as AstNode))
            }

            // INSERT 语句
            if (stmt.type === 'insert') {
                addRange(this.createFoldingRangeFromNode(stmt as AstNode))
            }

            // SELECT 语句（包括主查询和子查询）
            if (stmt.type === 'select') {
                addRange(this.createFoldingRangeFromNode(stmt as AstNode))

                // WITH/CTE 子句
                if ((stmt as AstNode).with != null) {
                    const withClause = (stmt as AstNode).with
                    if (Array.isArray(withClause) && withClause.length > 0) {
                        // WITH 子句的范围：从第一个 CTE 到 SELECT 之前
                        const firstCte = withClause[0] as unknown
                        if (isAstNode(firstCte)) {
                            const withStartLoc = getNodeLocation(firstCte as AstNode)
                            // WITH 关键字可能在 CTE 节点之前，尝试找到 WITH 的起始位置
                            if (withStartLoc) {
                                const selectStartLoc = getNodeLocation(stmt as AstNode)
                                const withEndLine = selectStartLoc ? selectStartLoc.line : withStartLoc.line
                                if (withStartLoc.line < withEndLine) {
                                    addRange(new vscode.FoldingRange(
                                        withStartLoc.line - 1,
                                        withEndLine - 1,
                                        vscode.FoldingRangeKind.Region
                                    ))
                                }
                            }
                        }
                    }
                }
            }

            // 递归遍历子节点，查找 CASE 表达式和嵌套子查询
            walkAst(stmt, {
                enter: (node) => {
                    if (!isAstNode(node)) return

                    const astNode = node as AstNode

                    // CASE 表达式
                    if (astNode.type === 'case') {
                        addRange(this.createFoldingRangeFromNode(astNode))
                    }

                    // 嵌套子查询（SELECT 节点中的子 SELECT）
                    if (astNode.type === 'select' && astNode !== stmt) {
                        addRange(this.createFoldingRangeFromNode(astNode))
                    }
                },
            })
        }

        // 按起始行排序
        ranges.sort((a, b) => a.start - b.start)

        return ranges
    }

    private createFoldingRangeFromNode(node: AstNode): vscode.FoldingRange | null {
        const startLoc = getNodeLocation(node)
        const endLoc = getStatementEndLocation(node)
        if (!startLoc || !endLoc) return null
        if (startLoc.line === endLoc.line) return null // 单行，不需要折叠
        return new vscode.FoldingRange(startLoc.line - 1, endLoc.line - 1, vscode.FoldingRangeKind.Region)
    }

}
