import * as vscode from 'vscode'
import { t } from '../i18n'
import { getDocumentAstCache } from '../parser/DocumentAstCache'
import { toSqlDialect } from '../core/sqlDialects'
import { isAstNode } from '../parser/AstVisitor'
import { getNodeLocation, getStatementEndLocation, extractName, extractTableName } from '../parser/astUtils'
import type { AstNode, AstLocation } from '../parser/astTypes'
import { getConfigManager } from '../core/configManager'

export class SqlOutlineProvider implements vscode.DocumentSymbolProvider {
    provideDocumentSymbols(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.SymbolInformation[] | vscode.DocumentSymbol[]> {
        try {
            const dialect = toSqlDialect(document.languageId)
            const result = getDocumentAstCache().getOrParse(document, dialect)

            if (token.isCancellationRequested) return []

            if (result.success && result.ast) {
                return this.provideDocumentSymbolsFromAst(document, result.ast)
            }
            return []
        } catch {
            return []
        }
    }

    private provideDocumentSymbolsFromAst(
        document: vscode.TextDocument,
        ast: unknown[] | unknown
    ): vscode.DocumentSymbol[] {
        const symbols: vscode.DocumentSymbol[] = []
        const astList = Array.isArray(ast) ? ast : [ast]

        for (const stmt of astList) {
            if (!isAstNode(stmt)) continue
            const node = stmt as AstNode
            const symbol = this.processAstStatement(document, node)
            if (symbol) {
                symbols.push(symbol)
            }
        }

        return symbols
    }

    private processAstStatement(
        document: vscode.TextDocument,
        node: AstNode
    ): vscode.DocumentSymbol | null {
        const type = node.type

        if (type === 'select') {
            return this.processSelectStatement(document, node)
        }

        if (type === 'insert' || type === 'update' || type === 'delete') {
            return this.processDmlStatement(document, node, type.toUpperCase())
        }

        if (type === 'create') {
            return this.processCreateStatement(document, node)
        }

        return null
    }

    private processSelectStatement(
        document: vscode.TextDocument,
        node: AstNode
    ): vscode.DocumentSymbol | null {
        const tableName = this.extractTableNameFromFrom(node)
        const name = tableName ? `SELECT - ${tableName}` : 'SELECT'

        const symbol = this.createSymbolFromAst(document, name, t('outline.query'), vscode.SymbolKind.Event, node)
        if (!symbol) return null

        const withClause = node.with
        if (withClause) {
            const withSymbol = this.processWithClause(document, withClause)
            if (withSymbol) {
                symbol.children.push(withSymbol)
            }
        }

        const enableNavigation = getConfigManager().get<boolean>('enableNavigation', true)

        if (enableNavigation) {
            if (Array.isArray(node.columns)) {
                const columnsSymbol = this.processSelectColumns(document, node.columns)
                if (columnsSymbol) {
                    symbol.children.push(columnsSymbol)
                }
            }

            if (Array.isArray(node.from)) {
                const fromSymbols = this.processFromClauses(document, node.from)
                symbol.children.push(...fromSymbols)
            }

            if (node.where) {
                const whereSymbol = this.createClauseSymbol(document, node.where, 'WHERE')
                if (whereSymbol) symbol.children.push(whereSymbol)
            }

            if (node.groupby) {
                const groupBySymbol = this.createClauseSymbolFromArray(document, node.groupby, 'GROUP BY')
                if (groupBySymbol) symbol.children.push(groupBySymbol)
            }

            if (node.having) {
                const havingSymbol = this.createClauseSymbol(document, node.having, 'HAVING')
                if (havingSymbol) symbol.children.push(havingSymbol)
            }

            if (node.orderby) {
                const orderBySymbol = this.createClauseSymbolFromArray(document, node.orderby, 'ORDER BY')
                if (orderBySymbol) symbol.children.push(orderBySymbol)
            }
        }

        // Process _next chain (UNION queries)
        this.processSelectChain(document, node, symbol.children)

        return symbol
    }

    private processSelectChain(
        document: vscode.TextDocument,
        node: AstNode,
        siblings: vscode.DocumentSymbol[]
    ): void {
        const next = node._next
        if (next != null && isAstNode(next)) {
            const nextNode = next as AstNode
            if (nextNode.type === 'select') {
                const tableName = this.extractTableNameFromFrom(nextNode)
                const name = tableName ? `SELECT - ${tableName}` : 'SELECT (UNION)'
                const unionSymbol = this.createSymbolFromAst(document, name, t('outline.query'), vscode.SymbolKind.Event, nextNode)
                if (unionSymbol) {
                    siblings.push(unionSymbol)
                }
                // Recursively process further UNION
                this.processSelectChain(document, nextNode, siblings)
            }
        }
    }

    private processWithClause(
        document: vscode.TextDocument,
        withClause: unknown
    ): vscode.DocumentSymbol | null {
        let cteItems: unknown[] = []

        if (isAstNode(withClause) && (withClause as AstNode).type === 'with') {
            const withNode = withClause as AstNode
            const value = withNode.value
            if (Array.isArray(value)) {
                cteItems = value
            }
        } else if (Array.isArray(withClause)) {
            cteItems = withClause
        }

        if (cteItems.length === 0) return null

        const cteSymbols: vscode.DocumentSymbol[] = []
        for (const item of cteItems) {
            if (item == null || typeof item !== 'object') continue
            const itemNode = item as Record<string, unknown>
            const cteName = extractName(itemNode)
            if (cteName && isAstNode(item)) {
                const cteSymbol = this.createSymbolFromAst(
                    document,
                    cteName,
                    'CTE',
                    vscode.SymbolKind.Constant,
                    item as AstNode
                )
                if (cteSymbol) {
                    cteSymbols.push(cteSymbol)
                }
            }
        }

        if (cteSymbols.length === 0) return null

        // Create the WITH clause parent symbol
        // Use the first CTE's location start and last CTE's location end for the WITH range
        const firstCte = cteItems[0]
        const lastCte = cteItems[cteItems.length - 1]
        if (!isAstNode(firstCte) || !isAstNode(lastCte)) return null

        const startLoc = getNodeLocation(firstCte as AstNode)
        const endLoc = getStatementEndLocation(lastCte as AstNode)
        if (!startLoc) return null

        const startPos = new vscode.Position(startLoc.line - 1, startLoc.column - 1)
        const endPos = endLoc
            ? new vscode.Position(endLoc.line - 1, endLoc.column - 1)
            : startPos

        const range = new vscode.Range(startPos, endPos)
        const withSymbol = new vscode.DocumentSymbol(
            t('outline.withClause'),
            t('outline.cte'),
            vscode.SymbolKind.Namespace,
            range,
            range
        )
        withSymbol.children = cteSymbols

        return withSymbol
    }

    private processDmlStatement(
        document: vscode.TextDocument,
        node: AstNode,
        dmlType: string
    ): vscode.DocumentSymbol | null {
        const tableName = dmlType === 'DELETE'
            ? this.extractTableNameFromFrom(node)
            : this.extractTableNameFromTable(node)
        const name = tableName ? `${dmlType} - ${tableName}` : dmlType
        return this.createSymbolFromAst(document, name, t('outline.query'), vscode.SymbolKind.Event, node)
    }

    private processCreateStatement(
        document: vscode.TextDocument,
        node: AstNode
    ): vscode.DocumentSymbol | null {
        const keyword = node.keyword
        if (typeof keyword !== 'string') return null

        const tableName = this.extractCreateTableName(node)

        if (keyword === 'table') {
            const name = tableName || 'TABLE'
            return this.createSymbolFromAst(document, name, t('outline.table'), vscode.SymbolKind.Struct, node)
        }

        if (keyword === 'view') {
            const name = tableName || 'VIEW'
            return this.createSymbolFromAst(document, name, t('outline.view'), vscode.SymbolKind.Interface, node)
        }

        if (keyword === 'function') {
            const name = tableName || 'FUNCTION'
            return this.createSymbolFromAst(document, name, t('outline.function'), vscode.SymbolKind.Function, node)
        }

        if (keyword === 'procedure') {
            const name = tableName || 'PROCEDURE'
            return this.createSymbolFromAst(document, name, t('outline.procedure'), vscode.SymbolKind.Method, node)
        }

        return null
    }

    private extractTableNameFromFrom(node: AstNode): string | null {
        const from = node.from
        if (!Array.isArray(from) || from.length === 0) return null

        const first = from[0]
        if (first == null || typeof first !== 'object') return null
        const fromEntry = first as Record<string, unknown>

        const tableName = extractTableName(fromEntry)
        if (tableName) return tableName

        const alias = fromEntry.as
        if (typeof alias === 'string' && alias.length > 0) {
            return alias
        }

        return null
    }

    private extractTableNameFromTable(node: AstNode): string | null {
        const table = node.table
        if (!Array.isArray(table) || table.length === 0) {
            // table might be a single object, not an array
            if (table != null && typeof table === 'object' && !Array.isArray(table)) {
                return extractTableName(table as Record<string, unknown>)
            }
            if (typeof table === 'string' && table.length > 0) {
                return table
            }
            return null
        }

        const first = table[0]
        if (first == null || typeof first !== 'object') return null
        return extractTableName(first as Record<string, unknown>)
    }

    private extractNameFromTableObj(tableObj: Record<string, unknown>): string | null {
        return extractTableName(tableObj)
    }

    private extractCreateTableName(node: AstNode): string | null {
        const table = node.table
        if (table == null) return null

        // table can be an array or a single object
        if (Array.isArray(table)) {
            if (table.length === 0) return null
            return extractTableName(table[0] as Record<string, unknown>)
        }

        if (typeof table === 'string') {
            return table
        }

        if (typeof table === 'object') {
            return extractTableName(table as Record<string, unknown>)
        }

        return null
    }

    private createSymbolFromAst(
        document: vscode.TextDocument,
        name: string,
        detail: string,
        kind: vscode.SymbolKind,
        node: AstNode,
    ): vscode.DocumentSymbol | null {
        const startLoc = getNodeLocation(node)
        const endLoc = getStatementEndLocation(node)
        if (!startLoc) return null

        const startPos = new vscode.Position(startLoc.line - 1, startLoc.column - 1)
        const endPos = endLoc
            ? new vscode.Position(endLoc.line - 1, endLoc.column - 1)
            : startPos

        const range = new vscode.Range(startPos, endPos)
        return new vscode.DocumentSymbol(name, detail, kind, range, range)
    }

    private processSelectColumns(
        document: vscode.TextDocument,
        columns: unknown[]
    ): vscode.DocumentSymbol | null {
        if (!Array.isArray(columns) || columns.length === 0) return null

        const aliasSymbols: vscode.DocumentSymbol[] = []
        for (const col of columns) {
            if (col == null || typeof col !== 'object') continue
            const colEntry = col as Record<string, unknown>
            if (colEntry.as) {
                const aliasName = extractName(colEntry.as)
                if (aliasName) {
                    const loc = colEntry.loc as { start?: AstLocation; end?: AstLocation } | undefined
                    if (loc?.start?.line && loc?.start?.column) {
                        const startPos = new vscode.Position(loc.start.line - 1, loc.start.column - 1)
                        const endPos = loc?.end?.line && loc?.end?.column
                            ? new vscode.Position(loc.end.line - 1, loc.end.column - 1)
                            : startPos
                        const range = new vscode.Range(startPos, endPos)
                        aliasSymbols.push(new vscode.DocumentSymbol(
                            aliasName,
                            'alias',
                            vscode.SymbolKind.Field,
                            range,
                            range
                        ))
                    }
                }
            }
        }

        const firstCol = columns[0]
        const lastCol = columns[columns.length - 1]
        const firstLoc = this.getLocFromEntry(firstCol)
        const lastLoc = this.getLocFromEntry(lastCol)
        if (!firstLoc) return null

        const startPos = new vscode.Position(firstLoc.start.line - 1, firstLoc.start.column - 1)
        const endPos = lastLoc?.end
            ? new vscode.Position(lastLoc.end.line - 1, lastLoc.end.column - 1)
            : startPos
        const range = new vscode.Range(startPos, endPos)

        const label = `SELECT (${columns.length} columns)`
        const symbol = new vscode.DocumentSymbol(
            label,
            '',
            vscode.SymbolKind.Field,
            range,
            range
        )
        symbol.children = aliasSymbols
        return symbol
    }

    private processFromClauses(
        document: vscode.TextDocument,
        from: unknown[]
    ): vscode.DocumentSymbol[] {
        const symbols: vscode.DocumentSymbol[] = []
        if (!Array.isArray(from)) return symbols

        for (const item of from) {
            if (item == null || typeof item !== 'object') continue
            const fromEntry = item as Record<string, unknown>
            const loc = fromEntry.loc as { start?: AstLocation; end?: AstLocation } | undefined
            if (!loc?.start?.line || !loc?.start?.column) continue

            const startPos = new vscode.Position(loc.start.line - 1, loc.start.column - 1)
            const endPos = loc?.end?.line && loc?.end?.column
                ? new vscode.Position(loc.end.line - 1, loc.end.column - 1)
                : startPos
            const range = new vscode.Range(startPos, endPos)

            const tableName = extractName(fromEntry.table)
            const alias = extractName(fromEntry.as)
            const join = fromEntry.join

            let label = ''
            if (typeof join === 'string') {
                const joinUpper = join.toUpperCase()
                label = alias
                    ? `${joinUpper} ${tableName || '...'} ${alias}`
                    : `${joinUpper} ${tableName || '...'}`
            } else {
                label = alias
                    ? `FROM ${tableName || '...'} ${alias}`
                    : `FROM ${tableName || '...'}`
            }

            const truncatedLabel = label.length > 30 ? label.substring(0, 30) + '...' : label

            symbols.push(new vscode.DocumentSymbol(
                truncatedLabel,
                '',
                vscode.SymbolKind.Module,
                range,
                range
            ))
        }

        return symbols
    }

    private createClauseSymbol(
        document: vscode.TextDocument,
        clause: unknown,
        clauseName: string
    ): vscode.DocumentSymbol | null {
        if (!isAstNode(clause)) return null
        const loc = (clause as Record<string, unknown>).loc as { start?: AstLocation; end?: AstLocation } | undefined
        if (!loc?.start?.line || !loc?.start?.column) return null

        const startPos = new vscode.Position(loc.start.line - 1, loc.start.column - 1)
        const endPos = loc?.end?.line && loc?.end?.column
            ? new vscode.Position(loc.end.line - 1, loc.end.column - 1)
            : startPos
        const range = new vscode.Range(startPos, endPos)

        const text = document.getText(range).trim()
        const label = text.length > 30 ? `${clauseName} ${text.substring(0, 30 - clauseName.length - 1)}...` : `${clauseName} ${text}`

        return new vscode.DocumentSymbol(
            label,
            '',
            clauseName === 'WHERE' || clauseName === 'HAVING'
                ? vscode.SymbolKind.Boolean
                : vscode.SymbolKind.Array,
            range,
            range
        )
    }

    private createClauseSymbolFromArray(
        document: vscode.TextDocument,
        items: unknown,
        clauseName: string
    ): vscode.DocumentSymbol | null {
        if (Array.isArray(items) && items.length > 0) {
            const firstItem = items[0]
            const lastItem = items[items.length - 1]
            const firstLoc = this.getLocFromEntry(firstItem)
            const lastLoc = this.getLocFromEntry(lastItem)
            if (!firstLoc) return null

            const startPos = new vscode.Position(firstLoc.start.line - 1, firstLoc.start.column - 1)
            const endPos = lastLoc?.end
                ? new vscode.Position(lastLoc.end.line - 1, lastLoc.end.column - 1)
                : startPos
            const range = new vscode.Range(startPos, endPos)

            const text = document.getText(range).trim()
            const label = text.length > 30 ? `${clauseName} ${text.substring(0, 30 - clauseName.length - 1)}...` : `${clauseName} ${text}`

            return new vscode.DocumentSymbol(label, '', vscode.SymbolKind.Array, range, range)
        }

        if (isAstNode(items)) {
            return this.createClauseSymbol(document, items, clauseName)
        }

        return null
    }

    private getLocFromEntry(entry: unknown): { start: AstLocation; end?: AstLocation } | null {
        if (entry == null || typeof entry !== 'object') return null
        const obj = entry as Record<string, unknown>
        const loc = obj.loc as { start?: AstLocation; end?: AstLocation } | undefined
        if (loc?.start?.line && loc?.start?.column) {
            return loc as { start: AstLocation; end?: AstLocation }
        }
        return null
    }

    }
