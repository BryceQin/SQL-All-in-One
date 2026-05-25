import * as vscode from 'vscode'
import { getDocumentAstCache } from '../parser/DocumentAstCache'
import { toSqlDialect } from '../core/sqlDialects'
import { walkAst, isAstNode } from '../parser/AstVisitor'
import { getNodeLocation } from '../parser/astUtils'
import type { AstNode, AstLocation } from '../parser/astTypes'

export interface SymbolIndex {
    cteDefinitions: Map<string, vscode.Location>
    tableAliasDefinitions: Map<string, vscode.Location>
    columnAliasDefinitions: Map<string, vscode.Location>
}

export interface SymbolReference {
    location: vscode.Location
    context: string
}

export type SymbolType = 'cte' | 'tableAlias' | 'columnAlias'

interface CacheEntry {
    version: number
    ast: unknown[] | unknown
    index: SymbolIndex
}

export function extractName(name: unknown): string | null {
    if (typeof name === 'string' && name.length > 0) {
        return name
    }
    if (name != null && typeof name === 'object') {
        const nameObj = name as Record<string, unknown>
        if (typeof nameObj.value === 'string' && nameObj.value.length > 0) {
            return nameObj.value
        }
    }
    return null
}

function toVscodeLocationFromLoc(loc: { start?: AstLocation; end?: AstLocation } | undefined, document: vscode.TextDocument): vscode.Location | null {
    if (!loc?.start?.line || !loc?.start?.column) return null
    const startPos = new vscode.Position(loc.start.line - 1, loc.start.column - 1)
    const endPos = loc?.end?.line && loc?.end?.column
        ? new vscode.Position(loc.end.line - 1, loc.end.column - 1)
        : startPos
    return new vscode.Location(document.uri, new vscode.Range(startPos, endPos))
}

function buildIndex(ast: unknown[] | unknown, document: vscode.TextDocument): SymbolIndex {
    const index: SymbolIndex = {
        cteDefinitions: new Map(),
        tableAliasDefinitions: new Map(),
        columnAliasDefinitions: new Map(),
    }

    const astList = Array.isArray(ast) ? ast : [ast]

    for (const stmt of astList) {
        if (!isAstNode(stmt)) continue
        const node = stmt as AstNode

        if (node.type === 'select') {
            processSelectForIndex(node, document, index)
        }

        if (node.type === 'with' || (node.type === 'select' && node.with)) {
            const withClause = node.type === 'with' ? node : node.with
            processWithForIndex(withClause, document, index)
        }
    }

    return index
}

function processWithForIndex(withClause: unknown, document: vscode.TextDocument, index: SymbolIndex): void {
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

    for (const item of cteItems) {
        if (item == null || typeof item !== 'object') continue
        const itemNode = item as Record<string, unknown>
        const cteName = extractName(itemNode.name)
        if (cteName) {
            const loc = (item as Record<string, unknown>).loc as { start?: AstLocation; end?: AstLocation } | undefined
            const location = loc
                ? toVscodeLocationFromLoc(loc, document)
                : null
            if (location) {
                index.cteDefinitions.set(cteName.toLowerCase(), location)
            }
        }
    }
}

function processSelectForIndex(node: AstNode, document: vscode.TextDocument, index: SymbolIndex): void {
    const from = node.from
    if (Array.isArray(from)) {
        for (const item of from) {
            if (item == null || typeof item !== 'object') continue
            const fromEntry = item as Record<string, unknown>

            if (fromEntry.as) {
                const aliasName = extractName(fromEntry.as)
                if (aliasName) {
                    const loc = fromEntry.loc as { start?: AstLocation; end?: AstLocation } | undefined
                    const location = loc
                        ? toVscodeLocationFromLoc(loc, document)
                        : null
                    if (location) {
                        index.tableAliasDefinitions.set(aliasName.toLowerCase(), location)
                    }
                }
            }
        }
    }

    const columns = node.columns
    if (Array.isArray(columns)) {
        for (const col of columns) {
            if (col == null || typeof col !== 'object') continue
            const colEntry = col as Record<string, unknown>
            if (colEntry.as) {
                const aliasName = extractName(colEntry.as)
                if (aliasName) {
                    const loc = colEntry.loc as { start?: AstLocation; end?: AstLocation } | undefined
                    const location = loc
                        ? toVscodeLocationFromLoc(loc, document)
                        : null
                    if (location) {
                        index.columnAliasDefinitions.set(aliasName.toLowerCase(), location)
                    }
                }
            }
        }
    }
}

