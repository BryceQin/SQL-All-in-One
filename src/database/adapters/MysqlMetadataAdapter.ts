import type { IMetadataAdapter, DatabaseInfo, TableInfo, ViewInfo, FunctionInfo, ProcedureInfo, TriggerInfo, QueryResult, QueryParam, QueryRow } from './IDatabaseAdapter';
import type { IMysqlProtocolSharedContext } from './MysqlSharedContext';

/**
 * MySQL metadata adapter.
 *
 * Implemented as a generic over the shared-context contract so that
 * StarRocks (which reuses the mysql2 driver and exposes metadata through
 * information_schema with the same shape as MySQL) can subclass it via
 * {@link StarrocksMetadataAdapter} and only override the dialect-specific
 * database-filter and unsupported-object behaviour.
 */
export class MysqlMetadataAdapter<TShared extends IMysqlProtocolSharedContext = IMysqlProtocolSharedContext> implements IMetadataAdapter {
    constructor(
        protected shared: TShared,
        protected executeQuery: (sql: string, params?: QueryParam[]) => Promise<QueryResult>
    ) {}

    async listDatabases(): Promise<DatabaseInfo[]> {
        const result = await this.executeQuery('SHOW DATABASES');
        if (result.status !== 'success') {
            return [];
        }

        return result.rows
            .filter((row: QueryRow) => {
                const name = row.Database as string;
                return !this.isSystemDatabase(name);
            })
            .map((row: QueryRow) => ({
                name: row.Database as string,
            }));
    }

    async listSchemas(_database?: string): Promise<string[]> {
        return [];
    }

    async listTables(database?: string, _schema?: string, filter?: string): Promise<TableInfo[]> {
        const db = database ?? this.shared.config?.database;
        if (!db) {
            return [];
        }

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
            rowCount: row.TABLE_ROWS != null ? Number(row.TABLE_ROWS) : undefined,
            comment: row.TABLE_COMMENT as string,
        }));
    }

    async listViews(database?: string, _schema?: string): Promise<ViewInfo[]> {
        const db = database ?? this.shared.config?.database;
        if (!db) {
            return [];
        }

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

    async listFunctions(database?: string, _schema?: string): Promise<FunctionInfo[]> {
        const db = database ?? this.shared.config?.database;
        if (!db) {
            return [];
        }

        const sql = `SELECT ROUTINE_NAME, DTD_IDENTIFIER, ROUTINE_DEFINITION FROM INFORMATION_SCHEMA.ROUTINES WHERE ROUTINE_SCHEMA = ? AND ROUTINE_TYPE = 'FUNCTION' ORDER BY ROUTINE_NAME`;
        const result = await this.executeQuery(sql, [{ value: db }]);
        if (result.status !== 'success') {
            return [];
        }

        return result.rows.map((row: QueryRow) => ({
            name: row.ROUTINE_NAME as string,
            returns: row.DTD_IDENTIFIER as string,
            definition: row.ROUTINE_DEFINITION as string,
        }));
    }

    async listProcedures(database?: string, _schema?: string): Promise<ProcedureInfo[]> {
        const db = database ?? this.shared.config?.database;
        if (!db) {
            return [];
        }

        const sql = `SELECT ROUTINE_NAME, ROUTINE_DEFINITION FROM INFORMATION_SCHEMA.ROUTINES WHERE ROUTINE_SCHEMA = ? AND ROUTINE_TYPE = 'PROCEDURE' ORDER BY ROUTINE_NAME`;
        const result = await this.executeQuery(sql, [{ value: db }]);
        if (result.status !== 'success') {
            return [];
        }

        return result.rows.map((row: QueryRow) => ({
            name: row.ROUTINE_NAME as string,
            definition: row.ROUTINE_DEFINITION as string,
        }));
    }

    async listTriggers(database?: string, _schema?: string): Promise<TriggerInfo[]> {
        const db = database ?? this.shared.config?.database;
        if (!db) {
            return [];
        }

        const sql = `SELECT TRIGGER_NAME, EVENT_MANIPULATION, ACTION_TIMING, ACTION_STATEMENT FROM INFORMATION_SCHEMA.TRIGGERS WHERE TRIGGER_SCHEMA = ? ORDER BY TRIGGER_NAME`;
        const result = await this.executeQuery(sql, [{ value: db }]);
        if (result.status !== 'success') {
            return [];
        }

        return result.rows.map((row: QueryRow) => ({
            name: row.TRIGGER_NAME as string,
            event: row.EVENT_MANIPULATION as string,
            timing: row.ACTION_TIMING as string,
            statement: row.ACTION_STATEMENT as string,
        }));
    }

    /**
     * Returns true if `name` is a built-in system database that should be
     * hidden from {@link listDatabases} results. MySQL filters out
     * information_schema / mysql / performance_schema / sys. Subclasses
     * speaking a MySQL-protocol-compatible dialect (e.g. StarRocks) override
     * this to filter their own system databases.
     */
    protected isSystemDatabase(name: string): boolean {
        return name === 'information_schema' ||
            name === 'mysql' ||
            name === 'performance_schema' ||
            name === 'sys';
    }
}
