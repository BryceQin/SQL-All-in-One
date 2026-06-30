import type { ConnectionConfig } from './IDatabaseAdapter';
import { BaseDatabaseAdapter } from './BaseDatabaseAdapter';
import type { IConnectionSubAdapter, IQuerySubAdapter, IMetadataSubAdapter, ISchemaSubAdapter } from './BaseDatabaseAdapter';
import { StarrocksSharedContext } from './StarrocksSharedContext';
import { StarrocksConnectionAdapter } from './StarrocksConnectionAdapter';
import { StarrocksQueryAdapter } from './StarrocksQueryAdapter';
import { StarrocksMetadataAdapter } from './StarrocksMetadataAdapter';
import { StarrocksSchemaAdapter } from './StarrocksSchemaAdapter';

/**
 * StarRocks database adapter.
 *
 * StarRocks is MySQL-protocol compatible, so this adapter reuses the mysql2
 * driver. Metadata and schema queries are adapted to StarRocks-specific
 * behavior (no procedures/triggers/foreign keys, EXPLAIN returns text).
 */
export class StarrocksAdapter extends BaseDatabaseAdapter {
    private shared: StarrocksSharedContext;
    private connectionAdapter: StarrocksConnectionAdapter;
    private queryAdapter: StarrocksQueryAdapter;
    private metadataAdapter: StarrocksMetadataAdapter;
    private schemaAdapter: StarrocksSchemaAdapter;

    constructor(config: ConnectionConfig) {
        super(config);
        this.shared = new StarrocksSharedContext(this);
        this.connectionAdapter = new StarrocksConnectionAdapter(this.shared);
        this.queryAdapter = new StarrocksQueryAdapter(this.shared);
        this.metadataAdapter = new StarrocksMetadataAdapter(
            this.shared,
            (sql, params) => this.queryAdapter.execute(sql, params)
        );
        this.schemaAdapter = new StarrocksSchemaAdapter(
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
        return 'StarRocks';
    }

    static getDialectMetadata(): import('./IDatabaseAdapter').DialectMetadata {
        return {
            dialect: 'starrocks',
            displayName: 'StarRocks',
            defaultPort: 9030,
            defaultUsername: 'root',
            iconKey: 'starrocks',
            supportsSshTunnel: true,
            supportsSsl: true,
            isFileBased: false
        };
    }
}
