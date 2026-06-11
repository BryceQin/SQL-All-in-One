import * as vscode from 'vscode';
import { MysqlAdapter } from './adapters/MysqlAdapter';
import { AdapterFactory } from './adapters/AdapterFactory';
import { getConnectionManager } from './connection/ConnectionManager';
import { getConnectionStore } from './connection/ConnectionStore';
import { DatabaseTreeProvider } from '../views/databaseExplorer/DatabaseTreeProvider';
import { SqlStatementDetector } from './query/SqlStatementDetector';
import { QueryExecutor } from './query/QueryExecutor';
import { SafeQueryGuard } from './query/SafeQueryGuard';
import { QueryHistory } from './history/QueryHistory';
import { getSchemaCache } from './schema/SchemaCache';
import { getSchemaProvider } from './schema/SchemaProvider';
import { registerConnectionCommands } from './commands/ConnectionCommands';
import { registerQueryCommands } from './commands/QueryCommands';
import { registerExportCommands } from './commands/ExportCommands';
import { registerSchemaCommands } from './commands/SchemaCommands';
import { TableTreeNode } from '../views/databaseExplorer/treeNodes';
import { getContainer, Tokens } from '../core/diContainer';

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

    const connectionStore = getConnectionStore();
    connectionStore.setSecretStorage(this.context.secrets);

    const connectionManager = getConnectionManager();
    await connectionManager.initialize();
    vscode.commands.executeCommand('setContext', 'sql-all-in-one.connectionCount', connectionManager.getAllConnections().length);

    this.treeProvider = new DatabaseTreeProvider(this.context);
    const treeView = vscode.window.createTreeView('sql-all-in-one.databaseExplorer', {
      treeDataProvider: this.treeProvider,
      showCollapseAll: true,
    });
    this.setupDoubleClickHandler(treeView);

    const container = getContainer();
    this.queryExecutor = container.get<QueryExecutor>(Tokens.QueryExecutor);
    this.safeQueryGuard = container.get<SafeQueryGuard>(Tokens.SafeQueryGuard);
    this.queryHistory = container.get<QueryHistory>(Tokens.QueryHistory);
    this.queryHistory.initialize(this.context);
    this.statementDetector = container.get<SqlStatementDetector>(Tokens.SqlStatementDetector);
    this.outputChannel = vscode.window.createOutputChannel('SQL All in One');

    this.setupSchemaCacheListeners();

    this.registerCommands();
  }

  private setupSchemaCacheListeners(): void {
    const connectionManager = getConnectionManager();
    const schemaCache = getSchemaCache();

    connectionManager.onDidChangeConnectionState(async (event) => {
      if (event.newState === 'connected') {
        const config = connectionManager.getActiveConnection();
        if (config && config.database) {
          schemaCache.prefetchOnConnect(event.connectionId, config.database).catch(() => {
            /* ignore prefetch error */
          });
          vscode.commands.executeCommand('setContext', 'sql-all-in-one.connectionCount', connectionManager.getAllConnections().length);
        }
      }
      if (event.newState === 'disconnected') {
        schemaCache.invalidate(event.connectionId);
        vscode.commands.executeCommand('setContext', 'sql-all-in-one.connectionCount', connectionManager.getAllConnections().length);
      }
    });
  }

  private setupDoubleClickHandler(treeView: vscode.TreeView<unknown>): void {
    let lastToggleNodeId: string | null = null;
    let lastToggleTime = 0;
    let ignoreNodeId: string | null = null;
    const DOUBLE_CLICK_THRESHOLD = 500;

    const handleToggle = (element: unknown): void => {
      if (!(element instanceof TableTreeNode)) {
        return;
      }
      const nodeId = element.id;
      if (ignoreNodeId === nodeId) {
        return;
      }
      const now = Date.now();
      if (lastToggleNodeId === nodeId && now - lastToggleTime < DOUBLE_CLICK_THRESHOLD) {
        lastToggleNodeId = null;
        lastToggleTime = 0;
        ignoreNodeId = nodeId;
        vscode.commands.executeCommand('sql-all-in-one.viewTableData', element);
        const node = element;
        setTimeout(() => {
          treeView.reveal(node, { expand: true }).then(undefined, (_e) => undefined);
        }, 50);
        setTimeout(() => {
          ignoreNodeId = null;
        }, 300);
      } else {
        lastToggleNodeId = nodeId;
        lastToggleTime = now;
      }
    };

    this.context.subscriptions.push(
      treeView.onDidExpandElement((e) => handleToggle(e.element))
    );

    this.context.subscriptions.push(
      treeView.onDidCollapseElement((e) => handleToggle(e.element))
    );
  }

  private registerCommands(): void {
    const connectionDisposables = registerConnectionCommands(this.context, this.treeProvider);
    const { disposables: queryDisposables, getQueryResultPanel } = registerQueryCommands(
      this.context,
      this.queryExecutor,
      this.safeQueryGuard,
      this.queryHistory,
      this.statementDetector,
      this.outputChannel,
    );
    const exportDisposables = registerExportCommands(getQueryResultPanel);
    const schemaDisposables = registerSchemaCommands(this.context, this.treeProvider, this.statementDetector, this.queryExecutor, this.outputChannel);

    const allDisposables = [
      ...connectionDisposables,
      ...queryDisposables,
      ...exportDisposables,
      ...schemaDisposables,
    ];

    for (const disposable of allDisposables) {
      this.context.subscriptions.push(disposable);
    }
  }

  async dispose(): Promise<void> {
    this.queryExecutor?.dispose();
    this.outputChannel?.dispose();
    getSchemaProvider().dispose();
    getSchemaCache().dispose();
    const connectionManager = getConnectionManager();
    await connectionManager.disconnectAll();
  }
}
