import * as vscode from 'vscode'
import { getParserEngine } from '../parser/SqlParserEngine'
import type { SqlDialect } from '../parser/dialectMapper'
import { walkAst, isAstNode } from '../parser/AstVisitor'
import { lineColFromIndex } from '../lexer/lineColFromIndex'
import { t } from '../i18n'

interface AstLocation {
    line: number
    column: number
}

interface AstNode {
    type: string
    loc?: {
        start?: AstLocation
        end?: AstLocation
    }
    [key: string]: unknown
}

export class AstDiagnosticsProvider {
    check(sql: string, dialect: SqlDialect): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = []

        const result = getParserEngine().tryAstify(sql, dialect)
        if (!result.success || !result.ast) {
            return diagnostics
        }

        const astList = Array.isArray(result.ast) ? result.ast : [result.ast]

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
                    const loc = this.getNodeLocation(colRef)
                    if (loc) {
                        const lineNum = loc.line
                        const diagnostic = new vscode.Diagnostic(
                            new vscode.Range(lineNum - 1, loc.column - 1, lineNum - 1, loc.column),
                            t('diagnostic.missingColumnAfterComma', String(lineNum)),
                            vscode.DiagnosticSeverity.Error
                        )
                        diagnostic.source = 'Hive Formatter'
                        diagnostic.code = 'COMMA_FROM'
                        diagnostics.push(diagnostic)
                    }
                }
            }
        }
    }

    private checkSelectNoColumns(node: AstNode, sql: string, diagnostics: vscode.Diagnostic[]): void {
        const columns = node.columns
        if (columns === null || columns === undefined) {
            const loc = this.getNodeLocation(node)
            if (loc) {
                const lineNum = loc.line
                const diagnostic = new vscode.Diagnostic(
                    new vscode.Range(lineNum - 1, loc.column - 1, lineNum - 1, loc.column + 5),
                    t('diagnostic.missingColumnAfterSelect', String(lineNum)),
                    vscode.DiagnosticSeverity.Error
                )
                diagnostic.source = 'Hive Formatter'
                diagnostic.code = 'SELECT_NO_COLUMNS'
                diagnostics.push(diagnostic)
            }
            return
        }

        if (Array.isArray(columns) && columns.length === 0) {
            const loc = this.getNodeLocation(node)
            if (loc) {
                const lineNum = loc.line
                const diagnostic = new vscode.Diagnostic(
                    new vscode.Range(lineNum - 1, loc.column - 1, lineNum - 1, loc.column + 5),
                    t('diagnostic.missingColumnAfterSelect', String(lineNum)),
                    vscode.DiagnosticSeverity.Error
                )
                diagnostic.source = 'Hive Formatter'
                diagnostic.code = 'SELECT_NO_COLUMNS'
                diagnostics.push(diagnostic)
            }
        }
    }

    private checkFromNoTable(node: AstNode, sql: string, diagnostics: vscode.Diagnostic[]): void {
        const from = node.from
        if (from === null || from === undefined) {
            return
        }

        if (Array.isArray(from) && from.length === 0) {
            const loc = this.getNodeLocation(node)
            if (loc) {
                const lineNum = loc.line
                const diagnostic = new vscode.Diagnostic(
                    new vscode.Range(lineNum - 1, loc.column - 1, lineNum - 1, loc.column + 3),
                    t('diagnostic.missingTableAfterFrom', String(lineNum)),
                    vscode.DiagnosticSeverity.Error
                )
                diagnostic.source = 'Hive Formatter'
                diagnostic.code = 'FROM_NO_TABLE'
                diagnostics.push(diagnostic)
            }
        }
    }

    private checkOrderByNoColumn(node: AstNode, sql: string, diagnostics: vscode.Diagnostic[]): void {
        const orderby = node.orderby
        if (orderby === null || orderby === undefined) {
            return
        }

        if (Array.isArray(orderby) && orderby.length === 0) {
            const loc = this.getNodeLocation(node)
            if (loc) {
                const lineNum = loc.line
                const diagnostic = new vscode.Diagnostic(
                    new vscode.Range(lineNum - 1, loc.column - 1, lineNum - 1, loc.column + 7),
                    t('diagnostic.missingOrderByColumn', String(lineNum)),
                    vscode.DiagnosticSeverity.Error
                )
                diagnostic.source = 'Hive Formatter'
                diagnostic.code = 'ORDERBY_NO_COL'
                diagnostics.push(diagnostic)
            }
        }
    }

    private checkWhereNoCondition(node: AstNode, sql: string, diagnostics: vscode.Diagnostic[]): void {
        const where = node.where
        if (where === null || where === undefined) {
            return
        }

        if (isAstNode(where) && (where as AstNode).type === 'null') {
            const loc = this.getNodeLocation(where as AstNode)
            if (loc) {
                const lineNum = loc.line
                const diagnostic = new vscode.Diagnostic(
                    new vscode.Range(lineNum - 1, loc.column - 1, lineNum - 1, loc.column + 4),
                    t('diagnostic.missingWhereCondition', String(lineNum)),
                    vscode.DiagnosticSeverity.Error
                )
                diagnostic.source = 'Hive Formatter'
                diagnostic.code = 'WHERE_NO_CONDITION'
                diagnostics.push(diagnostic)
            }
        }
    }

    private checkGroupByNoColumn(node: AstNode, sql: string, diagnostics: vscode.Diagnostic[]): void {
        const groupby = node.groupby
        if (groupby === null || groupby === undefined) {
            return
        }

        if (Array.isArray(groupby) && groupby.length === 0) {
            const loc = this.getNodeLocation(node)
            if (loc) {
                const lineNum = loc.line
                const diagnostic = new vscode.Diagnostic(
                    new vscode.Range(lineNum - 1, loc.column - 1, lineNum - 1, loc.column + 7),
                    t('diagnostic.missingGroupByColumn', String(lineNum)),
                    vscode.DiagnosticSeverity.Error
                )
                diagnostic.source = 'Hive Formatter'
                diagnostic.code = 'GROUPBY_NO_COL'
                diagnostics.push(diagnostic)
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
                const lineNum = lineCol.line
                const diagnostic = new vscode.Diagnostic(
                    new vscode.Range(lineNum - 1, lineCol.col - 1, lineNum - 1, lineCol.col),
                    t('diagnostic.trailingCommaBeforeParen', String(lineNum)),
                    vscode.DiagnosticSeverity.Warning
                )
                diagnostic.source = 'Hive Formatter'
                diagnostic.code = 'EXTRA_COMMA_PAREN'
                diagnostics.push(diagnostic)
            }
        }

        const pattern2 = /,(\s*);/g
        while ((match = pattern2.exec(sql)) !== null) {
            if (this.isInRange(match.index, strippedRanges)) {
                const lineCol = lineColFromIndex(sql, match.index)
                const lineNum = lineCol.line
                const diagnostic = new vscode.Diagnostic(
                    new vscode.Range(lineNum - 1, lineCol.col - 1, lineNum - 1, lineCol.col),
                    t('diagnostic.trailingCommaBeforeEnd', String(lineNum)),
                    vscode.DiagnosticSeverity.Warning
                )
                diagnostic.source = 'Hive Formatter'
                diagnostic.code = 'EXTRA_COMMA_SEMI'
                diagnostics.push(diagnostic)
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

    private getNodeLocation(node: AstNode): AstLocation | null {
        const loc = (node as any).loc
        if (loc?.start?.line !== undefined && loc?.start?.column !== undefined) {
            return {
                line: loc.start.line as number,
                column: loc.start.column as number,
            }
        }
        return null
    }
}
