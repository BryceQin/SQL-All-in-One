import * as vscode from 'vscode';
import { ColumnInfo, IndexInfo } from '../../database/adapters/IDatabaseAdapter';
import { t } from '../../i18n';

export type TreeNodeType =
    | 'root'
    | 'group'
    | 'connection'
    | 'database'
    | 'objectGroup'
    | 'table'
    | 'view'
    | 'function'
    | 'procedure'
    | 'trigger'
    | 'column'
    | 'index'
    | 'favorites';

export interface ITreeNode {
    readonly type: TreeNodeType;
    readonly id: string;
    readonly label: string;
    readonly iconPath?: vscode.ThemeIcon | string;
    readonly contextValue?: string;
    readonly collapsibleState?: vscode.TreeItemCollapsibleState;
    readonly description?: string;
    readonly tooltip?: string;
    readonly children?: ITreeNode[];
    readonly parent?: ITreeNode;
}

export abstract class BaseTreeNode implements ITreeNode {
    abstract readonly type: TreeNodeType;
    abstract readonly id: string;
    abstract readonly label: string;
    abstract readonly contextValue?: string;
    
    readonly iconPath?: vscode.ThemeIcon | string;
    readonly collapsibleState?: vscode.TreeItemCollapsibleState;
    readonly description?: string;
    readonly tooltip?: string;
    readonly children?: ITreeNode[];
    readonly parent?: ITreeNode;
    
    constructor(options?: {
        iconPath?: vscode.ThemeIcon | string;
        collapsibleState?: vscode.TreeItemCollapsibleState;
        description?: string;
        tooltip?: string;
        children?: ITreeNode[];
        parent?: ITreeNode;
    }) {
        this.iconPath = options?.iconPath;
        this.collapsibleState = options?.collapsibleState;
        this.description = options?.description;
        this.tooltip = options?.tooltip;
        this.children = options?.children;
        this.parent = options?.parent;
    }
}

export class RootTreeNode extends BaseTreeNode {
    readonly type: TreeNodeType = 'root';
    readonly id: string = 'root';
    readonly label: string = t('explorer.rootLabel');
    readonly contextValue?: string = 'root';
    override readonly collapsibleState?: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.Expanded;
}

export class FavoritesTreeNode extends BaseTreeNode {
    readonly type: TreeNodeType = 'favorites';
    readonly id: string = 'favorites';
    readonly label: string = t('explorer.favorites');
    readonly contextValue?: string = 'favorites';
    override readonly collapsibleState?: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
    override readonly iconPath: vscode.ThemeIcon = new vscode.ThemeIcon('star-full');
    
    constructor(parent?: ITreeNode) {
        super({ parent });
    }
}

export class GroupTreeNode extends BaseTreeNode {
    readonly type: TreeNodeType = 'group';
    readonly id: string;
    readonly label: string;
    readonly contextValue?: string = 'group';
    override readonly collapsibleState?: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
    readonly groupName: string;
    readonly color?: string;
    
    constructor(groupName: string, color?: string, parent?: ITreeNode) {
        super({
            iconPath: new vscode.ThemeIcon('folder'),
            parent,
            tooltip: t('explorer.group', groupName)
        });
        this.groupName = groupName;
        this.label = groupName;
        this.id = `group-${groupName}`;
        this.color = color;
    }
}

export type ConnectionState = 'connected' | 'disconnected' | 'connecting' | 'error';

export class ConnectionTreeNode extends BaseTreeNode {
    readonly type: TreeNodeType = 'connection';
    readonly id: string;
    readonly label: string;
    readonly contextValue: string;
    readonly connectionId: string;
    readonly connectionName: string;
    readonly connectionState: ConnectionState;
    readonly color?: string;
    
    constructor(connectionId: string, connectionName: string, state: ConnectionState, color?: string, parent?: ITreeNode) {
        let iconPath: vscode.ThemeIcon;
        let description: string | undefined;
        let contextValue: string;
        
        switch (state) {
            case 'connected':
                iconPath = new vscode.ThemeIcon('plug');
                description = t('explorer.connected');
                contextValue = 'connectionConnected';
                break;
            case 'disconnected':
                iconPath = new vscode.ThemeIcon('circle-outline');
                description = t('explorer.disconnected');
                contextValue = 'connectionDisconnected';
                break;
            case 'connecting':
                iconPath = new vscode.ThemeIcon('sync~spin');
                description = t('explorer.connecting');
                contextValue = 'connectionConnecting';
                break;
            case 'error':
                iconPath = new vscode.ThemeIcon('error');
                description = t('explorer.connectionError');
                contextValue = 'connectionError';
                break;
        }
        
        super({
            iconPath,
            collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
            description,
            parent,
            tooltip: `${connectionName} - ${description}`
        });
        
        this.connectionId = connectionId;
        this.connectionName = connectionName;
        this.label = connectionName;
        this.id = `connection-${connectionId}`;
        this.connectionState = state;
        this.color = color;
        this.contextValue = contextValue;
    }
}

