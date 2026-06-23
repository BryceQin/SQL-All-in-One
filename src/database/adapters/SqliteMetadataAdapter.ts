import type { IMetadataAdapter, DatabaseInfo, TableInfo, ViewInfo, FunctionInfo, ProcedureInfo, TriggerInfo, QueryResult, QueryParam, QueryRow } from './IDatabaseAdapter';

export class SqliteMetadataAdapter implements IMetadataAdapter {
    constructor(
        private executeQuery: (sql: string, params?: QueryParam[]) => Promise<QueryResult>
    ) {}

    async listDatabases(): Promise<DatabaseInfo[]> {
        return [{ name: 'main' }];
    }

    async listSchemas(_database?: string): Promise<string[]> {
        return ['main'];
    }

    async listTables(_database?: string, _schema?: string, filter?: string): Promise<TableInfo[]> {
        let sql = `SELECT name, type FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`;
        const params: QueryParam[] = [];

        if (filter) {
            sql += ` AND name LIKE ?`;
            params.push({ value: `%${filter}%` });
        }

        sql += ` ORDER BY name`;
        const result = await this.executeQuery(sql, params);
        if (result.status !== 'success') {
            return [];
        }

        return result.rows.map((row: QueryRow) => ({
            name: row.name as string,
            type: 'table',
        }));
    }

    async listViews(_database?: string, _schema?: string): Promise<ViewInfo[]> {
        const sql = `SELECT name FROM sqlite_master WHERE type = 'view' ORDER BY name`;
        const result = await this.executeQuery(sql);
        if (result.status !== 'success') {
            return [];
        }

        return result.rows.map((row: QueryRow) => ({
            name: row.name as string,
        }));
    }

    async listFunctions(_database?: string, _schema?: string): Promise<FunctionInfo[]> {
        return [];
    }

    async listProcedures(_database?: string, _schema?: string): Promise<ProcedureInfo[]> {
        return [];
    }

    async listTriggers(_database?: string, _schema?: string): Promise<TriggerInfo[]> {
        const sql = `SELECT name, tbl_name, sql FROM sqlite_master WHERE type = 'trigger' ORDER BY name`;
        const result = await this.executeQuery(sql);
        if (result.status !== 'success') {
            return [];
        }

        return result.rows.map((row: QueryRow) => {
            const sqlText = row.sql as string;
            const timingMatch = sqlText.match(/(?:BEFORE|AFTER|INSTEAD OF)/i);
            const eventMatch = sqlText.match(/(?:INSERT|UPDATE|DELETE)/i);
            return {
                name: row.name as string,
                event: eventMatch ? eventMatch[0].toUpperCase() : 'UNKNOWN',
                timing: timingMatch ? timingMatch[0].toUpperCase() : 'UNKNOWN',
                statement: sqlText,
            };
        });
    }
}
