import {
  AstNode,
  SelectNode,
  InsertNode,
  UpdateNode,
  DeleteNode,
  CreateNode,
  ColumnRefNode,
  FunctionCallNode,
  SelectColumn,
  FromItem,
} from './astTypes';
import { AstNodeType } from '../formatter/AstNodeTypes';

export function isAstNode(node: unknown): node is AstNode {
  return node !== null && typeof node === 'object' && 'type' in node;
}

export function isSelectNode(node: unknown): node is SelectNode {
  return isAstNode(node) && node.type === AstNodeType.SELECT;
}

export function isSelectColumn(col: unknown): col is SelectColumn {
  return col !== null && typeof col === 'object';
}

export function isFromItem(item: unknown): item is FromItem {
  return item !== null && typeof item === 'object';
}

export function isInsertNode(node: unknown): node is InsertNode {
  return isAstNode(node) && node.type === 'insert';
}

export function isUpdateNode(node: unknown): node is UpdateNode {
  return isAstNode(node) && node.type === 'update';
}

export function isDeleteNode(node: unknown): node is DeleteNode {
  return isAstNode(node) && node.type === 'delete';
}

export function isCreateNode(node: unknown): node is CreateNode {
  return isAstNode(node) && ['create', 'alter', 'drop'].includes(node.type);
}

export function isColumnRefNode(node: unknown): node is ColumnRefNode {
  return isAstNode(node) && node.type === 'column_ref';
}

export function isFunctionCallNode(node: unknown): node is FunctionCallNode {
  return isAstNode(node) && node.type === 'function';
}

export function asSelectNode(node: unknown): SelectNode | null {
  return isSelectNode(node) ? node : null;
}

export function asAstNodeArray(nodes: unknown): AstNode[] {
  if (Array.isArray(nodes)) {
    return nodes.filter(isAstNode);
  }
  if (isAstNode(nodes)) {
    return [nodes];
  }
  return [];
}

// ============ Typed AST helpers for SelectFormatter ============

export interface TypedSelectStmt {
    with: unknown[] | null
    from: TypedFromItem[] | null
    where: unknown | null
    groupby: unknown[] | null
    having: unknown | null
    orderby: unknown[] | null
    limit: unknown | null
    _next: unknown | null
    columns: TypedSelectColumn[] | null
    distinct: string | null
}

export interface TypedFromItem {
    db: string | null
    table: unknown
    as: string | null
    join: string | null
    on: unknown | null
    type?: string
}

export interface TypedSelectColumn {
    expr: unknown
    as: string | null
    type?: string
}

export function asSelectStmt(stmt: unknown): TypedSelectStmt | null {
    if (stmt == null || typeof stmt !== 'object') return null
    const s = stmt as Record<string, unknown>
    if (s.type !== 'select') return null
    return {
        with: (s.with as unknown[] | null) ?? null,
        from: (s.from as TypedFromItem[] | null) ?? null,
        where: (s.where as unknown | null) ?? null,
        groupby: (s.groupby as unknown[] | null) ?? null,
        having: (s.having as unknown | null) ?? null,
        orderby: (s.orderby as unknown[] | null) ?? null,
        limit: (s.limit as unknown | null) ?? null,
        _next: (s._next as unknown | null) ?? null,
        columns: (s.columns as TypedSelectColumn[] | null) ?? null,
        distinct: (s.distinct as string | null) ?? null,
    }
}
