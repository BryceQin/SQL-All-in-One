import type { IMetadataAdapter, DatabaseInfo, TableInfo, ViewInfo, FunctionInfo, ProcedureInfo, TriggerInfo, QueryResult, QueryParam, QueryRow } from './IDatabaseAdapter';
import type { OracleSharedContext } from './OracleSharedContext';

/**
 * Oracle metadata adapter.
 *
 * Queries the Oracle data dictionary views (all_users, all_tables, all_views,
 * all_source, all_procedures, all_triggers) to enumerate database objects.
 *
 * Oracle has no concept of multiple databases within an instance in the same
 * sense as MySQL/SQL Server; `listDatabases` therefore returns information
 * about the current container (CDB/PDB) rather than a list of databases. The
 * `schema` parameter is used as the owner filter for the other listing
 * methods, falling back to the connected user when not provided.
 */
export class OracleMetadataAdapter implements IMetadataAdapter {
    constructor(
        private shared: OracleSharedContext,
        private executeQuery: (sql: string, params?: QueryParam[]) => Promise<QueryResult>
    ) {}

    async listDatabases(): Promise<DatabaseInfo[]> {
        // Oracle has no multi-database concept in the MySQL/SQL Server sense.
        // Return a single entry describing the current container (CDB/PDB).
        const sql = `SELECT SYS_CONTEXT('USERENV', 'CON_NAME') AS name, SYS_CONTEXT('USERENV', 'DB_NAME') AS db_name FROM dual`;
        const result = await this.executeQuery(sql);
        if (result.status !== 'success' || result.rows.length === 0) {
            return [{ name: this.shared.config?.database ?? 'ORCL' }];
        }

        const row = result.rows[0];
        const name = (row.name as string) || (row.db_name as string) || this.shared.config?.database || 'ORCL';
        return [{ name }];
    }

    async listSchemas(_database?: string): Promise<string[]> {
        const sql = `SELECT username AS username FROM all_users ORDER BY username`;
        const result = await this.executeQuery(sql);
        if (result.status !== 'success') {
            return [];
        }

        return result.rows.map((row: QueryRow) => row.username as string);
    }

    async listTables(_database?: string, schema?: string, filter?: string): Promise<TableInfo[]> {
        const owner = this.resolveOwner(schema);
        let sql = `SELECT table_name, 'BASE TABLE' AS table_type, num_rows AS num_rows FROM all_tables WHERE owner = :1`;
        const params: QueryParam[] = [{ value: owner }];

        if (filter) {
            sql += ` AND table_name LIKE :2`;
            params.push({ value: `%${filter}%` });
        }

        sql += ` ORDER BY table_name`;

        const result = await this.executeQuery(sql, params);
        if (result.status !== 'success') {
            return [];
        }

        return result.rows.map((row: QueryRow) => ({
            name: row.table_name as string,
            type: row.table_type as string,
            rowCount: row.num_rows as number | undefined,
        }));
    }

    async listViews(_database?: string, schema?: string): Promise<ViewInfo[]> {
        const owner = this.resolveOwner(schema);
        const sql = `SELECT view_name FROM all_views WHERE owner = :1 ORDER BY view_name`;
        const result = await this.executeQuery(sql, [{ value: owner }]);
        if (result.status !== 'success') {
            return [];
        }

        return result.rows.map((row: QueryRow) => ({
            name: row.view_name as string,
        }));
    }

    async listFunctions(_database?: string, schema?: string): Promise<FunctionInfo[]> {
        const owner = this.resolveOwner(schema);
        // all_source holds the source text for PL/SQL functions; we aggregate
        // by name to get one row per function.
        const sql = `SELECT name AS function_name FROM all_source WHERE type = 'FUNCTION' AND owner = :1 GROUP BY name ORDER BY name`;
        const result = await this.executeQuery(sql, [{ value: owner }]);
        if (result.status !== 'success') {
            return [];
        }

        return result.rows.map((row: QueryRow) => ({
            name: row.function_name as string,
        }));
    }

    async listProcedures(_database?: string, schema?: string): Promise<ProcedureInfo[]> {
        const owner = this.resolveOwner(schema);
        // all_procedures lists procedures (and methods within types). We filter
        // to top-level procedures owned by the target schema.
        const sql = `SELECT object_name AS procedure_name FROM all_procedures WHERE owner = :1 AND object_type = 'PROCEDURE' ORDER BY object_name`;
        const result = await this.executeQuery(sql, [{ value: owner }]);
        if (result.status !== 'success') {
            return [];
        }

        return result.rows.map((row: QueryRow) => ({
            name: row.procedure_name as string,
        }));
    }

    async listTriggers(_database?: string, schema?: string): Promise<TriggerInfo[]> {
        const owner = this.resolveOwner(schema);
        const sql = `SELECT trigger_name, triggering_event AS event, trigger_type AS timing, trigger_body AS statement FROM all_triggers WHERE owner = :1 ORDER BY trigger_name`;
        const result = await this.executeQuery(sql, [{ value: owner }]);
        if (result.status !== 'success') {
            return [];
        }

        return result.rows.map((row: QueryRow) => ({
            name: row.trigger_name as string,
            event: row.event as string,
            timing: row.timing as string,
            statement: (row.statement as string) ?? '',
        }));
    }

    /**
     * Resolves the owner (schema) to filter by. Falls back to the connected
     * user name when no schema is provided, matching Oracle's default
     * behaviour where users own their own schema.
     */
    private resolveOwner(schema?: string): string {
        if (schema && schema.length > 0) {
            return schema.toUpperCase();
        }
        const fromConfig = this.shared.config?.username;
        if (fromConfig && fromConfig.length > 0) {
            return fromConfig.toUpperCase();
        }
        return 'SYS';
    }
}
