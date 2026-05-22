import { getParserEngine } from '../parser/SqlParserEngine'
import type { SqlDialect } from '../parser/dialectMapper'
import { walkAst, findNodes, isAstNode } from '../parser/AstVisitor'

export type CompletionContext =
    | 'select_columns'
    | 'from_table'
    | 'where_expr'
    | 'join_type'
    | 'on_condition'
    | 'groupby_columns'
    | 'orderby_columns'
    | 'window_func'
    | 'cte_name'
    | 'function_args'
    | 'case_when'
    | 'unknown'

interface AstLocation {
    line: number
    column: number
}

interface LocRange {
    start: AstLocation
    end: AstLocation
}

interface AstNode {
    type: string
    loc?: LocRange
    [key: string]: unknown
}

interface Position {
    line: number
    column: number
}

function posBeforeOrEqual(a: Position, b: Position): boolean {
    if (a.line < b.line) return true
    if (a.line === b.line) return a.column <= b.column
    return false
}

function posAfterOrEqual(a: Position, b: Position): boolean {
    if (a.line > b.line) return true
    if (a.line === b.line) return a.column >= b.column
    return false
}

function isPosInRange(pos: Position, range: LocRange): boolean {
    return posBeforeOrEqual(range.start, pos) && posBeforeOrEqual(pos, range.end)
}

function getNodeLoc(node: AstNode): LocRange | null {
    const loc = node.loc
    if (loc?.start?.line !== undefined && loc?.start?.column !== undefined &&
        loc?.end?.line !== undefined && loc?.end?.column !== undefined) {
        return loc
    }
    return null
}

function getFromEntryLoc(fromEntry: AstNode): LocRange | null {
    const loc = getNodeLoc(fromEntry)
    if (loc) return loc

    const table = fromEntry.table
    if (typeof table === 'string') return null

    if (isAstNode(table)) {
        return getNodeLoc(table as AstNode)
    }
    return null
}

function findSmallestEnclosingNode(root: AstNode, pos: Position): { node: AstNode; parent: AstNode | null; key: string | null } | null {
    let best: { node: AstNode; parent: AstNode | null; key: string | null } | null = null
    let bestSize = Infinity

    walkAst(root, {
        enter(node, parent, key) {
            if (!isAstNode(node)) return
            const astNode = node as AstNode
            const loc = getNodeLoc(astNode)
            if (!loc) return
            if (!isPosInRange(pos, loc)) return

            const startOffset = loc.start.line * 100000 + loc.start.column
            const endOffset = loc.end.line * 100000 + loc.end.column
            const size = endOffset - startOffset
            if (size < bestSize) {
                bestSize = size
                best = { node: astNode, parent: parent as AstNode | null, key }
            }
        },
    })

    return best
}

function determineSelectClauseContext(selectNode: AstNode, pos: Position): CompletionContext {
    const from = selectNode.from
    const where = selectNode.where
    const groupby = selectNode.groupby
    const having = selectNode.having
    const orderby = selectNode.orderby
    const limit = selectNode.limit

    const columnsLoc = getColumnsLoc(selectNode)
    const fromLoc = getFromLoc(selectNode, from)
    const whereLoc = getClauseNodeLoc(where)
    const groupbyLoc = getArrayClauseLoc(selectNode, 'groupby', groupby)
    const havingLoc = getClauseNodeLoc(having)
    const orderbyLoc = getArrayClauseLoc(selectNode, 'orderby', orderby)

    if (columnsLoc && isPosInRange(pos, columnsLoc)) {
        return 'select_columns'
    }

    if (from && fromLoc && isPosInRange(pos, fromLoc)) {
        return determineFromContext(from as unknown[], pos)
    }

    if (where && whereLoc && isPosInRange(pos, whereLoc)) {
        return 'where_expr'
    }

    if (groupby && groupbyLoc && isPosInRange(pos, groupbyLoc)) {
        return 'groupby_columns'
    }

    if (having && havingLoc && isPosInRange(pos, havingLoc)) {
        return 'where_expr'
    }

    if (orderby && orderbyLoc && isPosInRange(pos, orderbyLoc)) {
        return 'orderby_columns'
    }

    if (limit != null) {
        const limitLoc = getClauseNodeLoc(limit)
        if (limitLoc && isPosInRange(pos, limitLoc)) {
            return 'unknown'
        }
    }

    if (columnsLoc && posBeforeOrEqual(pos, columnsLoc.end)) {
        return 'select_columns'
    }

    if (fromLoc && posBeforeOrEqual(pos, fromLoc.end)) {
        return determineFromContext(from as unknown[], pos)
    }

    if (whereLoc && posBeforeOrEqual(pos, whereLoc.end)) {
        return 'where_expr'
    }

    if (groupbyLoc && posBeforeOrEqual(pos, groupbyLoc.end)) {
        return 'groupby_columns'
    }

    if (havingLoc && posBeforeOrEqual(pos, havingLoc.end)) {
        return 'where_expr'
    }

    if (orderbyLoc && posBeforeOrEqual(pos, orderbyLoc.end)) {
        return 'orderby_columns'
    }

    return 'unknown'
}