function findColumnRefsInExpr(expr: unknown, nameLower: string, context: string, document: vscode.TextDocument, refs: SymbolReference[]): void {
    walkAst(expr, {
        enter(node) {
            if (isAstNode(node) && (node as AstNode).type === 'column_ref') {
                const astNode = node as AstNode
                const table = astNode.table
                if (typeof table === 'string' && table.toLowerCase() === nameLower) {
                    const loc = (node as Record<string, unknown>).loc as { start?: AstLocation; end?: AstLocation } | undefined
                    const location = loc ? toVscodeLocationFromLoc(loc, document) : null
                    if (location) {
                        refs.push({ location, context })
                    }
                }
            }
        },
    })
}

function findColumnAliasRefsInExpr(expr: unknown, nameLower: string, context: string, document: vscode.TextDocument, refs: SymbolReference[]): void {
    walkAst(expr, {
        enter(node) {
            if (isAstNode(node) && (node as AstNode).type === 'column_ref') {
                const astNode = node as AstNode
                const column = astNode.column
                if (typeof column === 'string' && column.toLowerCase() === nameLower) {
                    const loc = (node as Record<string, unknown>).loc as { start?: AstLocation; end?: AstLocation } | undefined
                    const location = loc ? toVscodeLocationFromLoc(loc, document) : null
                    if (location) {
                        refs.push({ location, context })
                    }
                }
            }
        },
    })
}

function findReferencesInSelect(node: AstNode, symbolName: string, document: vscode.TextDocument, symbolType: SymbolType, refs: SymbolReference[]): void {
    const nameLower = symbolName.toLowerCase()

    if (symbolType === 'cte') {
        const from = node.from
        if (Array.isArray(from)) {
            for (const fromItem of from) {
                if (fromItem == null || typeof fromItem !== 'object') continue
                const fromEntry = fromItem as Record<string, unknown>
                const table = fromEntry.table
                const tableName = extractName(table)
                if (tableName && tableName.toLowerCase() === nameLower) {
                    const loc = fromEntry.loc as { start?: AstLocation; end?: AstLocation } | undefined
                    const location = loc ? toVscodeLocationFromLoc(loc, document) : null
                    if (location) {
                        const join = fromEntry.join
                        const context = typeof join === 'string' ? 'JOIN 子句' : 'FROM 子句'
                        refs.push({ location, context })
                    }
                }
            }
        }
        if (node.where) {
            findColumnRefsInExpr(node.where, nameLower, 'WHERE 条件', document, refs)
        }
        if (node.having) {
            findColumnRefsInExpr(node.having, nameLower, 'HAVING 条件', document, refs)
        }
        if (Array.isArray(node.orderby)) {
            for (const ob of node.orderby) {
                if (ob == null || typeof ob !== 'object') continue
                const obEntry = ob as Record<string, unknown>
                if (obEntry.expr) {
                    findColumnRefsInExpr(obEntry.expr, nameLower, 'ORDER BY', document, refs)
                }
            }
        }
    }

    if (symbolType === 'tableAlias') {
        const columns = node.columns
        if (Array.isArray(columns)) {
            for (const col of columns) {
                if (col == null || typeof col !== 'object') continue
                const colEntry = col as Record<string, unknown>
                if (colEntry.expr) {
                    findColumnRefsInExpr(colEntry.expr, nameLower, 'SELECT 列', document, refs)
                }
            }
        }
        if (node.where) {
            findColumnRefsInExpr(node.where, nameLower, 'WHERE 条件', document, refs)
        }
        const from = node.from
        if (Array.isArray(from)) {
            for (const fromItem of from) {
                if (fromItem == null || typeof fromItem !== 'object') continue
                const fromEntry = fromItem as Record<string, unknown>
                if (fromEntry.on) {
                    findColumnRefsInExpr(fromEntry.on, nameLower, 'ON 条件', document, refs)
                }
            }
        }
        if (node.having) {
            findColumnRefsInExpr(node.having, nameLower, 'HAVING 条件', document, refs)
        }
        if (Array.isArray(node.orderby)) {
            for (const ob of node.orderby) {
                if (ob == null || typeof ob !== 'object') continue
                const obEntry = ob as Record<string, unknown>
                if (obEntry.expr) {
                    findColumnRefsInExpr(obEntry.expr, nameLower, 'ORDER BY', document, refs)
                }
            }
        }
    }

    if (symbolType === 'columnAlias') {
        if (node.having) {
            findColumnAliasRefsInExpr(node.having, nameLower, 'HAVING', document, refs)
        }
        if (Array.isArray(node.orderby)) {
            for (const ob of node.orderby) {
                if (ob == null || typeof ob !== 'object') continue
                const obEntry = ob as Record<string, unknown>
                if (obEntry.expr) {
                    findColumnAliasRefsInExpr(obEntry.expr, nameLower, 'ORDER BY', document, refs)
                }
            }
        }
    }
}

