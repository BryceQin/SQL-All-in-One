import type { ConnectionConfig } from './IDatabaseAdapter';
import { BaseDatabaseAdapter } from './BaseDatabaseAdapter';
import type { IConnectionSubAdapter, IQuerySubAdapter, IMetadataSubAdapter, ISchemaSubAdapter } from './BaseDatabaseAdapter';
import { DamengSharedContext } from './DamengSharedContext';
import { DamengConnectionAdapter } from './DamengConnectionAdapter';
import { DamengQueryAdapter } from './DamengQueryAdapter';
import { DamengMetadataAdapter } from './DamengMetadataAdapter';
import { DamengSchemaAdapter } from './DamengSchemaAdapter';

/**
 * Dameng (DM8) database adapter.
 *
 * Assembles the five Dameng sub-adapters (connection, query, metadata,
 * schema, shared context) and delegates the IDatabaseAdapter surface to
 * them. Dameng has no official Node.js driver, so the adapter bridges to the
 * database via the `odbc` npm package (2.4.x) together with the Dameng DM8
 * ODBC driver. The odbc driver is loaded lazily via dynamic import inside
 * the sub-adapters so it is only required when a Dameng connection is
 * actually used and stays in the esbuild `external` list.
 *
 * Dameng is largely Oracle-compatible at the metadata layer (ALL_* views,
 * DBMS_METADATA, v$session, etc.), so the metadata/schema sub-adapters
 * mirror the OracleAdapter structure and only differ in placeholder style
 * (ODBC `?` positional vs oracledb `:1` named binds).
 */
export class DamengAdapter extends BaseDatabaseAdapter {
    private shared: DamengSharedContext;
    private connectionAdapter: DamengConnectionAdapter;
    private queryAdapter: DamengQueryAdapter;
    private metadataAdapter: DamengMetadataAdapter;
    private schemaAdapter: DamengSchemaAdapter;

    constructor(config: ConnectionConfig) {
        super(config);
        this.shared = new DamengSharedContext(this);
        this.connectionAdapter = new DamengConnectionAdapter(this.shared);
        this.queryAdapter = new DamengQueryAdapter(this.shared);
        this.metadataAdapter = new DamengMetadataAdapter(
            this.shared,
            (sql, params) => this.queryAdapter.execute(sql, params)
        );
        this.schemaAdapter = new DamengSchemaAdapter(
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
        return 'Dameng';
    }

    static getDialectMetadata(): import('./IDatabaseAdapter').DialectMetadata {
        return {
            dialect: 'dameng',
            displayName: '达梦 DM',
            defaultPort: 5236,
            defaultUsername: 'SYSDBA',
            iconKey: 'dameng',
            supportsSshTunnel: true,
            supportsSsl: false,
            isFileBased: false
        };
    }
}