function getColumnsLoc(selectNode: AstNode): LocRange | null {
    const columns = selectNode.columns
    if (!Array.isArray(columns) || columns.length === 0) return null

    let earliestStart: Position | null = null
    let latestEnd: Position | null = null

    for (const col of columns) {
        if (!isAstNode(col)) continue
        const loc = getNodeLoc(col as AstNode)
        if (!loc) continue
        if (!earliestStart || posBeforeOrEqual(loc.start, earliestStart)) {
            earliestStart = loc.start
        }
        if (!latestEnd || posAfterOrEqual(loc.end, latestEnd)) {
            latestEnd = loc.end
        }
    }

    if (earliestStart && latestEnd) {
        return { start: earliestStart, end: latestEnd }
    }
    return null
}

function getFromLoc(selectNode: AstNode, from: unknown): LocRange | null {
    if (!Array.isArray(from) || from.length === 0) return null

    let earliestStart: Position | null = null
    let latestEnd: Position | null = null

    for (const entry of from) {
        if (!isAstNode(entry)) continue
        const loc = getFromEntryLoc(entry as AstNode)
        if (!loc) continue
        if (!earliestStart || posBeforeOrEqual(loc.start, earliestStart)) {
            earliestStart = loc.start
        }
        if (!latestEnd || posAfterOrEqual(loc.end, latestEnd)) {
            latestEnd = loc.end
        }
    }

    if (earliestStart && latestEnd) {
        return { start: earliestStart, end: latestEnd }
    }
    return null
}

function getClauseNodeLoc(clause: unknown): LocRange | null {
    if (!isAstNode(clause)) return null
    return getNodeLoc(clause as AstNode)
}

function getArrayClauseLoc(selectNode: AstNode, key: string, clause: unknown): LocRange | null {
    if (Array.isArray(clause) && clause.length > 0) {
        let earliestStart: Position | null = null
        let latestEnd: Position | null = null

        for (const item of clause) {
            if (!isAstNode(item)) continue
            const loc = getNodeLoc(item as AstNode)
            if (!loc) continue
            if (!earliestStart || posBeforeOrEqual(loc.start, earliestStart)) {
                earliestStart = loc.start
            }
            if (!latestEnd || posAfterOrEqual(loc.end, latestEnd)) {
                latestEnd = loc.end
            }
        }

        if (earliestStart && latestEnd) {
            return { start: earliestStart, end: latestEnd }
        }
    }

    if (isAstNode(clause)) {
        return getNodeLoc(clause as AstNode)
    }

    return null
}

function determineFromContext(from: unknown[], pos: Position): CompletionContext {
    if (!Array.isArray(from)) return 'from_table'

    for (let i = from.length - 1; i >= 0; i--) {
        const entry = from[i]
        if (!isAstNode(entry)) continue
        const fromEntry = entry as AstNode
        const loc = getFromEntryLoc(fromEntry)
        if (!loc) continue

        if (isPosInRange(pos, loc)) {
            const join = fromEntry.join
            if (typeof join === 'string') {
                const on = fromEntry.on
                if (on && isAstNode(on)) {
                    const onLoc = getNodeLoc(on as AstNode)
                    if (onLoc && isPosInRange(pos, onLoc)) {
                        return 'on_condition'
                    }
                }
                return 'join_type'
            }
            return 'from_table'
        }
    }

    return 'from_table'
}

