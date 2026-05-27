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

export type {
    AstNode as ExtendedAstNode,
    SelectNode, InsertNode, UpdateNode, DeleteNode, UseNode, CreateNode,
    ColumnRefNode, FunctionCallNode, SelectColumn, FromItem,
    GroupByClause, OrderByItem, LimitClause, CteClause, ExtendedAst
} from './astTypes.extended'

export { isAstNode } from './AstVisitor'
