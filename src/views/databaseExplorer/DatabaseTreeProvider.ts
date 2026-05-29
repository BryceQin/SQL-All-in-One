import * as vscode from 'vscode';
import {
    ITreeNode,
    RootTreeNode,
    FavoritesTreeNode,
    FavoriteTreeNode,
    GroupTreeNode,
    ConnectionTreeNode,
    DatabaseTreeNode,
    ObjectGroupTreeNode,
    TableTreeNode,
    ViewTreeNode,
    FunctionTreeNode,
    ProcedureTreeNode,
    TriggerTreeNode,
    ColumnTreeNode,
    IndexTreeNode
} from './treeNodes';
import { ConnectionManager } from '../../database/connection/ConnectionManager';
import { ConnectionConfig } from '../../database/adapters/IDatabaseAdapter';
import { SchemaCache } from '../../database/schema/SchemaCache';
import { getConfigManager } from '../../core/configManager';
import { handleError, ErrorCategory } from '../../core/errorHandler';

interface FavoriteItem {
    connectionId: string;
    connectionName: string;
    database: string;
    objectType: 'table' | 'view';
    objectName: string;
}

export class DatabaseTreeProvider implements vscode.TreeDataProvider<ITreeNode> {
    private _onDidChangeTreeData = new vscode.EventEmitter<ITreeNode | undefined | null>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private context: vscode.ExtensionContext;
    private connectionManager: ConnectionManager;
    private schemaCache: SchemaCache;
    private nodeCache = new Map<string, ITreeNode[]>();
    private favorites: FavoriteItem[] = [];
    private readonly FAVORITES_KEY = 'sql-all-in-one.favorites';

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.connectionManager = ConnectionManager.getInstance();
        this.schemaCache = SchemaCache.getInstance();

        this.loadFavorites();
        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        this.connectionManager.onDidChangeConnections(() => {
            this.refresh();
        });
        
        this.connectionManager.onDidChangeConnectionState(() => {
            this.refresh();
        });
        
