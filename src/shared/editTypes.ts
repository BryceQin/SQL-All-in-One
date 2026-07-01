/**
 * Filter condition used by the query result panel to request a re-query with
 * WHERE-clause restrictions.
 */
export interface FilterCondition {
    column: string;
    operator: string;
    value: string;
}

/**
 * Represents a pending in-memory edit on the query result panel before it is
 * flushed to the database.
 */
export interface PendingChange {
    type: 'update' | 'insert' | 'delete';
    table: string;
    primaryKey: Record<string, unknown>;
    changes?: Record<string, { old: unknown; new: unknown }>;
    originalRow?: Record<string, unknown>;
    rowIndex: number;
}

/**
 * Option shown in the foreign-key lookup dropdown of the result panel.
 */
export interface ForeignKeyOption {
    value: unknown;
    displayText: string;
}
