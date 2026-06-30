import type { IMetadataAdapter, DatabaseInfo, TableInfo, ViewInfo, FunctionInfo, ProcedureInfo, TriggerInfo, QueryResult, QueryParam, QueryRow } from './IDatabaseAdapter';
import type { DamengSharedContext } from './DamengSharedContext';

/**
 * Metadata for a sequence object, as exposed by Dameng's `all_sequences`
 * view. Declared locally because the base `IMetadataAdapter` interface does
 * not (yet) require `listSequences`; Dameng surfaces it as an extension
 * method so the UI can show sequences in the explorer tree.
 */
export interface DamengSequenceInfo {
    name: string;
    minValue?: number;
    maxValue?: number;
    increment?: number;
    lastValue?: number;
    cycle?: boolean;
    cache?: number;
}

/**
 * Metadata for a synonym object, as exposed by Dameng's `all_synonyms` view.
 * Declared locally for the same reason as `DamengSequenceInfo`.
 */
export interface DamengSynonymInfo {
    name: string;
    tableOwner?: string;
    tableName: string;
    dbLink?: string;
}

/**
 * Dameng (DM8) metadata adapter.
 *
 * Queries the Dameng data dictionary views (all_users, all_tables,
 * all_views, all_source, all_procedures, all_triggers, all_sequences,
 * all_synonyms) to enumerate database objects. Dameng mirrors Oracle's
 * ALL_* view catalogue for backwards compatibility, so the queries here are
 * the same shape as the OracleMetadataAdapter's, only differing in the
 * placeholder style (ODBC `?` positional vs oracledb `:1` named binds).
 *
 * Dameng has no concept of multiple databases within an instance in the same
 * sense as MySQL/SQL Server; `listDatabases` therefore returns a single
 * entry describing the current container rather than a list of databases.
 * The `schema` parameter is used as the owner filter for the other listing
 * methods, falling back to the connected user when not provided.
 *
 * In addition to the base IMetadataAdapter surface, this adapter exposes
 * `listSequences` and `listSynonyms` which enumerate the all_sequences and
 * all_synonyms views respectively. They are surfaced as extension methods on
 * the adapter (not part of IMetadataAdapter) so the UI can show them in the
 * database explorer tree without changing the shared adapter contract.
 */
export class DamengMetadataAdapter implements IMetadataAdapter {
    constructor(
        private shared: DamengSharedContext,
        private executeQuery: (sql: string, params?: QueryParam[]) => Promise<QueryResult>
    ) {}

    async listDatabases(): Promise<DatabaseInfo[]> {
        // Dameng has no multi-database concept in the MySQL/SQL Server sense.
        // Return a single entry describing the current container.
        const sql = `SELECT SYS_CONTEXT('USERENV', 'CON_NAME') AS name, SYS_CONTEXT('USERENV', 'DB_NAME') AS db_name FROM dual`;
        const result = await this.executeQuery(sql);
        if (result.status !== 'success' || result.rows.length === 0) {
            return [{ name: this.shared.config?.database ?? 'DAMENG' }];
        }

        const row = result.rows[0];
        const name = (row.name as string) || (row.db_name as string) || this.shared.config?.database || 'DAMENG';
        return [{ name }];
    }

    async listSchemas(_database?: string): Promise<string[]> {
        const sql = `SELECT username FROM all_users ORDER BY username`;
        const result = await this.executeQuery(sql);
        if (result.status !== 'success') {
            return [];
        }

        return result.rows.map((row: QueryRow) => row.username as string);
    }

    async listTables(_database?: string, schema?: string, filter?: string): Promise<TableInfo[]> {
        const owner = this.resolveOwner(schema);
        let sql = `SELECT table_name, 'BASE TABLE' AS table_type, num_rows AS num_rows FROM all_tables WHERE owner = ?`;
        const params: QueryParam[] = [{ value: owner }];

        if (filter) {
            sql += ` AND table_name LIKE ?`;
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
            rowCount: row.num_rows != null ? Number(row.num_rows) : undefined,
        }));
    }

    async listViews(_database?: string, schema?: string): Promise<ViewInfo[]> {
        const owner = this.resolveOwner(schema);
        const sql = `SELECT view_name FROM all_views WHERE owner = ? ORDER BY view_name`;
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
        const sql = `SELECT name AS function_name FROM all_source WHERE type = 'FUNCTION' AND owner = ? GROUP BY name ORDER BY name`;
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
        // all_procedures lists procedures (and methods within types). We
        // filter to top-level procedures owned by the target schema.
        const sql = `SELECT object_name AS procedure_name FROM all_procedures WHERE owner = ? AND object_type = 'PROCEDURE' ORDER BY object_name`;
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
        const sql = `SELECT trigger_name, triggering_event AS event, trigger_type AS timing, trigger_body AS statement FROM all_triggers WHERE owner = ? ORDER BY trigger_name`;
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
     * Lists sequences owned by (or accessible to) the given schema.
     *
     * Dameng exposes sequence metadata through all_sequences, mirroring
     * Oracle. The `sequence_owner` column is the owning schema.
     */
    async listSequences(_database?: string, schema?: string): Promise<DamengSequenceInfo[]> {
        const owner = this.resolveOwner(schema);
        const sql = `SELECT sequence_name, min_value, max_value, increment_by AS increment, last_number AS last_value FROM all_sequences WHERE sequence_owner = ? ORDER BY sequence_name`;
        const result = await this.executeQuery(sql, [{ value: owner }]);
        if (result.status !== 'success') {
            return [];
        }

        return result.rows.map((row: QueryRow) => ({
            name: row.sequence_name as string,
            minValue: row.min_value != null ? Number(row.min_value) : undefined,
            maxValue: row.max_value != null ? Number(row.max_value) : undefined,
            increment: row.increment != null ? Number(row.increment) : undefined,
            lastValue: row.last_value != null ? Number(row.last_value) : undefined,
        }));
    }

    /**
     * Lists synonyms owned by (or accessible to) the given schema.
     *
     * Dameng exposes synonym metadata through all_synonyms, mirroring
     * Oracle. The `owner` column is the owning schema; `table_owner` and
     * `table_name` identify the referenced object.
     */
    async listSynonyms(_database?: string, schema?: string): Promise<DamengSynonymInfo[]> {
        const owner = this.resolveOwner(schema);
        const sql = `SELECT synonym_name, table_owner, table_name, db_link FROM all_synonyms WHERE owner = ? ORDER BY synonym_name`;
        const result = await this.executeQuery(sql, [{ value: owner }]);
        if (result.status !== 'success') {
            return [];
        }

        return result.rows.map((row: QueryRow) => ({
            name: row.synonym_name as string,
            tableOwner: row.table_owner as string | undefined,
            tableName: row.table_name as string,
            dbLink: row.db_link as string | undefined,
        }));
    }

    /**
     * Resolves the owner (schema) to filter by. Falls back to the connected
     * user name when no schema is provided, matching Dameng/Oracle's default
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
        return 'SYSDBA';
    }
}
