import type { ConnectionConfig } from './IDatabaseAdapter';
import { BaseDatabaseAdapter } from './BaseDatabaseAdapter';
import type { IConnectionSubAdapter, IQuerySubAdapter, IMetadataSubAdapter, ISchemaSubAdapter } from './BaseDatabaseAdapter';
import { SqlServerSharedContext } from './SqlServerSharedContext';
import { SqlServerConnectionAdapter } from './SqlServerConnectionAdapter';
import { SqlServerQueryAdapter } from './SqlServerQueryAdapter';
import { SqlServerMetadataAdapter } from './SqlServerMetadataAdapter';
import { SqlServerSchemaAdapter } from './SqlServerSchemaAdapter';

/**
 * SQL Server database adapter.
 *
 * Assembles the five SQL Server sub-adapters (connection, query, metadata,
 * schema, shared context) and delegates the IDatabaseAdapter surface to them.
 * The mssql driver (wrapping tedious TDS) is loaded lazily via dynamic import
 * inside the sub-adapters so it is only required when a SQL Server connection
 * is actually used.
 */
export class SqlServerAdapter extends BaseDatabaseAdapter {
    private shared: SqlServerSharedContext;
    private connectionAdapter: SqlServerConnectionAdapter;
    private queryAdapter: SqlServerQueryAdapter;
    private metadataAdapter: SqlServerMetadataAdapter;
    private schemaAdapter: SqlServerSchemaAdapter;

    constructor(config: ConnectionConfig) {
        super(config);
        this.shared = new SqlServerSharedContext(this);
        this.connectionAdapter = new SqlServerConnectionAdapter(this.shared);
        this.queryAdapter = new SqlServerQueryAdapter(this.shared);
        this.metadataAdapter = new SqlServerMetadataAdapter(
            this.shared,
            (sql, params) => this.queryAdapter.execute(sql, params)
        );
        this.schemaAdapter = new SqlServerSchemaAdapter(
            this.shared,
            (sql, params) => this.queryAdapter.execute(sql, params),
            (db, schema) => this.metadataAdapter.listTriggers(db, schema)
        );
    }

    // Lifecycle / query / metadata / schema methods are inherited from
    // BaseDatabaseAdapter, which delegates to the sub-adapters below.

    protected getConnectionAdapter(): IConnectionSubAdapter { return this.connectionAdapter; }
    protected getQueryAdapter(): IQuerySubAdapter { return this.queryAdapter; }
    protected getMetadataAdapter(): IMetadataSubAdapter { return this.metadataAdapter; }
    protected getSchemaAdapter(): ISchemaSubAdapter { return this.schemaAdapter; }

    protected override getReapLogPrefix(): string {
        return 'SQL Server';
    }

    static getDialectMetadata(): import('./IDatabaseAdapter').DialectMetadata {
        return {
            dialect: 'sqlserver',
            displayName: 'SQL Server',
            defaultPort: 1433,
            defaultUsername: 'sa',
            iconKey: 'sqlserver',
            supportsSshTunnel: true,
            supportsSsl: true,
            isFileBased: false
        };
    }
}