function findReferences(
    ast: unknown[] | unknown,
    symbolName: string,
    document: vscode.TextDocument,
    symbolType: SymbolType
): SymbolReference[] {
    const refs: SymbolReference[] = []

    const astList = Array.isArray(ast) ? ast : [ast]
    for (const stmt of astList) {
        if (!isAstNode(stmt)) continue
        const node = stmt as AstNode

        if (node.type === 'select') {
            findReferencesInSelect(node, symbolName, document, symbolType, refs)
        }
    }

    return refs
}

export class AstNavigator {
    private cache: Map<string, CacheEntry> = new Map()

    getAST(document: vscode.TextDocument): { ast: unknown[] | unknown; index: SymbolIndex } | null {
        const key = document.uri.toString()
        const version = document.version
        const cached = this.cache.get(key)
        if (cached && cached.version === version) {
            return { ast: cached.ast, index: cached.index }
        }

        const dialect = toSqlDialect(document.languageId)
        const result = getDocumentAstCache().getOrParse(document, dialect)
        if (!result.success || !result.ast) {
            return null
        }

        const index = buildIndex(result.ast, document)
        this.cache.set(key, { version, ast: result.ast, index })
        return { ast: result.ast, index }
    }

    invalidate(document: vscode.TextDocument): void {
        this.cache.delete(document.uri.toString())
    }

    findReferences(
        ast: unknown[] | unknown,
        symbolName: string,
        document: vscode.TextDocument,
        symbolType: SymbolType
    ): SymbolReference[] {
        return findReferences(ast, symbolName, document, symbolType)
    }

    detectSymbolType(word: string, index: SymbolIndex): SymbolType | null {
        const nameLower = word.toLowerCase()
        if (index.cteDefinitions.has(nameLower)) return 'cte'
        if (index.tableAliasDefinitions.has(nameLower)) return 'tableAlias'
        if (index.columnAliasDefinitions.has(nameLower)) return 'columnAlias'
        return null
    }

    getDefinition(word: string, index: SymbolIndex): vscode.Location | null {
        const nameLower = word.toLowerCase()
        return index.cteDefinitions.get(nameLower)
            || index.tableAliasDefinitions.get(nameLower)
            || index.columnAliasDefinitions.get(nameLower)
            || null
    }

    hasDefinition(word: string, index: SymbolIndex): boolean {
        const nameLower = word.toLowerCase()
        return index.cteDefinitions.has(nameLower)
            || index.tableAliasDefinitions.has(nameLower)
            || index.columnAliasDefinitions.has(nameLower)
    }
}
