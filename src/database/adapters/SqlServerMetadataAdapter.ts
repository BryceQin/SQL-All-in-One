import type { IMetadataAdapter, DatabaseInfo, TableInfo, ViewInfo, FunctionInfo, ProcedureInfo, TriggerInfo, QueryResult, QueryParam, QueryRow } from './IDatabaseAdapter';
import type { SqlServerSharedContext } from './SqlServerSharedContext';

/**
 * SQL Server metadata adapter.
 *
 * Queries the SQL Server catalog views (sys.databases, sys.tables, sys.views,
 * sys.procedures, sys.objects, sys.triggers) to enumerate database objects.
 * The current database context is provided by the shared config; cross-database
 * listing is supported via three-part naming where applicable.
 */
export class SqlServerMetadataAdapter implements IMetadataAdapter {
    constructor(
        private shared: SqlServerSharedContext,
        private executeQuery: (sql: string, params?: QueryParam[]) => Promise<QueryResult>
    ) {}

    async listDatabases(): Promise<DatabaseInfo[]> {
        const result = await this.executeQuery(
            `SELECT name FROM sys.databases WHERE state = 0 ORDER BY name`
        );
        if (result.status !== 'success') {
            return [];
        }

        return result.rows
            .filter((row: QueryRow) => {
                const name = row.name as string;
                // Filter system databases that are not user-accessible.
                return name !== 'master' &&
                    name !== 'tempdb' &&
                    name !== 'model' &&
                    name !== 'msdb';
            })
            .map((row: QueryRow) => ({
                name: row.name as string,
            }));
    }

    async listSchemas(_database?: string): Promise<string[]> {
        const result = await this.executeQuery(
            `SELECT name FROM sys.schemas ORDER BY name`
        );
        if (result.status !== 'success') {
            return [];
        }

        return result.rows
            .map((row: QueryRow) => row.name as string)
            .filter((name: string) => !name.startsWith('sys') && name !== 'INFORMATION_SCHEMA');
    }

    async listTables(database?: string, _schema?: string, filter?: string): Promise<TableInfo[]> {
        const db = database ?? this.shared.config?.database;
        if (!db) {
            return [];
        }

        let sql = `SELECT t.name AS table_name, t.type AS type_desc FROM ${this.quoteIdentifier(db)}.sys.tables t WHERE t.is_ms_shipped = 0`;
        const params: QueryParam[] = [];

        if (filter) {
            sql += ` AND t.name LIKE @filter`;
            params.push({ name: 'filter', value: `%${filter}%` });
        }

        sql += ` ORDER BY t.name`;

        const result = await this.executeQuery(sql, params);
        if (result.status !== 'success') {
            return [];
        }

        return result.rows.map((row: QueryRow) => ({
            name: row.table_name as string,
            type: row.type_desc as string,
        }));
    }

    async listViews(database?: string, _schema?: string): Promise<ViewInfo[]> {
        const db = database ?? this.shared.config?.database;
        if (!db) {
            return [];
        }

        const sql = `SELECT v.name AS view_name FROM ${this.quoteIdentifier(db)}.sys.views v WHERE v.is_ms_shipped = 0 ORDER BY v.name`;
        const result = await this.executeQuery(sql);
        if (result.status !== 'success') {
            return [];
        }

        return result.rows.map((row: QueryRow) => ({
            name: row.view_name as string,
        }));
    }

    async listProcedures(database?: string, _schema?: string): Promise<ProcedureInfo[]> {
        const db = database ?? this.shared.config?.database;
        if (!db) {
            return [];
        }

        const sql = `SELECT p.name AS procedure_name FROM ${this.quoteIdentifier(db)}.sys.procedures p WHERE p.is_ms_shipped = 0 ORDER BY p.name`;
        const result = await this.executeQuery(sql);
        if (result.status !== 'success') {
            return [];
        }

        return result.rows.map((row: QueryRow) => ({
            name: row.procedure_name as string,
        }));
    }

    async listFunctions(database?: string, _schema?: string): Promise<FunctionInfo[]> {
        const db = database ?? this.shared.config?.database;
        if (!db) {
            return [];
        }

        const sql = `SELECT o.name AS function_name, o.type AS type_desc FROM ${this.quoteIdentifier(db)}.sys.objects o WHERE o.type IN ('FN', 'IF', 'TF') AND o.is_ms_shipped = 0 ORDER BY o.name`;
        const result = await this.executeQuery(sql);
        if (result.status !== 'success') {
            return [];
        }

        return result.rows.map((row: QueryRow) => ({
            name: row.function_name as string,
            returns: row.type_desc as string,
        }));
    }

    async listTriggers(database?: string, _schema?: string): Promise<TriggerInfo[]> {
        const db = database ?? this.shared.config?.database;
        if (!db) {
            return [];
        }

        const sql = `SELECT tr.name AS trigger_name, OBJECTPROPERTY(tr.object_id, 'ExecIsUpdateTrigger') AS is_update, OBJECTPROPERTY(tr.object_id, 'ExecIsInsertTrigger') AS is_insert, OBJECTPROPERTY(tr.object_id, 'ExecIsDeleteTrigger') AS is_delete, OBJECTPROPERTY(tr.object_id, 'ExecIsAfterTrigger') AS is_after FROM ${this.quoteIdentifier(db)}.sys.triggers tr WHERE tr.parent_class = 1 AND tr.is_ms_shipped = 0 ORDER BY tr.name`;
        const result = await this.executeQuery(sql);
        if (result.status !== 'success') {
            return [];
        }

        return result.rows.map((row: QueryRow) => {
            const events: string[] = [];
            if (row.is_update) events.push('UPDATE');
            if (row.is_insert) events.push('INSERT');
            if (row.is_delete) events.push('DELETE');
            return {
                name: row.trigger_name as string,
                event: events.join(',') || 'UNKNOWN',
                timing: row.is_after ? 'AFTER' : 'INSTEAD OF',
                statement: '',
            };
        });
    }

    private quoteIdentifier(identifier: string): string {
        return '[' + identifier.replace(/]/g, ']]') + ']';
    }
}
