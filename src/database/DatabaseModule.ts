import * as vscode from 'vscode';
import { MysqlAdapter } from './adapters/MysqlAdapter';
import { AdapterFactory } from './adapters/AdapterFactory';
import { ConnectionManager } from './connection/ConnectionManager';
import { ConnectionStore } from './connection/ConnectionStore';
import { DatabaseTreeProvider } from '../views/databaseExplorer/DatabaseTreeProvider';
import { SqlStatementDetector } from './query/SqlStatementDetector';
import { QueryExecutor } from './query/QueryExecutor';
import { SafeQueryGuard } from './query/SafeQueryGuard';
import { QueryHistory } from './history/QueryHistory';
import { SchemaCache } from './schema/SchemaCache';
import { SchemaProvider } from './schema/SchemaProvider';
import { registerConnectionCommands } from './commands/ConnectionCommands';
import { registerQueryCommands } from './commands/QueryCommands';
import { registerExportCommands } from './commands/ExportCommands';
import { registerSchemaCommands } from './commands/SchemaCommands';

export class DatabaseModule {
    private context: vscode.ExtensionContext;
    private treeProvider!: DatabaseTreeProvider;
    private queryExecutor!: QueryExecutor;
    private safeQueryGuard!: SafeQueryGuard;
    private queryHistory!: QueryHistory;
    private statementDetector!: SqlStatementDetector;
    private outputChannel!: vscode.OutputChannel;
    
    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }
    
    async initialize(): Promise<void> {
        AdapterFactory.register('mysql', MysqlAdapter);
        
        const connectionStore = ConnectionStore.getInstance();
        connectionStore.setSecretStorage(this.context.secrets);
        
        const connectionManager = ConnectionManager.getInstance();
        await connectionManager.initialize();
        
        this.treeProvider = new DatabaseTreeProvider(this.context);
        vscode.window.createTreeView('sql-all-in-one.databaseExplorer', {
            treeDataProvider: this.treeProvider,
            showCollapseAll: true
        });

        this.queryExecutor = new QueryExecutor();
        this.safeQueryGuard = new SafeQueryGuard();
        this.queryHistory = new QueryHistory();
        this.queryHistory.initialize(this.context);
        this.statementDetector = new SqlStatementDetector();
        this.outputChannel = vscode.window.createOutputChannel('SQL All in One');

        this.setupSchemaCacheListeners();

        this.registerCommands();
    }
    
    private setupSchemaCacheListeners(): void {
        const connectionManager = ConnectionManager.getInstance();
        const schemaCache = SchemaCache.getInstance();

        connectionManager.onDidChangeConnectionState(async (event) => {
            if (event.newState === 'connected') {
                const config = connectionManager.getActiveConnection()
                if (config && config.database) {
                    schemaCache.prefetchOnConnect(event.connectionId, config.database).catch(() => { /* ignore prefetch error */ })
                }
            }
            if (event.newState === 'disconnected') {
                schemaCache.invalidate(event.connectionId)
            }
        })
    }

    private registerCommands(): void {
        const connectionDisposables = registerConnectionCommands(this.context, this.treeProvider);
        const { disposables: queryDisposables, getQueryResultPanel } = registerQueryCommands(
            this.context,
            this.queryExecutor,
            this.safeQueryGuard,
            this.queryHistory,
            this.statementDetector,
            this.outputChannel
        );
        const exportDisposables = registerExportCommands(getQueryResultPanel);
        const schemaDisposables = registerSchemaCommands(this.context, this.treeProvider, this.statementDetector);

        const allDisposables = [
            ...connectionDisposables,
            ...queryDisposables,
            ...exportDisposables,
            ...schemaDisposables
        ];

        for (const disposable of allDisposables) {
            this.context.subscriptions.push(disposable);
        }
    }

    async dispose(): Promise<void> {
        this.queryExecutor?.dispose();
        this.outputChannel?.dispose();
        SchemaProvider.getInstance().dispose();
        SchemaCache.getInstance().dispose();
        const connectionManager = ConnectionManager.getInstance();
        await connectionManager.disconnectAll();
    }
}
