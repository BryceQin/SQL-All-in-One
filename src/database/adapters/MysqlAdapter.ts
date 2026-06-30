import type { ConnectionConfig } from './IDatabaseAdapter';
import { BaseDatabaseAdapter } from './BaseDatabaseAdapter';
import type { IConnectionSubAdapter, IQuerySubAdapter, IMetadataSubAdapter, ISchemaSubAdapter } from './BaseDatabaseAdapter';
import { MysqlSharedContext } from './MysqlSharedContext';
import { MysqlConnectionAdapter } from './MysqlConnectionAdapter';
import { MysqlQueryAdapter } from './MysqlQueryAdapter';
import { MysqlMetadataAdapter } from './MysqlMetadataAdapter';
import { MysqlSchemaAdapter } from './MysqlSchemaAdapter';

export class MysqlAdapter extends BaseDatabaseAdapter {
    private shared: MysqlSharedContext;
    private connectionAdapter: MysqlConnectionAdapter;
    private queryAdapter: MysqlQueryAdapter;
    private metadataAdapter: MysqlMetadataAdapter;
    private schemaAdapter: MysqlSchemaAdapter;

    constructor(config: ConnectionConfig) {
        super(config);
        this.shared = new MysqlSharedContext(this);
        this.connectionAdapter = new MysqlConnectionAdapter(this.shared);
        this.queryAdapter = new MysqlQueryAdapter(this.shared);
        this.metadataAdapter = new MysqlMetadataAdapter(
            this.shared,
            (sql, params) => this.queryAdapter.execute(sql, params)
        );
        this.schemaAdapter = new MysqlSchemaAdapter(
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

    static getDialectMetadata(): import('./IDatabaseAdapter').DialectMetadata {
        return {
            dialect: 'mysql',
            displayName: 'MySQL',
            defaultPort: 3306,
            defaultUsername: 'root',
            iconKey: 'mysql',
            supportsSshTunnel: true,
            supportsSsl: true,
            isFileBased: false
        };
    }
}
