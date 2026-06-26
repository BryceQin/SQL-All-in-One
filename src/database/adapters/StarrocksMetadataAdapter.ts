import type { IMetadataAdapter, DatabaseInfo, TableInfo, ViewInfo, FunctionInfo, ProcedureInfo, TriggerInfo, QueryResult, QueryParam, QueryRow } from './IDatabaseAdapter';
import type { StarrocksSharedContext } from './StarrocksSharedContext';

/**
 * StarRocks metadata adapter.
 *
 * StarRocks is MySQL-protocol compatible and exposes metadata through
 * information_schema (similar to MySQL). StarRocks does not support stored
 * procedures or triggers, so those methods return empty arrays.
 */
export class StarrocksMetadataAdapter implements IMetadataAdapter {
    constructor(
        private shared: StarrocksSharedContext,
        private executeQuery: (sql: string, params?: QueryParam[]) => Promise<QueryResult>
    ) {}

    async listDatabases(): Promise<DatabaseInfo[]> {
        const result = await this.executeQuery('SHOW DATABASES');
        if (result.status !== 'success') {
            return [];
        }

        return result.rows
            .filter((row: QueryRow) => {
                const name = row.Database as string;
                // Filter out system databases that exist in StarRocks
                return name !== 'information_schema' &&
                    name !== '_statistics_' &&
                    name !== 'starrocks_audit_db__';
            })
            .map((row: QueryRow) => ({
                name: row.Database as string,
            }));
    }

    async listSchemas(_database?: string): Promise<string[]> {
        // StarRocks (like MySQL) does not have a schema layer separate from
        // databases. Schemas == databases.
        return [];
    }

    async listTables(database?: string, _schema?: string, filter?: string): Promise<TableInfo[]> {
        const db = database ?? this.shared.config?.database;
        if (!db) {
            return [];
        }

        // StarRocks exposes information_schema.tables with the same shape as MySQL
        let sql = `SELECT TABLE_NAME, TABLE_TYPE, ENGINE, TABLE_ROWS, TABLE_COMMENT FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'`;
        const params: QueryParam[] = [{ value: db }];

        if (filter) {
            sql += ` AND TABLE_NAME LIKE ?`;
            params.push({ value: `%${filter}%` });
        }

        sql += ` ORDER BY TABLE_NAME`;

        const result = await this.executeQuery(sql, params);
        if (result.status !== 'success') {
            return [];
        }

        return result.rows.map((row: QueryRow) => ({
            name: row.TABLE_NAME as string,
            type: row.TABLE_TYPE as string,
            engine: row.ENGINE as string,
            rowCount: row.TABLE_ROWS as number,
            comment: row.TABLE_COMMENT as string,
        }));
    }

    async listViews(database?: string, _schema?: string): Promise<ViewInfo[]> {
        const db = database ?? this.shared.config?.database;
        if (!db) {
            return [];
        }

        // StarRocks supports information_schema.views query like MySQL
        const sql = `SELECT TABLE_NAME, TABLE_COMMENT FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'VIEW' ORDER BY TABLE_NAME`;
        const result = await this.executeQuery(sql, [{ value: db }]);
        if (result.status !== 'success') {
            return [];
        }

        return result.rows.map((row: QueryRow) => ({
            name: row.TABLE_NAME as string,
            comment: row.TABLE_COMMENT as string,
        }));
    }

    async listFunctions(_database?: string, _schema?: string): Promise<FunctionInfo[]> {
        // StarRocks does not support user-defined functions (UDFs) stored in
        // information_schema. Return an empty list.
        return [];
    }

    async listProcedures(_database?: string, _schema?: string): Promise<ProcedureInfo[]> {
        // StarRocks does not support stored procedures.
        return [];
    }

    async listTriggers(_database?: string, _schema?: string): Promise<TriggerInfo[]> {
        // StarRocks does not support triggers.
        return [];
    }
}
