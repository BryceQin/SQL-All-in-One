import * as vscode from 'vscode';
import type { DatabaseInfo, TableInfo, ColumnInfo, FunctionInfo, ProcedureInfo, ViewInfo } from '../adapters/IDatabaseAdapter';
import { getConnectionManager } from '../connection/ConnectionManager';
import { getConfigManager } from '../../core/configManager';
import { getContainer, Tokens } from '../../core/diContainer';
import { handleError, ErrorCategory } from '../../core/errorHandler';
import { LRUCache } from '../../utils/lruCache';

interface CacheEntry<T> {
    data: T;
    expireAt: number;
}

type InvalidateScope = 'database' | 'table' | 'column' | 'function' | 'procedure' | 'view';

export class SchemaCache {
    private static readonly MAX_ENTRIES_PER_CACHE = 200;
    /**
     * Hard TTL ceiling (10 minutes) enforced by the LRU layer. Long-unused
     * entries are evicted automatically instead of lingering in memory until
     * they are squeezed out by capacity. The shorter per-entry TTLs configured
     * via `cachedFetch` (e.g. 120s for columns) still take precedence for
     * freshness – this is only a backstop so stale entries do not accumulate
     * indefinitely when access is rare.
     */
    private static readonly MAX_AGE_MS = 600000;
    private databaseCache = new LRUCache<string, CacheEntry<DatabaseInfo[]>>({ maxSize: SchemaCache.MAX_ENTRIES_PER_CACHE, maxAge: SchemaCache.MAX_AGE_MS });
    private tableCache = new LRUCache<string, CacheEntry<TableInfo[]>>({ maxSize: SchemaCache.MAX_ENTRIES_PER_CACHE, maxAge: SchemaCache.MAX_AGE_MS });
    private columnCache = new LRUCache<string, CacheEntry<ColumnInfo[]>>({ maxSize: SchemaCache.MAX_ENTRIES_PER_CACHE, maxAge: SchemaCache.MAX_AGE_MS });
    private functionCache = new LRUCache<string, CacheEntry<FunctionInfo[]>>({ maxSize: SchemaCache.MAX_ENTRIES_PER_CACHE, maxAge: SchemaCache.MAX_AGE_MS });
    private procedureCache = new LRUCache<string, CacheEntry<ProcedureInfo[]>>({ maxSize: SchemaCache.MAX_ENTRIES_PER_CACHE, maxAge: SchemaCache.MAX_AGE_MS });
    private viewCache = new LRUCache<string, CacheEntry<ViewInfo[]>>({ maxSize: SchemaCache.MAX_ENTRIES_PER_CACHE, maxAge: SchemaCache.MAX_AGE_MS });
    private pendingRequests = new Map<string, Promise<unknown>>();
    private cachedTtls: Record<string, number> = {};
    private ttlConfigDisposable: vscode.Disposable | undefined;
    private disposed = false;

    constructor() {
        this.loadTtls();
        this.ttlConfigDisposable = getConfigManager().onConfigChange(() => {
            this.loadTtls();
        });
    }

    private loadTtls(): void {
        const cfgMgr = getConfigManager();
        this.cachedTtls = {
            database: cfgMgr.get<number>('schemaCache.databaseTtl', 600),
            table: cfgMgr.get<number>('schemaCache.tableTtl', 300),
            column: cfgMgr.get<number>('schemaCache.columnTtl', 120),
            function: cfgMgr.get<number>('schemaCache.functionTtl', 600),
            procedure: cfgMgr.get<number>('schemaCache.procedureTtl', 600),
            view: cfgMgr.get<number>('schemaCache.tableTtl', 300),
        };
    }

    private getTtl(type: string): number {
        return this.cachedTtls[type] ?? 300;
    }

    private isExpired<T>(entry: CacheEntry<T> | undefined): entry is undefined {
        if (!entry) return true;
        return Date.now() > entry.expireAt;
    }

    private makeKey(...parts: string[]): string {
        return parts.join(':');
    }

    private async cachedFetch<T>(
        cache: LRUCache<string, CacheEntry<T>>,
        cacheKey: string,
        ttlType: string,
        fetcher: () => Promise<T>
    ): Promise<T> {
        // Lazy per-entry expiry check: O(1). The LRU layer enforces a hard
        // maxAge ceiling (MAX_AGE_MS = 600000 / 10 min) so long-unused entries
        // are evicted automatically. On top of that, freshness is tracked via
        // CacheEntry.expireAt using the shorter per-type TTLs (e.g. 120s for
        // columns). We inspect the entry ourselves and evict the single stale
        // entry instead of scanning the whole cache.
        const entry = cache.get(cacheKey);
        if (entry && !this.isExpired(entry)) return entry.data;
        if (entry) {
            cache.delete(cacheKey);
        }

        const pendingKey = `${ttlType}:${cacheKey}`;
        const pending = this.pendingRequests.get(pendingKey);
        if (pending) return pending as Promise<T>;

        const request = (async (): Promise<T> => {
            try {
                const data = await fetcher();
                if (!this.disposed) {
                    cache.set(cacheKey, { data, expireAt: Date.now() + this.getTtl(ttlType) * 1000 });
                }
                return data;
            } finally {
                this.pendingRequests.delete(pendingKey);
            }
        })();

        this.pendingRequests.set(pendingKey, request);
        return request;
    }