export class DatabaseTreeNode extends BaseTreeNode {
    readonly type: TreeNodeType = 'database';
    readonly id: string;
    readonly label: string;
    readonly contextValue?: string = 'database';
    readonly databaseName: string;
    readonly connectionId: string;
    readonly isDefault: boolean;
    
    constructor(databaseName: string, connectionId: string, isDefault = false, parent?: ITreeNode) {
        super({
            iconPath: new vscode.ThemeIcon('database'),
            collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
            parent,
            tooltip: t('explorer.database', databaseName),
            description: isDefault ? t('explorer.default') : undefined
        });
        this.databaseName = databaseName;
        this.connectionId = connectionId;
        this.label = databaseName;
        this.id = `database-${connectionId}-${databaseName}`;
        this.isDefault = isDefault;
    }
}

export type ObjectGroupType = 'tables' | 'views' | 'functions' | 'procedures' | 'triggers';

export class ObjectGroupTreeNode extends BaseTreeNode {
    readonly type: TreeNodeType = 'objectGroup';
    readonly id: string;
    readonly label: string;
    readonly contextValue?: string = 'objectGroup';
    readonly groupType: ObjectGroupType;
    readonly connectionId: string;
    readonly databaseName: string;
    readonly count: number;
    
    constructor(
        groupType: ObjectGroupType,
        connectionId: string,
        databaseName: string,
        count = 0,
        parent?: ITreeNode
    ) {
        let iconPath: vscode.ThemeIcon;
        let label: string;
        
        switch (groupType) {
            case 'tables':
                iconPath = new vscode.ThemeIcon('table');
                label = t('explorer.tables');
                break;
            case 'views':
                iconPath = new vscode.ThemeIcon('eye');
                label = t('explorer.views');
                break;
            case 'functions':
                iconPath = new vscode.ThemeIcon('zap');
                label = t('explorer.functions');
                break;
            case 'procedures':
                iconPath = new vscode.ThemeIcon('settings-gear');
                label = t('explorer.procedures');
                break;
            case 'triggers':
                iconPath = new vscode.ThemeIcon('bell');
                label = t('explorer.triggers');
                break;
        }
        
        super({
            iconPath,
            collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
            description: t('explorer.objectGroupCount', String(count)),
            parent,
            tooltip: t('explorer.objectGroupTooltip', label, String(count))
        });
        
        this.groupType = groupType;
        this.connectionId = connectionId;
        this.databaseName = databaseName;
        this.label = label;
        this.id = `object-group-${connectionId}-${databaseName}-${groupType}`;
        this.count = count;
    }
}

export class TableTreeNode extends BaseTreeNode {
    readonly type: TreeNodeType = 'table';
    readonly id: string;
    readonly label: string;
    readonly contextValue?: string = 'table';
    readonly tableName: string;
    readonly connectionId: string;
    readonly databaseName: string;
    readonly rowCount?: number;
    readonly comment?: string;
    
    constructor(
        tableName: string,
        connectionId: string,
        databaseName: string,
        rowCount?: number,
        comment?: string,
        parent?: ITreeNode
    ) {
        super({
            iconPath: new vscode.ThemeIcon('table'),
            collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
            description: rowCount !== undefined ? t('explorer.rows', String(rowCount)) : undefined,
            parent,
            tooltip: comment ? `${t('explorer.table', tableName)}\n${comment}` : t('explorer.table', tableName)
        });
        
        this.tableName = tableName;
        this.connectionId = connectionId;
        this.databaseName = databaseName;
        this.label = tableName;
        this.id = `table-${connectionId}-${databaseName}-${tableName}`;
        this.rowCount = rowCount;
        this.comment = comment;
    }
}

export class ViewTreeNode extends BaseTreeNode {
    readonly type: TreeNodeType = 'view';
    readonly id: string;
    readonly label: string;
    readonly contextValue?: string = 'view';
    readonly viewName: string;
    readonly connectionId: string;
    readonly databaseName: string;
    readonly comment?: string;
    
    constructor(
        viewName: string,
        connectionId: string,
        databaseName: string,
        comment?: string,
        parent?: ITreeNode
    ) {
        super({
            iconPath: new vscode.ThemeIcon('eye'),
            collapsibleState: vscode.TreeItemCollapsibleState.None,
            parent,
            tooltip: comment ? `${t('explorer.view', viewName)}\n${comment}` : t('explorer.view', viewName)
        });
        
        this.viewName = viewName;
        this.connectionId = connectionId;
        this.databaseName = databaseName;
        this.label = viewName;
        this.id = `view-${connectionId}-${databaseName}-${viewName}`;
        this.comment = comment;
    }
}

