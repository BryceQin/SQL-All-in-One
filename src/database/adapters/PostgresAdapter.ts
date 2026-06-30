import type { ConnectionConfig } from './IDatabaseAdapter';
import { BaseDatabaseAdapter } from './BaseDatabaseAdapter';
import type { IConnectionSubAdapter, IQuerySubAdapter, IMetadataSubAdapter, ISchemaSubAdapter } from './BaseDatabaseAdapter';
import { PostgresSharedContext } from './PostgresSharedContext';
import { PostgresConnectionAdapter } from './PostgresConnectionAdapter';
import { PostgresQueryAdapter } from './PostgresQueryAdapter';
import { PostgresMetadataAdapter } from './PostgresMetadataAdapter';
import { PostgresSchemaAdapter } from './PostgresSchemaAdapter';

export class PostgresAdapter extends BaseDatabaseAdapter {
    private shared: PostgresSharedContext;
    private connectionAdapter: PostgresConnectionAdapter;
    private queryAdapter: PostgresQueryAdapter;
    private metadataAdapter: PostgresMetadataAdapter;
    private schemaAdapter: PostgresSchemaAdapter;

    constructor(config: ConnectionConfig) {
        super(config);
        this.shared = new PostgresSharedContext(this);
        this.connectionAdapter = new PostgresConnectionAdapter(this.shared);
        this.queryAdapter = new PostgresQueryAdapter(this.shared);
        this.metadataAdapter = new PostgresMetadataAdapter(
            (sql, params) => this.queryAdapter.execute(sql, params)
        );
        this.schemaAdapter = new PostgresSchemaAdapter(
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
        return 'PG';
    }

    static getDialectMetadata(): import('./IDatabaseAdapter').DialectMetadata {
        return {
            dialect: 'postgresql',
            displayName: 'PostgreSQL',
            defaultPort: 5432,
            defaultUsername: 'postgres',
            iconKey: 'postgresql',
            supportsSshTunnel: true,
            supportsSsl: true,
            isFileBased: false
        };
    }
}
