import * as vscode from 'vscode'
import { walkAst, isAstNode } from '../parser/AstVisitor'
import { lineColFromIndexFast, precomputeLineOffsets } from '../lexer/lineColFromIndex'
import { t } from '../i18n'
import type { AstNode } from '../parser/astTypes'
import { getNodeLocation, createDiagnostic, resolveAstList } from '../parser/astUtils'
import type { SqlDialect } from '../parser/dialectMapper'

export class AstDiagnosticsProvider {
    /**
     * Cache of stripped (non-string / non-comment) ranges keyed by document
     * URI. The scan in {@link computeNonStringCommentRanges} is O(n) over the
     * full SQL text and runs on every diagnostics pass; caching by document
     * version avoids re-scanning unchanged SQL while typing.
     */
    private rangesCache = new Map<string, { version: number; ranges: [number, number][] }>();

    check(sql: string, dialect: SqlDialect, preParsedAst?: unknown[], document?: vscode.TextDocument): vscode.Diagnostic[] {
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

        this.checkExtraCommasInText(sql, diagnostics, document)

        return diagnostics
    }

    dispose(): void {
        this.rangesCache.clear()
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
                    this.checkSelectNode(child as AstNode, sql, diagnostics)
                }
            },
        })
    }

    private checkCommaFrom(node: AstNode, _sql: string, diagnostics: vscode.Diagnostic[]): void {
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

    private checkSelectNoColumns(node: AstNode, _sql: string, diagnostics: vscode.Diagnostic[]): void {
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

    private checkFromNoTable(node: AstNode, _sql: string, diagnostics: vscode.Diagnostic[]): void {
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

    private checkOrderByNoColumn(node: AstNode, _sql: string, diagnostics: vscode.Diagnostic[]): void {
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

    private checkWhereNoCondition(node: AstNode, _sql: string, diagnostics: vscode.Diagnostic[]): void {
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

    private checkGroupByNoColumn(node: AstNode, _sql: string, diagnostics: vscode.Diagnostic[]): void {
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

    private checkExtraCommasInText(sql: string, diagnostics: vscode.Diagnostic[], document?: vscode.TextDocument): void {
        const strippedRanges = this.getNonStringCommentRanges(sql, document)

        // Precompute line-start offsets once so each match position can be
        // converted to line/col via O(log n) binary search instead of O(n)
        // linear scan per match.
        const lineStarts = precomputeLineOffsets(sql)

        const pattern = /,\s*([);])/g
        let match: RegExpExecArray | null
        while ((match = pattern.exec(sql)) !== null) {
            if (this.isInRange(match.index, strippedRanges)) {
                const lineCol = lineColFromIndexFast(lineStarts, match.index)
                const isParen = match[1] === ')'
                diagnostics.push(
                    createDiagnostic(
                        { line: lineCol.line, column: lineCol.col },
                        1,
                        isParen ? 'EXTRA_COMMA_PAREN' : 'EXTRA_COMMA_SEMI',
                        isParen
                            ? t('diagnostic.trailingCommaBeforeParen', String(lineCol.line))
                            : t('diagnostic.trailingCommaBeforeEnd', String(lineCol.line)),
                        vscode.DiagnosticSeverity.Warning,
                    ),
                )
            }
        }
    }

    /**
     * Return the stripped (non-string / non-comment) ranges for the given SQL,
     * caching the result per document version so that repeated diagnostics
     * passes on unchanged SQL skip the O(n) scan in
     * {@link computeNonStringCommentRanges}.
     *
     * When no `document` is supplied (e.g. callers that operate on raw SQL
     * strings outside the editor), the scan runs uncached each call.
     */
    private getNonStringCommentRanges(sql: string, document?: vscode.TextDocument): [number, number][] {
        if (!document) {
            return this.computeNonStringCommentRanges(sql)
        }
        const cacheKey = document.uri.toString()
        const cached = this.rangesCache.get(cacheKey)
        if (cached && cached.version === document.version) {
            return cached.ranges
        }
        const ranges = this.computeNonStringCommentRanges(sql)
        this.rangesCache.set(cacheKey, { version: document.version, ranges })
        return ranges
    }

    private computeNonStringCommentRanges(sql: string): [number, number][] {
        const ranges: [number, number][] = []
        let inString = false
        let stringChar = 0
        let inLineComment = false
        let inBlockComment = false
        let rangeStart = 0
        const len = sql.length

        for (let i = 0; i < len; i++) {
            const charCode = sql.charCodeAt(i)
            const nextCharCode = i + 1 < len ? sql.charCodeAt(i + 1) : 0

            if (inLineComment) {
                if (charCode === 10) {
                    inLineComment = false
                    rangeStart = i + 1
                }
                continue
            }
            if (inBlockComment) {
                if (charCode === 42 && nextCharCode === 47) {
                    inBlockComment = false
                    i++
                    rangeStart = i + 1
                }
                continue
            }
            if (inString) {
                if (charCode === stringChar) {
                    if (nextCharCode === stringChar) {
                        i++
                    } else {
                        inString = false
                        rangeStart = i + 1
                    }
                }
                continue
            }

            if (charCode === 39 || charCode === 34) {
                ranges.push([rangeStart, i])
                inString = true
                stringChar = charCode
            } else if (charCode === 45 && nextCharCode === 45) {
                ranges.push([rangeStart, i])
                inLineComment = true
                i++
            } else if (charCode === 47 && nextCharCode === 42) {
                ranges.push([rangeStart, i])
                inBlockComment = true
                i++
            }
        }

        if (!inString && !inLineComment && !inBlockComment && rangeStart < len) {
            ranges.push([rangeStart, len])
        }

        return ranges
    }

    private isInRange(index: number, ranges: [number, number][]): boolean {
        let low = 0
        let high = ranges.length - 1
        while (low <= high) {
            const mid = (low + high) >>> 1
            const [start, end] = ranges[mid]
            if (index < start) {
                high = mid - 1
            } else if (index >= end) {
                low = mid + 1
            } else {
                return true
            }
        }
        return false
    }
}
