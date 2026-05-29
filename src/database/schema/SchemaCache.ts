import type { DatabaseInfo, TableInfo, ColumnInfo, FunctionInfo, ProcedureInfo } from '../adapters/IDatabaseAdapter';
import { getConnectionManager } from '../connection/ConnectionManager';
import { getConfigManager } from '../../core/configManager';
import { getContainer, Tokens } from '../../core/diContainer';

interface CacheEntry<T> {
    data: T;
    expireAt: number;
}

type InvalidateScope = 'database' | 'table' | 'column' | 'function' | 'procedure';

export class SchemaCache {
    private databaseCache = new Map<string, CacheEntry<DatabaseInfo[]>>();
    private tableCache = new Map<string, CacheEntry<TableInfo[]>>();
    private columnCache = new Map<string, CacheEntry<ColumnInfo[]>>();
    private functionCache = new Map<string, CacheEntry<FunctionInfo[]>>();
    private procedureCache = new Map<string, CacheEntry<ProcedureInfo[]>>();
    private pendingRequests = new Map<string, Promise<unknown>>();

    private getTtl(type: string): number {
        const cfgMgr = getConfigManager();
        const ttlMap: Record<string, string> = {
            database: 'schemaCache.databaseTtl',
            table: 'schemaCache.tableTtl',
            column: 'schemaCache.columnTtl',
            function: 'schemaCache.functionTtl',
        };
        const key = ttlMap[type];
        if (!key) return 300;
        return cfgMgr.get<number>(key, type === 'database' ? 600 : type === 'column' ? 120 : 300);
    }

    private isExpired<T>(entry: CacheEntry<T> | undefined): entry is undefined {
        if (!entry) return true;
        return Date.now() > entry.expireAt;
    }

    private makeKey(...parts: string[]): string {
        return parts.join(':');
    }

    async getDatabases(connectionId: string): Promise<DatabaseInfo[]> {
        const key = this.makeKey(connectionId);
        const entry = this.databaseCache.get(key);
        if (!this.isExpired(entry)) return entry.data;

        const pending = this.pendingRequests.get(key);
        if (pending) return pending as Promise<DatabaseInfo[]>;

        const request = (async () => {
            try {
                const adapter = getConnectionManager().getAdapter(connectionId);
                if (!adapter) return [];

                const data = await adapter.listDatabases();
                this.databaseCache.set(key, { data, expireAt: Date.now() + this.getTtl('database') * 1000 });
                return data;
            } finally {
                this.pendingRequests.delete(key);
            }
        })();

        this.pendingRequests.set(key, request);
        return request;
    }

    async getTables(connectionId: string, database: string): Promise<TableInfo[]> {
        const key = this.makeKey(connectionId, database);
        const entry = this.tableCache.get(key);
        if (!this.isExpired(entry)) return entry.data;

        const pending = this.pendingRequests.get(key);
        if (pending) return pending as Promise<TableInfo[]>;

        const request = (async () => {
            try {
                const adapter = getConnectionManager().getAdapter(connectionId);
                if (!adapter) return [];

                const data = await adapter.listTables(database);
                this.tableCache.set(key, { data, expireAt: Date.now() + this.getTtl('table') * 1000 });
                return data;
            } finally {
                this.pendingRequests.delete(key);
            }
        })();

        this.pendingRequests.set(key, request);
        return request;
    }

    async getColumns(connectionId: string, database: string, table: string): Promise<ColumnInfo[]> {
        const key = this.makeKey(connectionId, database, table);
        const entry = this.columnCache.get(key);
        if (!this.isExpired(entry)) return entry.data;

        const pending = this.pendingRequests.get(key);
        if (pending) return pending as Promise<ColumnInfo[]>;

        const request = (async () => {
            try {
                const adapter = getConnectionManager().getAdapter(connectionId);
                if (!adapter) return [];

                const structure = await adapter.describeTable(database, table);
                const data = structure.columns;
                this.columnCache.set(key, { data, expireAt: Date.now() + this.getTtl('column') * 1000 });
                return data;
            } finally {
                this.pendingRequests.delete(key);
            }
        })();

        this.pendingRequests.set(key, request);
        return request;
    }

