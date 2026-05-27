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

// SELECT 语句节点
export interface SelectNode extends AstNode {
    type: 'select'
    columns?: SelectColumn[]
    from?: FromItem[]
    where?: AstNode
    groupby?: AstNode[] | AstNode
    having?: AstNode
    orderby?: OrderByItem[]
    limit?: LimitClause
    with?: AstNode | AstNode[]  // CTE WITH clause
    distinct?: unknown
    _next?: AstNode  // UNION/INTERSECT chain
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
    table?: string | { value: string; [key: string]: unknown }
    as?: string | { value: string }
    join?: string
    on?: AstNode
    using?: unknown
    expr?: { ast: AstNode; [key: string]: unknown }
}

// ORDER BY 项
export interface OrderByItem extends AstNode {
    expr: AstNode
    type: string  // ASC / DESC
}

// LIMIT 子句
export interface LimitClause extends AstNode {
    value?: unknown[] | unknown
    seperator?: string
}

// INSERT 语句
export interface InsertNode extends AstNode {
    type: 'insert'
    table?: FromItem[] | FromItem | string
    columns?: string[] | AstNode[]
    values?: unknown[]
}

// CREATE 语句
export interface CreateNode extends AstNode {
    type: 'create'
    keyword: string  // 'table' | 'view' | 'function' | 'procedure'
    table?: FromItem[] | FromItem | string
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
    args?: AstNode
}

// WITH/CTE 节点
export interface WithNode extends AstNode {
    type: 'with'
    value?: CteItem[]
}

// CTE 项
export interface CteItem extends AstNode {
    name: string | { value: string }
    stmt?: { ast: AstNode; [key: string]: unknown }
    columns?: unknown[]
}

// Re-export non-conflicting types from astTypes.extended
export type {
    AstNode as ExtendedAstNode,
    UpdateNode, DeleteNode, UseNode,
    GroupByClause, CteClause, ExtendedAst
} from './astTypes.extended'

export { isAstNode } from './AstVisitor'