        this.connectionManager.onDidChangeActiveConnection(() => {
            this.refresh();
        });
    }

    private async loadFavorites(): Promise<void> {
        const saved = this.context.globalState.get<FavoriteItem[]>(this.FAVORITES_KEY);
        if (saved) {
            this.favorites = saved;
        }
    }

    private async saveFavorites(): Promise<void> {
        await this.context.globalState.update(this.FAVORITES_KEY, this.favorites);
    }

    async addFavorite(
        connectionId: string,
        connectionName: string,
        database: string,
        objectType: 'table' | 'view',
        objectName: string
    ): Promise<void> {
        const exists = this.favorites.some(
            f => f.connectionId === connectionId &&
                 f.database === database &&
                 f.objectType === objectType &&
                 f.objectName === objectName
        );
        
        if (!exists) {
            this.favorites.push({
                connectionId,
                connectionName,
                database,
                objectType,
                objectName
            });
            await this.saveFavorites();
            this.refresh();
        }
    }

    async removeFavorite(
        connectionId: string,
        database: string,
        objectType: 'table' | 'view',
        objectName: string
    ): Promise<void> {
        const index = this.favorites.findIndex(
            f => f.connectionId === connectionId &&
                 f.database === database &&
                 f.objectType === objectType &&
                 f.objectName === objectName
        );
        
        if (index !== -1) {
            this.favorites.splice(index, 1);
            await this.saveFavorites();
            this.refresh();
        }
    }

    getFavorites(): FavoriteItem[] {
        return [...this.favorites];
    }

    refresh(element?: ITreeNode): void {
        if (element) {
            this.nodeCache.delete(element.id);
        } else {
            this.nodeCache.clear();
        }
        this._onDidChangeTreeData.fire(element);
    }

    getTreeItem(element: ITreeNode): vscode.TreeItem {
        const item = new vscode.TreeItem(element.label, element.collapsibleState);
        item.id = element.id;
        item.iconPath = element.iconPath;
        item.contextValue = element.contextValue;
        item.description = element.description;
        item.tooltip = element.tooltip;
        item.command = this.getCommandForNode(element);
        return item;
    }

    private getCommandForNode(element: ITreeNode): vscode.Command | undefined {
        if (element instanceof TableTreeNode) {
            return {
                command: 'sql-all-in-one.viewTableData',
                title: 'View Data',
                arguments: [element]
            };
        }
        if (element instanceof ViewTreeNode) {
            return {
                command: 'sql-all-in-one.viewTableData',
                title: 'View Data',
                arguments: [element]
            };
        }
        if (element instanceof ColumnTreeNode) {
            return {
                command: 'sql-all-in-one.copyColumnName',
                title: 'Copy Name',
                arguments: [element]
            };
        }
        if (element instanceof FavoriteTreeNode) {
            return {
                command: 'sql-all-in-one.revealInExplorer',
                title: 'Reveal',
                arguments: [element]
            };
        }
        return undefined;
    }

    async getChildren(element?: ITreeNode): Promise<ITreeNode[]> {
        if (!element) {
            return this.getRootChildren();
        }

        if (element instanceof RootTreeNode) {
            return this.getRootChildren();
        }

        if (element instanceof FavoritesTreeNode) {
            return this.getFavoriteChildren(element);
        }

        if (element instanceof GroupTreeNode) {
            return this.getGroupChildren(element);
        }

        if (element instanceof ConnectionTreeNode) {
            return this.getConnectionChildren(element);
        }

        if (element instanceof DatabaseTreeNode) {
            return this.getDatabaseChildren(element);
        }

        if (element instanceof ObjectGroupTreeNode) {
            return this.getObjectGroupChildren(element);
        }

        if (element instanceof TableTreeNode) {
            return this.getTableChildren(element);
        }

        return [];
    }

    getParent(element: ITreeNode): ITreeNode | undefined {
        return element.parent;
    }

    private getRootChildren(): ITreeNode[] {
        const children: ITreeNode[] = [];
        
        const root = new RootTreeNode();
        
        children.push(new FavoritesTreeNode(root));
        
        const connections = this.connectionManager.getAllConnections();
        const groupMap = new Map<string, ConnectionConfig[]>();
        
        for (const conn of connections) {
            const groupName = conn.group || 'Default';
            if (!groupMap.has(groupName)) {
                groupMap.set(groupName, []);
            }
            const groupConnections = groupMap.get(groupName);
            if (groupConnections) {
                groupConnections.push(conn);
            }
        }
        
        for (const [groupName] of groupMap) {
            const groupNode = new GroupTreeNode(groupName, undefined, root);
            children.push(groupNode);
        }
        
        return children;
    }

    private getFavoriteChildren(parent: FavoritesTreeNode): ITreeNode[] {
        return this.favorites.map((fav) => {
            const isAvailable = this.connectionManager.getState(fav.connectionId) === 'connected';
            return new FavoriteTreeNode(
                fav.connectionId,
                fav.connectionName,
                fav.database,
                fav.objectName,
                fav.objectType,
                isAvailable,
                parent
            );
        });
    }

    private getGroupChildren(parent: GroupTreeNode): ITreeNode[] {
        const connections = this.connectionManager.getAllConnections();
        const groupConnections = connections.filter((c) => (c.group || 'Default') === parent.groupName);
        
        return groupConnections.map((conn) => {
            const state = this.connectionManager.getState(conn.id);
            return new ConnectionTreeNode(
                conn.id,
                conn.name,
                state,
                conn.color,
                parent
            );
        });
    }

    private async getConnectionChildren(parent: ConnectionTreeNode): Promise<ITreeNode[]> {
        if (parent.connectionState !== 'connected') {
            return [];
        }

        const cacheKey = parent.id;
        const cached = this.nodeCache.get(cacheKey);
        if (cached !== undefined) {
            return cached;
        }

        try {
            const adapter = this.connectionManager.getAdapter(parent.connectionId);
            if (!adapter) {
                return [];
            }

            const databases = await this.schemaCache.getDatabases(parent.connectionId);
            const config = this.connectionManager.getActiveConnection();
            const defaultDatabase = config?.database;

            const showSystemDatabases = getConfigManager().get<boolean>('explorer.showSystemDatabases', false);

            const filteredDatabases = showSystemDatabases
                ? databases
                : databases.filter(db => !this.isSystemDatabase(db.name));

            const children = filteredDatabases.map(db => 
                new DatabaseTreeNode(
                    db.name,
                    parent.connectionId,
                    db.name === defaultDatabase,
                    parent
                )
            );

            this.nodeCache.set(cacheKey, children);
            return children;
        } catch (error) {
            handleError(error, 'DatabaseTreeProvider.getConnectionChildren', ErrorCategory.FEATURE);
            return [];
        }
    }

    private isSystemDatabase(name: string): boolean {
        const systemDatabases = ['information_schema', 'mysql', 'performance_schema', 'sys', 'pg_catalog'];
        return systemDatabases.some(sys => name.toLowerCase() === sys.toLowerCase());
    }

    private async getDatabaseChildren(parent: DatabaseTreeNode): Promise<ITreeNode[]> {
        const cacheKey = parent.id;
        const cached = this.nodeCache.get(cacheKey);
        if (cached !== undefined) {
            return cached;
        }

        try {
            const adapter = this.connectionManager.getAdapter(parent.connectionId);
            if (!adapter) {
                return [];
            }

            const [tables, views, functions, procedures, triggers] = await Promise.all([
                this.schemaCache.getTables(parent.connectionId, parent.databaseName),
                adapter.listViews(parent.databaseName),
                this.schemaCache.getFunctions(parent.connectionId, parent.databaseName),
                this.schemaCache.getProcedures(parent.connectionId, parent.databaseName),
                adapter.listTriggers(parent.databaseName)
            ]);

            const maxTableSize = getConfigManager().get<number>('explorer.maxTableListSize', 500);

            const children: ITreeNode[] = [
                new ObjectGroupTreeNode('tables', parent.connectionId, parent.databaseName, Math.min(tables.length, maxTableSize), parent),
                new ObjectGroupTreeNode('views', parent.connectionId, parent.databaseName, views.length, parent),
                new ObjectGroupTreeNode('functions', parent.connectionId, parent.databaseName, functions.length, parent),
                new ObjectGroupTreeNode('procedures', parent.connectionId, parent.databaseName, procedures.length, parent),
                new ObjectGroupTreeNode('triggers', parent.connectionId, parent.databaseName, triggers.length, parent)
            ];

            this.nodeCache.set(cacheKey, children);
            return children;
        } catch (error) {
            handleError(error, 'DatabaseTreeProvider.getDatabaseChildren', ErrorCategory.FEATURE);
            return [];
        }
    }

    private async getObjectGroupChildren(parent: ObjectGroupTreeNode): Promise<ITreeNode[]> {
        const cacheKey = parent.id;
        const cached = this.nodeCache.get(cacheKey);
        if (cached !== undefined) {
            return cached;
        }

        try {
            const adapter = this.connectionManager.getAdapter(parent.connectionId);
            if (!adapter) {
                return [];
            }

            const children: ITreeNode[] = [];
            const maxTableSize = getConfigManager().get<number>('explorer.maxTableListSize', 500);

            let tables, views, functions, procedures, triggers, limitedTables;
            
            switch (parent.groupType) {
                case 'tables':
                    tables = await this.schemaCache.getTables(parent.connectionId, parent.databaseName);
                    limitedTables = tables.slice(0, maxTableSize);
                    for (const table of limitedTables) {
                        children.push(new TableTreeNode(
                            table.name,
                            parent.connectionId,
                            parent.databaseName,
                            table.rowCount,
                            table.comment,
                            parent
                        ));
                    }
                    break;

                case 'views':
                    views = await adapter.listViews(parent.databaseName);
                    for (const view of views) {
                        children.push(new ViewTreeNode(
                            view.name,
                            parent.connectionId,
                            parent.databaseName,
                            view.comment,
                            parent
                        ));
                    }
                    break;

                case 'functions':
                    functions = await this.schemaCache.getFunctions(parent.connectionId, parent.databaseName);
                    for (const func of functions) {
                        children.push(new FunctionTreeNode(
                            func.name,
                            parent.connectionId,
                            parent.databaseName,
                            func.returns,
                            parent
                        ));
                    }
                    break;

                case 'procedures':
                    procedures = await this.schemaCache.getProcedures(parent.connectionId, parent.databaseName);
                    for (const proc of procedures) {
                        children.push(new ProcedureTreeNode(
                            proc.name,
                            parent.connectionId,
                            parent.databaseName,
                            parent
                        ));
                    }
                    break;

                case 'triggers':
                    triggers = await adapter.listTriggers(parent.databaseName);
                    for (const trigger of triggers) {
                        children.push(new TriggerTreeNode(
                            trigger.name,
                            parent.connectionId,
                            parent.databaseName,
                            trigger.event,
                            trigger.timing,
                            parent
                        ));
                    }
                    break;
            }

            this.nodeCache.set(cacheKey, children);
            return children;
        } catch (error) {
            handleError(error, 'DatabaseTreeProvider.getObjectGroupChildren', ErrorCategory.FEATURE);
            return [];
        }
    }

    private async getTableChildren(parent: TableTreeNode): Promise<ITreeNode[]> {
        const cacheKey = parent.id;
        const cached = this.nodeCache.get(cacheKey);
        if (cached !== undefined) {
            return cached;
        }

        try {
            const adapter = this.connectionManager.getAdapter(parent.connectionId);
            if (!adapter) {
                return [];
            }

            const columns = await this.schemaCache.getColumns(parent.connectionId, parent.databaseName, parent.tableName);
            const children: ITreeNode[] = [];

            for (const column of columns) {
                children.push(new ColumnTreeNode(
                    column,
                    parent.connectionId,
                    parent.databaseName,
                    parent.tableName,
                    parent
                ));
            }

            // Still need adapter for indexes - describeTable returns full structure
            try {
                const structure = await adapter.describeTable(parent.databaseName, parent.tableName);
                if (structure.indexes.length > 0) {
                    for (const index of structure.indexes) {
                        children.push(new IndexTreeNode(
                            index,
                            parent.connectionId,
                            parent.databaseName,
                            parent.tableName,
                            parent
                        ));
                    }
                }
            } catch {
                // Index info is optional, columns are already loaded from cache
            }

            this.nodeCache.set(cacheKey, children);
            return children;
        } catch (error) {
            handleError(error, 'DatabaseTreeProvider.getTableChildren', ErrorCategory.FEATURE);
            return [];
        }
    }
}
