import type { IMetadataAdapter, DatabaseInfo, TableInfo, ViewInfo, FunctionInfo, ProcedureInfo, TriggerInfo, QueryResult, QueryParam, QueryRow } from './IDatabaseAdapter';

export class PostgresMetadataAdapter implements IMetadataAdapter {
    constructor(
        private executeQuery: (sql: string, params?: QueryParam[]) => Promise<QueryResult>
    ) {}

    async listDatabases(): Promise<DatabaseInfo[]> {
        const sql = `SELECT datname, pg_encoding_to_char(encoding) AS encoding FROM pg_database WHERE datistemplate = false ORDER BY datname`;
        const result = await this.executeQuery(sql);
        if (result.status !== 'success') {
            return [];
        }

        return result.rows
            .filter((row: QueryRow) => {
                const name = row.datname as string;
                return name !== 'postgres';
            })
            .map((row: QueryRow) => ({
                name: row.datname as string,
                charset: row.encoding as string,
            }));
    }

    async listSchemas(_database?: string): Promise<string[]> {
        const sql = `SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT LIKE 'pg_%' AND schema_name NOT IN ('information_schema', 'public') ORDER BY schema_name`;
        const result = await this.executeQuery(sql);
        if (result.status !== 'success') {
            return ['public'];
        }

        const schemas = result.rows.map((row: QueryRow) => row.schema_name as string);
        if (!schemas.includes('public')) {
            schemas.unshift('public');
        }
        return schemas;
    }

    async listTables(_database?: string, schema?: string, filter?: string): Promise<TableInfo[]> {
        const targetSchema = schema ?? 'public';
        let sql = `SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE'`;
        const params: QueryParam[] = [{ value: targetSchema }];

        if (filter) {
            sql += ` AND table_name LIKE $2`;
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
        }));
    }

    async listViews(_database?: string, schema?: string): Promise<ViewInfo[]> {
        const targetSchema = schema ?? 'public';
        const sql = `SELECT table_name FROM information_schema.views WHERE table_schema = $1 ORDER BY table_name`;
        const result = await this.executeQuery(sql, [{ value: targetSchema }]);
        if (result.status !== 'success') {
            return [];
        }

        return result.rows.map((row: QueryRow) => ({
            name: row.table_name as string,
        }));
    }

    async listFunctions(_database?: string, schema?: string): Promise<FunctionInfo[]> {
        const targetSchema = schema ?? 'public';
        const sql = `SELECT routine_name, data_type, routine_definition FROM information_schema.routines WHERE routine_schema = $1 AND routine_type = 'FUNCTION' ORDER BY routine_name`;
        const result = await this.executeQuery(sql, [{ value: targetSchema }]);
        if (result.status !== 'success') {
            return [];
        }

        return result.rows.map((row: QueryRow) => ({
            name: row.routine_name as string,
            returns: row.data_type as string,
            definition: row.routine_definition as string,
        }));
    }

    async listProcedures(_database?: string, schema?: string): Promise<ProcedureInfo[]> {
        const targetSchema = schema ?? 'public';
        const sql = `SELECT routine_name, routine_definition FROM information_schema.routines WHERE routine_schema = $1 AND routine_type = 'PROCEDURE' ORDER BY routine_name`;
        const result = await this.executeQuery(sql, [{ value: targetSchema }]);
        if (result.status !== 'success') {
            return [];
        }

        return result.rows.map((row: QueryRow) => ({
            name: row.routine_name as string,
            definition: row.routine_definition as string,
        }));
    }

    async listTriggers(_database?: string, schema?: string): Promise<TriggerInfo[]> {
        const targetSchema = schema ?? 'public';
        const sql = `SELECT trigger_name, event_manipulation, action_timing, action_statement FROM information_schema.triggers WHERE trigger_schema = $1 ORDER BY trigger_name`;
        const result = await this.executeQuery(sql, [{ value: targetSchema }]);
        if (result.status !== 'success') {
            return [];
        }

        return result.rows.map((row: QueryRow) => ({
            name: row.trigger_name as string,
            event: row.event_manipulation as string,
            timing: row.action_timing as string,
            statement: row.action_statement as string,
        }));
    }
}
