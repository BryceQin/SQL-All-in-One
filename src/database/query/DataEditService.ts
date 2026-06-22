import type { SqlStatement, QueryParam, QueryRow, ColumnMeta } from '../adapters/IDatabaseAdapter';
import type { PendingChange } from '../../views/queryResult/QueryResultPanel';
import type { IDatabaseAdapter } from '../adapters/IDatabaseAdapter';
import { getConnectionManager } from '../connection/ConnectionManager';

/**
 * Generates SQL statements for data editing operations (insert, update, delete).
 * Uses the adapter's quoteIdentifier method for dialect-correct identifier quoting.
 */
export function generateEditSql(
    changes: PendingChange[],
    tableName: string,
    columns: ColumnMeta[],
    rows: QueryRow[],
    quoteIdentifier: (id: string) => string
): SqlStatement[] {
    const statements: SqlStatement[] = [];

    const sorted = [...changes].sort((a, b) => {
        const order: Record<string, number> = { delete: 0, update: 1, insert: 2 };
        return order[a.type] - order[b.type];
    });

    for (const change of sorted) {
        if (change.type === 'delete') {
            statements.push(generateDeleteSql(change, tableName, quoteIdentifier));
        } else if (change.type === 'update') {
            statements.push(generateUpdateSql(change, tableName, quoteIdentifier));
        } else if (change.type === 'insert') {
            const stmt = generateInsertSql(change, tableName, columns, rows, quoteIdentifier);
            if (stmt) {
                statements.push(stmt);
            }
        }
    }

    return statements;
}

function generateDeleteSql(
    change: PendingChange,
    tableName: string,
    quoteIdentifier: (id: string) => string
): SqlStatement {
    const conditions: string[] = [];
    const params: QueryParam[] = [];
    for (const [k, v] of Object.entries(change.primaryKey)) {
        conditions.push(`${quoteIdentifier(k)} = ?`);
        params.push({ name: k, value: v as string | number | boolean | null | undefined });
    }
    return {
        sql: `DELETE FROM ${quoteIdentifier(tableName)} WHERE ${conditions.join(' AND ')}`,
        params,
    };
}

function generateUpdateSql(
    change: PendingChange,
    tableName: string,
    quoteIdentifier: (id: string) => string
): SqlStatement {
    const setClauses: string[] = [];
    const params: QueryParam[] = [];
    for (const [k, v] of Object.entries(change.changes || {})) {
        setClauses.push(`${quoteIdentifier(k)} = ?`);
        params.push({ name: k, value: (v as { old: unknown; new: unknown }).new as string | number | boolean | null | undefined });
    }
    const whereClauses: string[] = [];
    for (const [k, v] of Object.entries(change.primaryKey)) {
        whereClauses.push(`${quoteIdentifier(k)} = ?`);
        params.push({ name: k, value: v as string | number | boolean | null | undefined });
    }
    return {
        sql: `UPDATE ${quoteIdentifier(tableName)} SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')}`,
        params,
    };
}

function generateInsertSql(
    change: PendingChange,
    tableName: string,
    columns: ColumnMeta[],
    rows: QueryRow[],
    quoteIdentifier: (id: string) => string
): SqlStatement | null {
    const row = rows[change.rowIndex];
    if (!row) {
        return null;
    }

    const colNames = columns.map(c => quoteIdentifier(c.name)).join(', ');
    const placeholders = columns.map(() => '?').join(', ');
    const vals: QueryParam[] = columns.map(c => ({
        name: c.name,
        value: row[c.name] as string | number | boolean | null | undefined,
    }));

    return {
        sql: `INSERT INTO ${quoteIdentifier(tableName)} (${colNames}) VALUES (${placeholders})`,
        params: vals,
    };
}

/**
 * Executes a set of SQL statements within a transaction.
 * On failure, rolls back and returns error information.
 */
export async function executeInTransaction(
    adapter: IDatabaseAdapter,
    statements: SqlStatement[]
): Promise<{ success: boolean; errors?: string[] }> {
    try {
        await adapter.beginTransaction();
        for (const stmt of statements) {
            await adapter.execute(stmt.sql, stmt.params);
        }
        await adapter.commit();
        return { success: true };
    } catch (error) {
        try {
            await adapter.rollback();
        } catch (rollbackError) {
            console.error('Rollback failed, disconnecting adapter:', rollbackError);
            try { await adapter.disconnect(); } catch (e) { /* ignore: best-effort cleanup */ console.debug('[SQL All in One] DataEditService disconnect after rollback failure:', e) }
        }
        return { success: false, errors: [(error as Error).message] };
    }
}

/**
 * Helper to get the active adapter from the connection manager.
 * Returns undefined if no active connection or adapter is available.
 */
export function getActiveAdapter(): IDatabaseAdapter | undefined {
    const connectionManager = getConnectionManager();
    const activeConfig = connectionManager.getActiveConnection();
    return activeConfig ? connectionManager.getAdapter(activeConfig.id) : undefined;
}
