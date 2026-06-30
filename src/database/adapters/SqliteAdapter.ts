import type { ConnectionConfig } from './IDatabaseAdapter';
import { BaseDatabaseAdapter } from './BaseDatabaseAdapter';
import type { IConnectionSubAdapter, IQuerySubAdapter, IMetadataSubAdapter, ISchemaSubAdapter } from './BaseDatabaseAdapter';
import { SqliteSharedContext } from './SqliteSharedContext';
import { SqliteConnectionAdapter } from './SqliteConnectionAdapter';
import { SqliteQueryAdapter } from './SqliteQueryAdapter';
import { SqliteMetadataAdapter } from './SqliteMetadataAdapter';
import { SqliteSchemaAdapter } from './SqliteSchemaAdapter';

export class SqliteAdapter extends BaseDatabaseAdapter {
    private shared: SqliteSharedContext;
    private connectionAdapter: SqliteConnectionAdapter;
    private queryAdapter: SqliteQueryAdapter;
    private metadataAdapter: SqliteMetadataAdapter;
    private schemaAdapter: SqliteSchemaAdapter;

    constructor(config: ConnectionConfig) {
        super(config);
        this.shared = new SqliteSharedContext(this);
        this.connectionAdapter = new SqliteConnectionAdapter(this.shared);
        this.queryAdapter = new SqliteQueryAdapter(this.shared);
        this.metadataAdapter = new SqliteMetadataAdapter(
            (sql, params) => this.queryAdapter.execute(sql, params)
        );
        this.schemaAdapter = new SqliteSchemaAdapter(
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

    /**
     * SQLite has a single in-process connection (better-sqlite3), not a
     * network pool. Reap unconditionally when invoked, mirroring the prior
     * SQLite-only behaviour.
     */
    protected override async reapIdleConnections(_idleTimeout: number): Promise<void> {
        if (!this.isConnected_) return;
        try {
            await this.connectionAdapter.reapIdleConnections();
        } catch (e) {
            console.debug('[SQL All in One] SQLite reap idle connections error:', e);
        }
    }

    static getDialectMetadata(): import('./IDatabaseAdapter').DialectMetadata {
        return {
            dialect: 'sqlite',
            displayName: 'SQLite',
            defaultPort: 0,
            defaultUsername: '',
            iconKey: 'sqlite',
            supportsSshTunnel: false,
            supportsSsl: false,
            isFileBased: true
        };
    }
}