function determineNodeContext(node: AstNode, parent: AstNode | null, key: string | null): CompletionContext {
    if (node.type === 'select') {
        return 'select_columns'
    }

    if (node.type === 'column_ref') {
        if (parent) {
            if (Array.isArray(parent.from) && parent.from.includes(node)) {
                return 'from_table'
            }
            if (parent.where === node || parent.having === node) {
                return 'where_expr'
            }
            if (Array.isArray(parent.groupby) && parent.groupby.includes(node)) {
                return 'groupby_columns'
            }
            if (Array.isArray(parent.orderby) && parent.orderby.includes(node)) {
                return 'orderby_columns'
            }
            if (Array.isArray(parent.columns) && parent.columns.includes(node)) {
                return 'select_columns'
            }
        }
        return 'select_columns'
    }

    if (node.type === 'function') {
        const args = node.args
        if (args) {
            return 'function_args'
        }
        const name = node.name
        if (typeof name === 'string') {
            const windowFuncs = ['row_number', 'rank', 'dense_rank', 'lead', 'lag', 'first_value', 'last_value', 'nth_value', 'percent_rank', 'cume_dist', 'ntile']
            if (windowFuncs.includes(name.toLowerCase())) {
                return 'window_func'
            }
        }
        return 'select_columns'
    }

    if (node.type === 'window') {
        return 'window_func'
    }

    if (node.type === 'case') {
        return 'case_when'
    }

    if (node.type === 'binary_expr') {
        const operator = node.operator
        if (typeof operator === 'string') {
            const op = operator.toUpperCase()
            if (op === 'AND' || op === 'OR' || op === 'IN' || op === 'LIKE' ||
                op === 'NOT' || op === 'IS' || op === 'BETWEEN' ||
                op === '=' || op === '!=' || op === '<' || op === '>' ||
                op === '<=' || op === '>=') {
                return 'where_expr'
            }
        }
    }

    if (parent) {
        return determineNodeContext(parent, null, key)
    }

    return 'unknown'
}

export function findCursorContext(sql: string, position: Position, dialect: SqlDialect): CompletionContext {
    const result = getParserEngine().tryAstify(sql, dialect)
    if (!result.success || !result.ast) {
        return 'unknown'
    }

    const astList = Array.isArray(result.ast) ? result.ast : [result.ast]

    const astPos: Position = {
        line: position.line + 1,
        column: position.column,
    }

    for (const ast of astList) {
        if (!isAstNode(ast)) continue
        const node = ast as AstNode

        const loc = getNodeLoc(node)
        if (loc && !isPosInRange(astPos, loc)) {
            if (isAstNode(node._next)) {
                continue
            }
            continue
        }

        const context = findContextInStatement(node, astPos)
        if (context !== 'unknown') {
            return context
        }
    }

    return 'unknown'
}

function findContextInStatement(node: AstNode, pos: Position): CompletionContext {
    if (node.type === 'select') {
        const context = determineSelectClauseContext(node, pos)
        if (context !== 'unknown') return context

        const from = node.from
        if (Array.isArray(from)) {
            for (const entry of from) {
                if (!isAstNode(entry)) continue
                const fromEntry = entry as AstNode
                if (isAstNode(fromEntry.on)) {
                    const subContext = findContextInStatement(fromEntry.on as AstNode, pos)
                    if (subContext !== 'unknown') return subContext
                }
            }
        }

        if (isAstNode(node.where)) {
            const subContext = findContextInStatement(node.where as AstNode, pos)
            if (subContext !== 'unknown') return subContext
        }

        if (isAstNode(node.having)) {
            const subContext = findContextInStatement(node.having as AstNode, pos)
            if (subContext !== 'unknown') return subContext
        }
    }

    if (node.type === 'with') {
        const withItems = node.value
        if (Array.isArray(withItems)) {
            for (const item of withItems) {
                if (!isAstNode(item)) continue
                const itemNode = item as AstNode
                const loc = getNodeLoc(itemNode)
                if (loc && isPosInRange(pos, loc)) {
                    const name = itemNode.name
                    if (typeof name === 'string') {
                        return 'cte_name'
                    }
                }
            }
        }
        return 'cte_name'
    }

    const enclosing = findSmallestEnclosingNode(node, pos)
    if (enclosing) {
        return determineNodeContext(enclosing.node, enclosing.parent, enclosing.key)
    }

    return 'unknown'
}