export class FunctionTreeNode extends BaseTreeNode {
    readonly type: TreeNodeType = 'function';
    readonly id: string;
    readonly label: string;
    readonly contextValue?: string = 'function';
    readonly functionName: string;
    readonly connectionId: string;
    readonly databaseName: string;
    readonly returns?: string;
    
    constructor(
        functionName: string,
        connectionId: string,
        databaseName: string,
        returns?: string,
        parent?: ITreeNode
    ) {
        super({
            iconPath: new vscode.ThemeIcon('zap'),
            collapsibleState: vscode.TreeItemCollapsibleState.None,
            description: returns,
            parent,
            tooltip: returns ? `${t('explorer.function', functionName)}\n${t('explorer.returns', returns)}` : t('explorer.function', functionName)
        });
        
        this.functionName = functionName;
        this.connectionId = connectionId;
        this.databaseName = databaseName;
        this.label = functionName;
        this.id = `function-${connectionId}-${databaseName}-${functionName}`;
        this.returns = returns;
    }
}

export class ProcedureTreeNode extends BaseTreeNode {
    readonly type: TreeNodeType = 'procedure';
    readonly id: string;
    readonly label: string;
    readonly contextValue?: string = 'procedure';
    readonly procedureName: string;
    readonly connectionId: string;
    readonly databaseName: string;
    
    constructor(
        procedureName: string,
        connectionId: string,
        databaseName: string,
        parent?: ITreeNode
    ) {
        super({
            iconPath: new vscode.ThemeIcon('settings-gear'),
            collapsibleState: vscode.TreeItemCollapsibleState.None,
            parent,
            tooltip: t('explorer.procedure', procedureName)
        });
        
        this.procedureName = procedureName;
        this.connectionId = connectionId;
        this.databaseName = databaseName;
        this.label = procedureName;
        this.id = `procedure-${connectionId}-${databaseName}-${procedureName}`;
    }
}

export class TriggerTreeNode extends BaseTreeNode {
    readonly type: TreeNodeType = 'trigger';
    readonly id: string;
    readonly label: string;
    readonly contextValue?: string = 'trigger';
    readonly triggerName: string;
    readonly connectionId: string;
    readonly databaseName: string;
    readonly event?: string;
    readonly timing?: string;
    
    constructor(
        triggerName: string,
        connectionId: string,
        databaseName: string,
        event?: string,
        timing?: string,
        parent?: ITreeNode
    ) {
        super({
            iconPath: new vscode.ThemeIcon('bell'),
            collapsibleState: vscode.TreeItemCollapsibleState.None,
            description: event ? `${timing || ''} ${event}`.trim() : undefined,
            parent,
            tooltip: t('explorer.trigger', triggerName)
        });
        
        this.triggerName = triggerName;
        this.connectionId = connectionId;
        this.databaseName = databaseName;
        this.label = triggerName;
        this.id = `trigger-${connectionId}-${databaseName}-${triggerName}`;
        this.event = event;
        this.timing = timing;
    }
}

export class ColumnTreeNode extends BaseTreeNode {
    readonly type: TreeNodeType = 'column';
    readonly id: string;
    readonly label: string;
    readonly contextValue?: string = 'column';
    readonly columnInfo: ColumnInfo;
    readonly connectionId: string;
    readonly databaseName: string;
    readonly tableName: string;
    