    async getFunctions(connectionId: string, database: string): Promise<FunctionInfo[]> {
        const key = this.makeKey(connectionId, database);
        const entry = this.functionCache.get(key);
        if (!this.isExpired(entry)) return entry.data;

        const pending = this.pendingRequests.get(key);
        if (pending) return pending as Promise<FunctionInfo[]>;

        const request = (async () => {
            try {
                const adapter = getConnectionManager().getAdapter(connectionId);
                if (!adapter) return [];

                const data = await adapter.listFunctions(database);
                this.functionCache.set(key, { data, expireAt: Date.now() + this.getTtl('function') * 1000 });
                return data;
            } finally {
                this.pendingRequests.delete(key);
            }
        })();

        this.pendingRequests.set(key, request);
        return request;
    }

    async getProcedures(connectionId: string, database: string): Promise<ProcedureInfo[]> {
        const key = this.makeKey(connectionId, database);
        const entry = this.procedureCache.get(key);
        if (!this.isExpired(entry)) return entry.data;

        const pending = this.pendingRequests.get(key);
        if (pending) return pending as Promise<ProcedureInfo[]>;

        const request = (async () => {
            try {
                const adapter = getConnectionManager().getAdapter(connectionId);
                if (!adapter) return [];

                const data = await adapter.listProcedures(database);
                this.procedureCache.set(key, { data, expireAt: Date.now() + this.getTtl('function') * 1000 });
                return data;
            } finally {
                this.pendingRequests.delete(key);
            }
        })();

        this.pendingRequests.set(key, request);
        return request;
    }

    invalidate(connectionId: string, scope?: InvalidateScope, database?: string, table?: string): void {
        if (!scope) {
            this.invalidateByPrefix(this.databaseCache, connectionId);
            this.invalidateByPrefix(this.tableCache, connectionId);
            this.invalidateByPrefix(this.columnCache, connectionId);
            this.invalidateByPrefix(this.functionCache, connectionId);
            this.invalidateByPrefix(this.procedureCache, connectionId);
            return;
        }

        switch (scope) {
            case 'database':
                this.databaseCache.delete(this.makeKey(connectionId));
                break;
            case 'table':
                if (database) {
                    this.tableCache.delete(this.makeKey(connectionId, database));
                    this.invalidateByPrefix(this.columnCache, `${connectionId}:${database}`);
                }
                break;
            case 'column':
                if (database && table) {
                    this.columnCache.delete(this.makeKey(connectionId, database, table));
                }
                break;
            case 'function':
                if (database) {
                    this.functionCache.delete(this.makeKey(connectionId, database));
                }
                break;
            case 'procedure':
                if (database) {
                    this.procedureCache.delete(this.makeKey(connectionId, database));
                }
                break;
        }
    }

    private invalidateByPrefix(cache: Map<string, CacheEntry<unknown>>, prefix: string): void {
        for (const key of cache.keys()) {
            if (key === prefix || key.startsWith(prefix + ':')) {
                cache.delete(key);
            }
        }
    }

    async prefetchOnConnect(connectionId: string, database: string): Promise<void> {
        const cfgMgr = getConfigManager();
        const enabled = cfgMgr.get<boolean>('schemaCache.prefetchOnConnect', true);
        if (!enabled) return;

        try {
            const tables = await this.getTables(connectionId, database);
            const columnPromises = tables.slice(0, 20).map(t =>
                this.getColumns(connectionId, database, t.name).catch(() => [])
            );
            await Promise.allSettled(columnPromises);
        } catch {
            // prefetch failure should not affect normal usage
        }
    }

    dispose(): void {
        this.databaseCache.clear();
        this.tableCache.clear();
        this.columnCache.clear();
        this.functionCache.clear();
        this.procedureCache.clear();
        this.pendingRequests.clear();
    }
}

export function createSchemaCache(): SchemaCache {
    return new SchemaCache();
}

export function getSchemaCache(): SchemaCache {
    return getContainer().get<SchemaCache>(Tokens.SchemaCache);
}