export function extractCteNames(sql: string, dialect: SqlDialect): string[] {
    const result = getParserEngine().tryAstify(sql, dialect)
    if (!result.success || !result.ast) {
        return []
    }

    const astList = Array.isArray(result.ast) ? result.ast : [result.ast]
    const names: string[] = []

    for (const ast of astList) {
        if (!isAstNode(ast)) continue
        const node = ast as AstNode

        if (node.type === 'with') {
            collectCteNames(node, names)
        }

        if (node.type === 'select') {
            const withClause = node.with
            if (isAstNode(withClause) && (withClause as AstNode).type === 'with') {
                collectCteNames(withClause as AstNode, names)
            }
        }
    }

    return names
}

function collectCteNames(withNode: AstNode, names: string[]): void {
    const value = withNode.value
    if (!Array.isArray(value)) return

    for (const item of value) {
        if (!isAstNode(item)) continue
        const itemNode = item as AstNode
        const name = itemNode.name
        if (typeof name === 'string' && name.length > 0) {
            names.push(name)
        }
    }
}

export function extractTableNames(sql: string, dialect: SqlDialect): string[] {
    const result = getParserEngine().tryAstify(sql, dialect)
    if (!result.success || !result.ast) {
        return []
    }

    const astList = Array.isArray(result.ast) ? result.ast : [result.ast]
    const names: string[] = []
    const seen = new Set<string>()

    for (const ast of astList) {
        if (!isAstNode(ast)) continue
        const node = ast as AstNode

        if (node.type === 'select') {
            collectTableNamesFromSelect(node, names, seen)
        }
    }

    return names
}

function collectTableNamesFromSelect(node: AstNode, names: string[], seen: Set<string>): void {
    const from = node.from
    if (!Array.isArray(from)) return

    for (const entry of from) {
        if (!isAstNode(entry)) continue
        const fromEntry = entry as AstNode
        const table = fromEntry.table
        if (typeof table === 'string' && table.length > 0 && !seen.has(table.toLowerCase())) {
            seen.add(table.toLowerCase())
            names.push(table)
        }
    }

    if (isAstNode(node._next)) {
        const next = node._next as AstNode
        if (next.type === 'select') {
            collectTableNamesFromSelect(next, names, seen)
        }
    }
}

export function extractColumnRefs(sql: string, dialect: SqlDialect): { table: string; column: string }[] {
    const result = getParserEngine().tryAstify(sql, dialect)
    if (!result.success || !result.ast) {
        return []
    }

    const astList = Array.isArray(result.ast) ? result.ast : [result.ast]
    const refs: { table: string; column: string }[] = []
    const seen = new Set<string>()

    for (const ast of astList) {
        if (!isAstNode(ast)) continue

        const columnRefs = findNodes<ASTColumnRef>(ast, (n): n is ASTColumnRef => {
            return isAstNode(n) && (n as AstNode).type === 'column_ref'
        })

        for (const ref of columnRefs) {
            const table = typeof ref.table === 'string' ? ref.table : ''
            const column = typeof ref.column === 'string' ? ref.column : ''
            if (column.length === 0) continue

            const key = `${table}.${column}`.toLowerCase()
            if (!seen.has(key)) {
                seen.add(key)
                refs.push({ table, column })
            }
        }
    }

    return refs
}

interface ASTColumnRef extends AstNode {
    table: string
    column: string
}
