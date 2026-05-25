import * as vscode from 'vscode'
import { walkAst, isAstNode } from '../parser/AstVisitor'
import { lineColFromIndex } from '../lexer/lineColFromIndex'
import { t } from '../i18n'
import type { AstNode } from '../parser/astTypes'
import { getNodeLocation, createDiagnostic, resolveAstList } from '../parser/astUtils'
import type { SqlDialect } from '../parser/dialectMapper'

export class AstDiagnosticsProvider {
    check(sql: string, dialect: SqlDialect, preParsedAst?: unknown[]): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = []
        const astList = resolveAstList(sql, dialect, preParsedAst)

        for (const ast of astList) {
            if (!isAstNode(ast)) {
                continue
            }
            const node = ast as AstNode
            if (node.type === 'select') {
                this.checkSelectChain(node, sql, diagnostics)
            }
        }

        this.checkExtraCommasInText(sql, diagnostics)

        return diagnostics
    }

    private checkSelectChain(node: AstNode, sql: string, diagnostics: vscode.Diagnostic[]): void {
        this.checkSelectNode(node, sql, diagnostics)

        if (isAstNode(node._next)) {
            const next = node._next as AstNode
            if (next.type === 'select') {
                this.checkSelectChain(next, sql, diagnostics)
            }
        }
    }

    private checkSelectNode(node: AstNode, sql: string, diagnostics: vscode.Diagnostic[]): void {
        this.checkCommaFrom(node, sql, diagnostics)
        this.checkSelectNoColumns(node, sql, diagnostics)
        this.checkFromNoTable(node, sql, diagnostics)
        this.checkOrderByNoColumn(node, sql, diagnostics)
        this.checkWhereNoCondition(node, sql, diagnostics)
        this.checkGroupByNoColumn(node, sql, diagnostics)

        this.walkForSubSelects(node, sql, diagnostics)
    }

    private walkForSubSelects(root: AstNode, sql: string, diagnostics: vscode.Diagnostic[]): void {
        walkAst(root, {
            enter: (child) => {
                if (child !== root && isAstNode(child) && (child as AstNode).type === 'select') {
                    const selectChild = child as AstNode
                    this.checkSelectNode(selectChild, sql, diagnostics)
                    this.walkForSubSelects(selectChild, sql, diagnostics)
                }
            },
        })
    }

    private checkCommaFrom(node: AstNode, sql: string, diagnostics: vscode.Diagnostic[]): void {
        const columns = node.columns
        if (!Array.isArray(columns) || columns.length === 0) {
            return
        }

        const from = node.from
        if (!from) {
            return
        }

        for (const col of columns) {
            if (isAstNode(col) && (col as AstNode).type === 'column_ref') {
                const colRef = col as AstNode
                if (colRef.column === '*' && !colRef.table) {
                    const loc = getNodeLocation(colRef)
                    if (loc) {
                        diagnostics.push(
                            createDiagnostic(
                                loc,
                                1,
                                'COMMA_FROM',
                                t('diagnostic.missingColumnAfterComma', String(loc.line)),
                                vscode.DiagnosticSeverity.Error,
                            ),
                        )
                    }
                }
            }
        }
    }

    private checkSelectNoColumns(node: AstNode, sql: string, diagnostics: vscode.Diagnostic[]): void {
        const columns = node.columns
        if (columns === null || columns === undefined) {
            const loc = getNodeLocation(node)
            if (loc) {
                diagnostics.push(
                    createDiagnostic(
                        loc,
                        6,
                        'SELECT_NO_COLUMNS',
                        t('diagnostic.missingColumnAfterSelect', String(loc.line)),
                        vscode.DiagnosticSeverity.Error,
                    ),
                )
            }
            return
        }

        if (Array.isArray(columns) && columns.length === 0) {
            const loc = getNodeLocation(node)
            if (loc) {
                diagnostics.push(
                    createDiagnostic(
                        loc,
                        6,
                        'SELECT_NO_COLUMNS',
                        t('diagnostic.missingColumnAfterSelect', String(loc.line)),
                        vscode.DiagnosticSeverity.Error,
                    ),
                )
            }
        }
    }

    private checkFromNoTable(node: AstNode, sql: string, diagnostics: vscode.Diagnostic[]): void {
        const from = node.from
        if (from === null || from === undefined) {
            return
        }

        if (Array.isArray(from) && from.length === 0) {
            const loc = getNodeLocation(node)
            if (loc) {
                diagnostics.push(
                    createDiagnostic(
                        loc,
                        4,
                        'FROM_NO_TABLE',
                        t('diagnostic.missingTableAfterFrom', String(loc.line)),
                        vscode.DiagnosticSeverity.Error,
                    ),
                )
            }
        }
    }

    private checkOrderByNoColumn(node: AstNode, sql: string, diagnostics: vscode.Diagnostic[]): void {
        const orderby = node.orderby
        if (orderby === null || orderby === undefined) {
            return
        }

        if (Array.isArray(orderby) && orderby.length === 0) {
            const loc = getNodeLocation(node)
            if (loc) {
                diagnostics.push(
                    createDiagnostic(
                        loc,
                        8,
                        'ORDERBY_NO_COL',
                        t('diagnostic.missingOrderByColumn', String(loc.line)),
                        vscode.DiagnosticSeverity.Error,
                    ),
                )
            }
        }
    }

    private checkWhereNoCondition(node: AstNode, sql: string, diagnostics: vscode.Diagnostic[]): void {
        const where = node.where
        if (where === null || where === undefined) {
            return
        }

        if (isAstNode(where) && (where as AstNode).type === 'null') {
            const loc = getNodeLocation(where as AstNode)
            if (loc) {
                diagnostics.push(
                    createDiagnostic(
                        loc,
                        5,
                        'WHERE_NO_CONDITION',
                        t('diagnostic.missingWhereCondition', String(loc.line)),
                        vscode.DiagnosticSeverity.Error,
                    ),
                )
            }
        }
    }

    private checkGroupByNoColumn(node: AstNode, sql: string, diagnostics: vscode.Diagnostic[]): void {
        const groupby = node.groupby
        if (groupby === null || groupby === undefined) {
            return
        }

        if (Array.isArray(groupby) && groupby.length === 0) {
            const loc = getNodeLocation(node)
            if (loc) {
                diagnostics.push(
                    createDiagnostic(
                        loc,
                        8,
                        'GROUPBY_NO_COL',
                        t('diagnostic.missingGroupByColumn', String(loc.line)),
                        vscode.DiagnosticSeverity.Error,
                    ),
                )
            }
        }
    }

    private checkExtraCommasInText(sql: string, diagnostics: vscode.Diagnostic[]): void {
        const strippedRanges = this.getNonStringCommentRanges(sql)

        const pattern1 = /,(\s*)\)/g
        let match: RegExpExecArray | null
        while ((match = pattern1.exec(sql)) !== null) {
            if (this.isInRange(match.index, strippedRanges)) {
                const lineCol = lineColFromIndex(sql, match.index)
                diagnostics.push(
                    createDiagnostic(
                        { line: lineCol.line, column: lineCol.col },
                        1,
                        'EXTRA_COMMA_PAREN',
                        t('diagnostic.trailingCommaBeforeParen', String(lineCol.line)),
                        vscode.DiagnosticSeverity.Warning,
                    ),
                )
            }
        }

        const pattern2 = /,(\s*);/g
        while ((match = pattern2.exec(sql)) !== null) {
            if (this.isInRange(match.index, strippedRanges)) {
                const lineCol = lineColFromIndex(sql, match.index)
                diagnostics.push(
                    createDiagnostic(
                        { line: lineCol.line, column: lineCol.col },
                        1,
                        'EXTRA_COMMA_SEMI',
                        t('diagnostic.trailingCommaBeforeEnd', String(lineCol.line)),
                        vscode.DiagnosticSeverity.Warning,
                    ),
                )
            }
        }
    }

    private getNonStringCommentRanges(sql: string): [number, number][] {
        const ranges: [number, number][] = []
        let inString = false
        let stringChar = ''
        let inLineComment = false
        let inBlockComment = false
        let rangeStart = 0

        for (let i = 0; i < sql.length; i++) {
            const char = sql[i]
            const nextChar = i + 1 < sql.length ? sql[i + 1] : ''

            if (inLineComment) {
                if (char === '\n') {
                    inLineComment = false
                    rangeStart = i + 1
                }
                continue
            }
            if (inBlockComment) {
                if (char === '*' && nextChar === '/') {
                    inBlockComment = false
                    i++
                    rangeStart = i + 1
                }
                continue
            }
            if (inString) {
                if (char === stringChar) {
                    if (nextChar === stringChar) {
                        i++
                    } else {
                        inString = false
                        rangeStart = i + 1
                    }
                }
                continue
            }

            if (char === "'" || char === '"') {
                ranges.push([rangeStart, i])
                inString = true
                stringChar = char
            } else if (char === '-' && nextChar === '-') {
                ranges.push([rangeStart, i])
                inLineComment = true
                i++
            } else if (char === '/' && nextChar === '*') {
                ranges.push([rangeStart, i])
                inBlockComment = true
                i++
            }
        }

        if (!inString && !inLineComment && !inBlockComment && rangeStart < sql.length) {
            ranges.push([rangeStart, sql.length])
        }

        return ranges
    }

    private isInRange(index: number, ranges: [number, number][]): boolean {
        for (const [start, end] of ranges) {
            if (index >= start && index < end) {
                return true
            }
        }
        return false
    }
}
