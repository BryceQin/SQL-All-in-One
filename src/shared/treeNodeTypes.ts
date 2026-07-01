/**
 * Discriminated type tag for tree nodes. Used in place of `instanceof`
 * to avoid cross-layer runtime dependencies between `database` and `views`.
 */
export type TreeNodeType =
    | 'root'
    | 'group'
    | 'connection'
    | 'database'
    | 'objectGroup'
    | 'table'
    | 'view'
    | 'function'
    | 'procedure'
    | 'trigger'
    | 'column'
    | 'index'
    | 'routineParameter'
    | 'routineReturn'
    | 'triggerDetail'
    | 'favorites';

/**
 * Minimal structural interface that every tree node satisfies.
 * Used by the database layer to inspect node identity without
 * importing concrete classes from the views layer.
 */
export interface ITreeNode {
    readonly type: TreeNodeType;
    readonly id: string;
    readonly label: string;
    readonly contextValue?: string;
    readonly collapsibleState?: unknown;
    readonly description?: string;
    readonly tooltip?: string;
    readonly children?: ITreeNode[];
    readonly parent?: ITreeNode;
}

export type ConnectionState = 'connected' | 'disconnected' | 'connecting' | 'error';