    async getDatabases(connectionId: string): Promise<DatabaseInfo[]> {
        return this.cachedFetch(
            this.databaseCache,
            this.makeKey(connectionId),
            'database',
            async () => {
                const adapter = getConnectionManager().getAdapter(connectionId);
                return adapter ? await adapter.metadataAdapter.listDatabases() : [];
            }
        );
    }

    async getTables(connectionId: string, database: string): Promise<TableInfo[]> {
        return this.cachedFetch(
            this.tableCache,
            this.makeKey(connectionId, database),
            'table',
            async () => {
                const adapter = getConnectionManager().getAdapter(connectionId);
                return adapter ? await adapter.metadataAdapter.listTables(database) : [];
            }
        );
    }

    async getColumns(connectionId: string, database: string, table: string): Promise<ColumnInfo[]> {
        return this.cachedFetch(
            this.columnCache,
            this.makeKey(connectionId, database, table),
            'column',
            async () => {
                const adapter = getConnectionManager().getAdapter(connectionId);
                if (!adapter) return [];
                const structure = await adapter.schemaAdapter.describeTable(database, table);
                return structure.columns;
            }
        );
    }

    async getFunctions(connectionId: string, database: string): Promise<FunctionInfo[]> {
        return this.cachedFetch(
            this.functionCache,
            this.makeKey(connectionId, database),
            'function',
            async () => {
                const adapter = getConnectionManager().getAdapter(connectionId);
                return adapter ? await adapter.metadataAdapter.listFunctions(database) : [];
            }
        );
    }

    async getProcedures(connectionId: string, database: string): Promise<ProcedureInfo[]> {
        return this.cachedFetch(
            this.procedureCache,
            this.makeKey(connectionId, database),
            'procedure',
            async () => {
                const adapter = getConnectionManager().getAdapter(connectionId);
                return adapter ? await adapter.metadataAdapter.listProcedures(database) : [];
            }
        );
    }

    async getViews(connectionId: string, database: string): Promise<ViewInfo[]> {
        return this.cachedFetch(
            this.viewCache,
            this.makeKey(connectionId, database),
            'view',
            async () => {
                const adapter = getConnectionManager().getAdapter(connectionId);
                return adapter ? await adapter.metadataAdapter.listViews(database) : [];
            }
        );
    }

    invalidate(connectionId: string, scope?: InvalidateScope, database?: string, table?: string): void {
        if (!scope) {
            this.invalidateByPrefix(this.databaseCache, connectionId);
            this.invalidateByPrefix(this.tableCache, connectionId);
            this.invalidateByPrefix(this.columnCache, connectionId);
            this.invalidateByPrefix(this.functionCache, connectionId);
            this.invalidateByPrefix(this.procedureCache, connectionId);
            this.invalidateByPrefix(this.viewCache, connectionId);
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
            case 'view':
                if (database) {
                    this.viewCache.delete(this.makeKey(connectionId, database));
                }
                break;
        }
    }

    private invalidateByPrefix(cache: LRUCache<string, CacheEntry<unknown>>, prefix: string): void {
        cache.deleteByPrefix(prefix);
    }

    async prefetchOnConnect(connectionId: string, database: string): Promise<void> {
        const cfgMgr = getConfigManager();
        const enabled = cfgMgr.get<boolean>('schemaCache.prefetchOnConnect', true);
        if (!enabled) return;

        try {
            // Phase 1: Fetch table list
            const tables = await this.getTables(connectionId, database);
            // Phase 2: Prefetch columns for the first 5 tables only.
            // Further prefetching happens on-demand when users expand tree nodes.
            const columnPromises = tables.slice(0, 5).map(t =>
                this.getColumns(connectionId, database, t.name).catch(() => [])
            );
            await Promise.allSettled(columnPromises);
        } catch (e) {
            // prefetch failure should not affect normal usage
            handleError(e, 'SchemaCache.prefetchOnConnect', ErrorCategory.FEATURE)
        }
    }

    dispose(): void {
        this.disposed = true;
        this.ttlConfigDisposable?.dispose();
        this.databaseCache.clear();
        this.tableCache.clear();
        this.columnCache.clear();
        this.functionCache.clear();
        this.procedureCache.clear();
        this.viewCache.clear();
        this.pendingRequests.clear();
    }
}

export function createSchemaCache(): SchemaCache {
    return new SchemaCache();
}

export function getSchemaCache(): SchemaCache {
    return getContainer().get<SchemaCache>(Tokens.SchemaCache);
}
