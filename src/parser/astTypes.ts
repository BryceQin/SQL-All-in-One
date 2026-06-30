export interface AstLocation {
    line: number
    column: number
}

export interface AstNode {
    type: string
    loc?: {
        start?: AstLocation
        end?: AstLocation
    }
    [key: string]: unknown
}

// ============ Precise AST Node Type Definitions ============
//
// This file consolidates the previously duplicated AST type definitions from
// `astTypes.ts` and `astTypes.extended.ts`. Field types are taken from the
// (former) `astTypes.extended.ts` where they were more precise (e.g.
// `distinct: boolean` instead of `unknown`), while fields that only existed
// in the original `astTypes.ts` (e.g. `SelectColumn.table`, `WithNode`,
// `CteItem`, `CreateNode.keyword`) are preserved for backward compatibility.

// SELECT 语句节点
export interface SelectNode extends AstNode {
    type: 'select'
    distinct?: boolean
    columns?: SelectColumn[]
    from?: FromItem[]
    where?: AstNode
    groupby?: GroupByClause
    having?: AstNode
    orderby?: OrderByItem[]
    limit?: LimitClause
    with?: CteClause[] | WithNode | AstNode[]   // CTE WITH clause
    _next?: SelectNode                            // UNION/INTERSECT chain
    set_op?: string
}

// SELECT 列节点
export interface SelectColumn extends AstNode {
    type: 'column_ref' | 'star' | 'function' | string
    expr?: AstNode
    as?: string | { value: string }
    table?: string | { value: string }
    column?: string
}

// FROM 子句项
export interface FromItem extends AstNode {
    table?: string | { value: string; [key: string]: unknown } | AstNode
    db?: string
    as?: string | { value: string }
    join?: string
    on?: AstNode
    using?: unknown
    expr?: { ast: AstNode; [key: string]: unknown }
}

// GROUP BY 子句
export interface GroupByClause {
    columns?: unknown[]
}

// ORDER BY 项
export interface OrderByItem extends AstNode {
    expr: AstNode
    type: string  // ASC / DESC
}

// LIMIT 子句
export interface LimitClause extends AstNode {
    value?: unknown[]
    seperator?: string
}

// CTE 子句（每个 WITH 项）
export interface CteClause {
    name: string | { value: string }
    stmt: AstNode | { ast: AstNode; [key: string]: unknown }
    columns?: unknown[]
}

// WITH/CTE 节点（包装 CteClause[] 的容器节点）
export interface WithNode extends AstNode {
    type: 'with'
    value?: CteItem[]
}

// CTE 项（兼容 WithNode.value 的元素结构）
export interface CteItem extends AstNode {
    name: string | { value: string }
    stmt?: { ast: AstNode; [key: string]: unknown }
    columns?: unknown[]
}

// INSERT 语句
export interface InsertNode extends AstNode {
    type: 'insert'
    table?: FromItem[] | FromItem | string | unknown
    columns?: string[] | AstNode[] | unknown[]
    values?: unknown[]
}

// UPDATE 语句
export interface UpdateNode extends AstNode {
    type: 'update'
    table?: unknown[]
    set?: { column: string; value: unknown }[]
    where?: unknown
}

// DELETE 语句
export interface DeleteNode extends AstNode {
    type: 'delete'
    from?: unknown[]
    where?: unknown
}

// USE 语句
export interface UseNode extends AstNode {
    type: 'use'
    db?: string
}

// CREATE 语句
export interface CreateNode extends AstNode {
    type: 'create'
    keyword?: string  // 'table' | 'view' | 'function' | 'procedure'
    table?: FromItem[] | FromItem | string | unknown
    [key: string]: unknown
}

// column_ref 节点
export interface ColumnRefNode extends AstNode {
    type: 'column_ref'
    table?: string
    column: string
}

// function 调用节点
export interface FunctionCallNode extends AstNode {
    type: 'function'
    name: string | { value: string; [key: string]: unknown }
    args?: AstNode | unknown[]
}

// ============ Union of all precise AST node types ============

export type ExtendedAst =
    | SelectNode
    | InsertNode
    | UpdateNode
    | DeleteNode
    | UseNode
    | CreateNode
    | ColumnRefNode
    | FunctionCallNode
    | AstNode

// Backward-compat alias kept for callers that imported the same `AstNode`
// type under the `ExtendedAstNode` name from the former extended module.
export type ExtendedAstNode = AstNode

export { isAstNode } from './AstVisitor'
