export interface AstNode {
  type: string;
  [key: string]: unknown;
}

export interface SelectNode extends AstNode {
  type: 'select';
  distinct?: boolean;
  columns: SelectColumn[];
  from?: FromItem[];
  where?: unknown;
  groupby?: GroupByClause;
  having?: unknown;
  orderby?: OrderByItem[];
  limit?: LimitClause;
  with?: CteClause[];
  _next?: SelectNode;
  set_op?: string;
}

export interface SelectColumn {
  expr?: unknown;
  as?: string;
  type?: string;
}

export interface FromItem {
  table?: string | AstNode;
  db?: string;
  as?: string;
  join?: string;
  on?: unknown;
  using?: unknown;
  expr?: { ast: AstNode };
  type?: string;
}

export interface GroupByClause {
  columns?: unknown[];
}

export interface OrderByItem {
  expr: unknown;
  type?: string;
}

export interface LimitClause {
  value?: unknown[];
  seperator?: string;
}

export interface CteClause {
  name: string;
  stmt: AstNode;
}

export interface InsertNode extends AstNode {
  type: 'insert';
  table?: unknown;
  columns?: unknown[];
  values?: unknown[];
}

export interface UpdateNode extends AstNode {
  type: 'update';
  table?: unknown[];
  set?: { column: string; value: unknown }[];
  where?: unknown;
}

export interface DeleteNode extends AstNode {
  type: 'delete';
  from?: unknown[];
  where?: unknown;
}

export interface UseNode extends AstNode {
  type: 'use';
  db?: string;
}

export interface CreateNode extends AstNode {
  type: 'create';
  table?: unknown;
  [key: string]: unknown;
}

export interface ColumnRefNode extends AstNode {
  type: 'column_ref';
  table?: string;
  column: string;
}

export interface FunctionCallNode extends AstNode {
  type: 'function';
  name: string;
  args: unknown[];
}

export type ExtendedAst =
  | SelectNode
  | InsertNode
  | UpdateNode
  | DeleteNode
  | UseNode
  | CreateNode
  | ColumnRefNode
  | FunctionCallNode
  | AstNode;
