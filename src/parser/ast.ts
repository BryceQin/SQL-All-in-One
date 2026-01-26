import { TokenType } from "../lexer/token"

export const NodeType = {
    // // SQL 语句（如 SELECT * FROM user;）
    statement: "statement",
    // 子句（如 FROM user、WHERE id=1）
    clause: "clause",
    set_operation: "set_operation",
    function_call: "function_call",
    parameterized_data_type: "parameterized_data_type",
    array_subscript: "array_subscript",
    property_access: "property_access",
    parenthesis: "parenthesis",
    between_predicate: "between_predicate",
    case_expression: "case_expression",
    case_when: "case_when",
    case_else: "case_else",
    limit_clause: "limit_clause",
    all_columns_asterisk: "all_columns_asterisk",
    literal: "literal",
    identifier: "identifier",
    keyword: "keyword",
    data_type: "data_type",
    parameter: "parameter",
    operator: "operator",
    comma: "comma",
    line_comment: "line_comment",
    block_comment: "block_comment",
    disable_comment: "disable_comment",
} as const

interface BaseNode {
    // 节点前置注释（如 SELECT /* 注释 */ * FROM user 中的注释）
    leadingComments?: CommentNode[]
    // 节点后置注释（如 SELECT * FROM user -- 注释 中的注释）
    trailingComments?: CommentNode[]
}

// 顶级 SQL 语句节点
export interface StatementNode extends BaseNode {
    type: typeof NodeType.statement
    // 语句内的子节点（如 SELECT 子句、FROM 子句等）
    children: AstNode[]
    // 是否以分号结尾（格式化时需还原）
    hasSemicolon: boolean
}

export interface ClauseNode extends BaseNode {
    type: typeof NodeType.clause
    nameKw: KeywordNode
    children: AstNode[]
}

export interface SetOperationNode extends BaseNode {
    type: typeof NodeType.set_operation
    nameKw: KeywordNode
    children: AstNode[]
}

// 函数调用节点
export interface FunctionCallNode extends BaseNode {
    type: typeof NodeType.function_call
    nameKw: KeywordNode
    parenthesis: ParenthesisNode
}

export interface ParameterizedDataTypeNode extends BaseNode {
    type: typeof NodeType.parameterized_data_type
    dataType: DataTypeNode
    parenthesis: ParenthesisNode
}

// <ident>[<expr>]
export interface ArraySubscriptNode extends BaseNode {
    type: typeof NodeType.array_subscript
    array: IdentifierNode | KeywordNode | DataTypeNode
    parenthesis: ParenthesisNode
}

export interface ParenthesisNode extends BaseNode {
    type: typeof NodeType.parenthesis
    children: AstNode[]
    openParen: string
    closeParen: string
}

// BETWEEN <expr1> AND <expr2>
export interface BetweenPredicateNode extends BaseNode {
    type: typeof NodeType.between_predicate
    betweenKw: KeywordNode
    expr1: AstNode[]
    andKw: KeywordNode
    expr2: AstNode[]
}

export interface CaseExpressionNode extends BaseNode {
    type: typeof NodeType.case_expression
    caseKw: KeywordNode
    endKw: KeywordNode
    expr: AstNode[]
    clauses: (CaseWhenNode | CaseElseNode)[]
}

export interface CaseWhenNode extends BaseNode {
    type: typeof NodeType.case_when
    whenKw: KeywordNode
    thenKw: KeywordNode
    condition: AstNode[]
    result: AstNode[]
}

export interface CaseElseNode extends BaseNode {
    type: typeof NodeType.case_else
    elseKw: KeywordNode
    result: AstNode[]
}

// LIMIT <count>
// LIMIT <offset>, <count>
export interface LimitClauseNode extends BaseNode {
    type: typeof NodeType.limit_clause
    limitKw: KeywordNode
    count: AstNode[]
    offset?: AstNode[]
}

// The "*" operator used in SELECT *
export interface AllColumnsAsteriskNode extends BaseNode {
    type: typeof NodeType.all_columns_asterisk
}

export interface LiteralNode extends BaseNode {
    type: typeof NodeType.literal
    text: string
}

export interface PropertyAccessNode extends BaseNode {
    type: typeof NodeType.property_access
    object: AstNode
    operator: string
    property: IdentifierNode | ArraySubscriptNode | AllColumnsAsteriskNode
}

// 标识符节点
export interface IdentifierNode extends BaseNode {
    type: typeof NodeType.identifier
    // 是否带引号
    quoted: boolean
    // 标识符文本（去引号后）
    text: string
}

export interface DataTypeNode extends BaseNode {
    type: typeof NodeType.data_type
    text: string
    raw: string
}

export interface KeywordNode extends BaseNode {
    type: typeof NodeType.keyword
    tokenType: TokenType
    text: string
    raw: string
}

export interface ParameterNode extends BaseNode {
    type: typeof NodeType.parameter
    key?: string
    text: string
}

export interface OperatorNode extends BaseNode {
    type: typeof NodeType.operator
    text: string
}

export interface CommaNode extends BaseNode {
    type: typeof NodeType.comma
}

// 行注释节点（-- 开头）
export interface LineCommentNode extends BaseNode {
    type: typeof NodeType.line_comment
    // 注释内容
    text: string
    // 注释前的空白（格式化时保留缩进）
    precedingWhitespace: string
}

// 块注释节点（/* ... */）
export interface BlockCommentNode extends BaseNode {
    type: typeof NodeType.block_comment
    text: string
    precedingWhitespace: string
}

// 禁用格式化的注释节点（/* sql-formatter-disable */）
export interface DisableCommentNode extends BaseNode {
    type: typeof NodeType.disable_comment
    text: string
    precedingWhitespace: string
}

// 注释节点联合类型
export type CommentNode =
    | LineCommentNode
    | BlockCommentNode
    | DisableCommentNode

// 所有 AST 节点的联合类型（核心）
export type AstNode =
    | ClauseNode
    | SetOperationNode
    | FunctionCallNode
    | ParameterizedDataTypeNode
    | ArraySubscriptNode
    | PropertyAccessNode
    | ParenthesisNode
    | BetweenPredicateNode
    | CaseExpressionNode
    | CaseWhenNode
    | CaseElseNode
    | LimitClauseNode
    | AllColumnsAsteriskNode
    | LiteralNode
    | IdentifierNode
    | DataTypeNode
    | KeywordNode
    | ParameterNode
    | OperatorNode
    | CommaNode
    | LineCommentNode
    | BlockCommentNode
    | DisableCommentNode