    constructor(
        columnInfo: ColumnInfo,
        connectionId: string,
        databaseName: string,
        tableName: string,
        parent?: ITreeNode
    ) {
        let iconPath: vscode.ThemeIcon;
        
        if (columnInfo.isPrimaryKey) {
            iconPath = new vscode.ThemeIcon('key');
        } else if (columnInfo.isUnique) {
            iconPath = new vscode.ThemeIcon('shield');
        } else if (columnInfo.referencedTable) {
            iconPath = new vscode.ThemeIcon('link');
        } else {
            iconPath = new vscode.ThemeIcon('circle-small-filled');
        }
        
        const typeDisplay = columnInfo.length
            ? `${columnInfo.type}(${columnInfo.length})`
            : columnInfo.type;
        
        const tags: string[] = [];
        if (columnInfo.isPrimaryKey) tags.push(t('explorer.tagPK'));
        if (columnInfo.isUnique) tags.push(t('explorer.tagUK'));
        if (columnInfo.isAutoIncrement) tags.push(t('explorer.tagAI'));
        if (!columnInfo.nullable) tags.push(t('explorer.tagNotNull'));
        const description = tags.length > 0 ? `${typeDisplay} ${tags.join(' ')}` : typeDisplay;
        
        const tooltipParts: string[] = [
            t('explorer.column', columnInfo.name),
            t('explorer.type', typeDisplay),
        ];
        if (columnInfo.nullable) tooltipParts.push(t('explorer.nullable'));
        if (columnInfo.isPrimaryKey) tooltipParts.push(t('explorer.primaryKey'));
        if (columnInfo.isUnique) tooltipParts.push(t('explorer.unique'));
        if (columnInfo.isAutoIncrement) tooltipParts.push(t('explorer.autoIncrement'));
        if (columnInfo.defaultValue) tooltipParts.push(t('explorer.defaultValue', String(columnInfo.defaultValue)));
        if (columnInfo.comment) tooltipParts.push(t('explorer.comment', columnInfo.comment));
        
        super({
            iconPath,
            collapsibleState: vscode.TreeItemCollapsibleState.None,
            description,
            parent,
            tooltip: tooltipParts.join('\n')
        });
        
        this.columnInfo = columnInfo;
        this.connectionId = connectionId;
        this.databaseName = databaseName;
        this.tableName = tableName;
        this.label = columnInfo.name;
        this.id = `column-${connectionId}-${databaseName}-${tableName}-${columnInfo.name}`;
    }
}

export class IndexTreeNode extends BaseTreeNode {
    readonly type: TreeNodeType = 'index';
    readonly id: string;
    readonly label: string;
    readonly contextValue?: string = 'index';
    readonly indexInfo: IndexInfo;
    readonly connectionId: string;
    readonly databaseName: string;
    readonly tableName: string;
    
    constructor(
        indexInfo: IndexInfo,
        connectionId: string,
        databaseName: string,
        tableName: string,
        parent?: ITreeNode
    ) {
        const iconPath = new vscode.ThemeIcon('list-unordered');
        const tags: string[] = [];
        if (indexInfo.isPrimary) tags.push(t('explorer.tagPrimary'));
        if (indexInfo.isUnique) tags.push(t('explorer.tagUnique'));
        const description = tags.length > 0
            ? `${tags.join(' ')} (${indexInfo.columns.join(', ')})`
            : `(${indexInfo.columns.join(', ')})`;
        
        const tooltipParts: string[] = [
            t('explorer.index', indexInfo.name),
            t('explorer.indexType', indexInfo.type),
            t('explorer.columns', indexInfo.columns.join(', ')),
        ];
        if (indexInfo.isPrimary) tooltipParts.push(t('explorer.primary'));
        if (indexInfo.isUnique) tooltipParts.push(t('explorer.indexUnique'));
        
        super({
            iconPath,
            collapsibleState: vscode.TreeItemCollapsibleState.None,
            description,
            parent,
            tooltip: tooltipParts.join('\n')
        });
        
        this.indexInfo = indexInfo;
        this.connectionId = connectionId;
        this.databaseName = databaseName;
        this.tableName = tableName;
        this.label = indexInfo.name;
        this.id = `index-${connectionId}-${databaseName}-${tableName}-${indexInfo.name}`;
    }
}

export class FavoriteTreeNode extends BaseTreeNode {
    readonly type: TreeNodeType;
    readonly id: string;
    readonly label: string;
    readonly contextValue?: string;
    readonly connectionId: string;
    readonly connectionName: string;
    readonly databaseName: string;
    readonly objectName: string;
    readonly objectType: 'table' | 'view';
    readonly isAvailable: boolean;
    
    constructor(
        connectionId: string,
        connectionName: string,
        databaseName: string,
        objectName: string,
        objectType: 'table' | 'view',
        isAvailable = true,
        parent?: ITreeNode
    ) {
        const iconPath = objectType === 'table'
            ? new vscode.ThemeIcon('table')
            : new vscode.ThemeIcon('eye');
        
        const typeLabel = objectType === 'table' ? t('explorer.table', objectName) : t('explorer.view', objectName);
        
        super({
            iconPath,
            collapsibleState: vscode.TreeItemCollapsibleState.None,
            description: t('explorer.favoriteDescription', connectionName, databaseName),
            parent,
            tooltip: `${typeLabel}\n${t('explorer.connection', connectionName)}\n${t('explorer.database', databaseName)}`
        });
        
        this.type = objectType;
        this.connectionId = connectionId;
        this.connectionName = connectionName;
        this.databaseName = databaseName;
        this.objectName = objectName;
        this.objectType = objectType;
        this.label = objectName;
        this.id = `favorite-${connectionId}-${databaseName}-${objectName}`;
        this.contextValue = objectType;
        this.isAvailable = isAvailable;
    }
}
