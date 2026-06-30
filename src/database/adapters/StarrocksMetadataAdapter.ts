import type { FunctionInfo, ProcedureInfo, TriggerInfo, QueryResult, QueryParam } from './IDatabaseAdapter';
import type { StarrocksSharedContext } from './StarrocksSharedContext';
import { MysqlMetadataAdapter } from './MysqlMetadataAdapter';

/**
 * StarRocks metadata adapter.
 *
 * StarRocks is MySQL-protocol compatible and exposes metadata through
 * information_schema with the same shape as MySQL, so listTables / listViews
 * / listSchemas are inherited unchanged from {@link MysqlMetadataAdapter}.
 * Only the dialect-specific behaviour is overridden here:
 *
 *   - {@link listDatabases} filters StarRocks' own system databases
 *     (`_statistics_`, `starrocks_audit_db__`) via {@link isSystemDatabase}.
 *   - StarRocks does not support user-defined functions, stored procedures
 *     or triggers, so {@link listFunctions} / {@link listProcedures} /
 *     {@link listTriggers} return empty arrays.
 */
export class StarrocksMetadataAdapter extends MysqlMetadataAdapter<StarrocksSharedContext> {
    constructor(
        shared: StarrocksSharedContext,
        executeQuery: (sql: string, params?: QueryParam[]) => Promise<QueryResult>
    ) {
        super(shared, executeQuery);
    }

    protected override isSystemDatabase(name: string): boolean {
        // Filter out system databases that exist in StarRocks. StarRocks does
        // not ship the MySQL system schemas (mysql / performance_schema / sys)
        // but exposes its own stats/audit schemas.
        return name === 'information_schema' ||
            name === '_statistics_' ||
            name === 'starrocks_audit_db__';
    }

    override async listFunctions(_database?: string, _schema?: string): Promise<FunctionInfo[]> {
        // StarRocks does not support user-defined functions (UDFs) stored in
        // information_schema. Return an empty list.
        return [];
    }

    override async listProcedures(_database?: string, _schema?: string): Promise<ProcedureInfo[]> {
        // StarRocks does not support stored procedures.
        return [];
    }

    override async listTriggers(_database?: string, _schema?: string): Promise<TriggerInfo[]> {
        // StarRocks does not support triggers.
        return [];
    }
}
