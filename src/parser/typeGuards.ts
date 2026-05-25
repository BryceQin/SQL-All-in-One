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
} from './astTypes.extended';
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
