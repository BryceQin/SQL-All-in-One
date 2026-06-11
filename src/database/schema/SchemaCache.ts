import * as vscode from 'vscode';
import type { DatabaseInfo, TableInfo, ColumnInfo, FunctionInfo, ProcedureInfo, ViewInfo } from '../adapters/IDatabaseAdapter';
import { getConnectionManager } from '../connection/ConnectionManager';
import { getConfigManager } from '../../core/configManager';
import { getContainer, Tokens } from '../../core/diContainer';

interface CacheEntry<T> {
    data: T;
    expireAt: number;
}

type InvalidateScope = 'database' | 'table' | 'column' | 'function' | 'procedure' | 'view';

export class SchemaCache {
    private databaseCache = new Map<string, CacheEntry<DatabaseInfo[]>>();
    private tableCache = new Map<string, CacheEntry<TableInfo[]>>();
    private columnCache = new Map<string, CacheEntry<ColumnInfo[]>>();
    private functionCache = new Map<string, CacheEntry<FunctionInfo[]>>();
    private procedureCache = new Map<string, CacheEntry<ProcedureInfo[]>>();
    private viewCache = new Map<string, CacheEntry<ViewInfo[]>>();
    private pendingRequests = new Map<string, Promise<unknown>>();
    private cachedTtls: Record<string, number> = {};
    private ttlConfigDisposable: vscode.Disposable | undefined;

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
        cache: Map<string, CacheEntry<T>>,
        cacheKey: string,
        ttlType: string,
        fetcher: () => Promise<T>
    ): Promise<T> {
        const entry = cache.get(cacheKey);
        if (!this.isExpired(entry)) return entry.data;

        const pending = this.pendingRequests.get(cacheKey);
        if (pending) return pending as Promise<T>;

        const request = (async (): Promise<T> => {
            try {
                const data = await fetcher();
                cache.set(cacheKey, { data, expireAt: Date.now() + this.getTtl(ttlType) * 1000 });
                return data;
            } finally {
                this.pendingRequests.delete(cacheKey);
            }
        })();

        this.pendingRequests.set(cacheKey, request);
        return request;
    }

    async getDatabases(connectionId: string): Promise<DatabaseInfo[]> {
        return this.cachedFetch(
            this.databaseCache,
            this.makeKey(connectionId),
            'database',
            async () => {
                const adapter = getConnectionManager().getAdapter(connectionId);
                return adapter ? await adapter.listDatabases() : [];
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
                return adapter ? await adapter.listTables(database) : [];
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
                const structure = await adapter.describeTable(database, table);
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
                return adapter ? await adapter.listFunctions(database) : [];
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
                return adapter ? await adapter.listProcedures(database) : [];
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
                return adapter ? await adapter.listViews(database) : [];
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

    private invalidateByPrefix(cache: Map<string, CacheEntry<unknown>>, prefix: string): void {
        for (const key of [...cache.keys()]) {
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
