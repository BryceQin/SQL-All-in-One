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
import { registerConnectionCommands } from './commands/ConnectionCommands';
import { registerQueryCommands } from './commands/QueryCommands';
import { registerExportCommands } from './commands/ExportCommands';
import { registerSchemaCommands } from './commands/SchemaCommands';
import { TableTreeNode, FunctionTreeNode, ProcedureTreeNode, TriggerTreeNode } from '../views/databaseExplorer/treeNodes';
import { getContainer, Tokens } from '../core/diContainer';

export class DatabaseModule {
  private context: vscode.ExtensionContext;
  private treeProvider!: DatabaseTreeProvider;
  private queryExecutor!: QueryExecutor;
  private safeQueryGuard!: SafeQueryGuard;
  private queryHistory!: QueryHistory;
  private statementDetector!: SqlStatementDetector;
  private outputChannel!: vscode.OutputChannel;
  private initialized = false;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  getTreeProvider(): DatabaseTreeProvider | undefined {
    return this.treeProvider;
  }

  getQueryExecutor(): QueryExecutor | undefined {
    return this.queryExecutor;
  }

  getSafeQueryGuard(): SafeQueryGuard | undefined {
    return this.safeQueryGuard;
  }

  getQueryHistory(): QueryHistory | undefined {
    return this.queryHistory;
  }

  getStatementDetector(): SqlStatementDetector | undefined {
    return this.statementDetector;
  }

  getOutputChannel(): vscode.OutputChannel | undefined {
    return this.outputChannel;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  registerCommands(): void {
    const connectionDisposables = registerConnectionCommands(this.context, this);
    const { disposables: queryDisposables, getQueryResultPanel } = registerQueryCommands(
      this.context,
      this,
    );
    const exportDisposables = registerExportCommands(getQueryResultPanel);
    const schemaDisposables = registerSchemaCommands(this.context, this);

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

  async initialize(): Promise<void> {
    AdapterFactory.register('mysql', MysqlAdapter);

    const connectionStore = getConnectionStore();
    connectionStore.setSecretStorage(this.context.secrets);

    try {
      const connectionManager = getConnectionManager();
      await connectionManager.initialize();
      vscode.commands.executeCommand('setContext', 'hive-formatter.connectionCount', connectionManager.getAllConnections().length);
    } catch (e) {
      console.error('[SQL All in One] Connection manager initialization failed:', e);
    }

    try {
      this.treeProvider = new DatabaseTreeProvider(this.context);
      const treeView = vscode.window.createTreeView('hive-formatter.databaseExplorer', {
        treeDataProvider: this.treeProvider,
        showCollapseAll: true,
      });
      this.setupDoubleClickHandler(treeView);
    } catch (e) {
      console.error('[SQL All in One] Tree view initialization failed:', e);
    }

    try {
      const container = getContainer();
      this.queryExecutor = container.get<QueryExecutor>(Tokens.QueryExecutor);
      this.safeQueryGuard = container.get<SafeQueryGuard>(Tokens.SafeQueryGuard);
      this.queryHistory = container.get<QueryHistory>(Tokens.QueryHistory);
      this.queryHistory.initialize(this.context);
      this.statementDetector = container.get<SqlStatementDetector>(Tokens.SqlStatementDetector);
      this.outputChannel = vscode.window.createOutputChannel('SQL All in One');

      this.setupSchemaCacheListeners();
    } catch (e) {
      console.error('[SQL All in One] Query/Schema initialization failed:', e);
    }

    this.initialized = true;
  }

  private setupSchemaCacheListeners(): void {
    const connectionManager = getConnectionManager();
    const schemaCache = getSchemaCache();

    const stateChangeDisposable = connectionManager.onDidChangeConnectionState(async (event) => {
      if (event.newState === 'connected') {
        const config = connectionManager.getActiveConnection();
        if (config && config.database) {
          schemaCache.prefetchOnConnect(event.connectionId, config.database).catch((e) => {
            console.debug('[SQL All in One] Schema prefetch failed:', e);
          });
          vscode.commands.executeCommand('setContext', 'hive-formatter.connectionCount', connectionManager.getAllConnections().length);
        }
      }
      if (event.newState === 'disconnected') {
        schemaCache.invalidate(event.connectionId);
        vscode.commands.executeCommand('setContext', 'hive-formatter.connectionCount', connectionManager.getAllConnections().length);
      }
    });
    this.context.subscriptions.push(stateChangeDisposable);
  }

  private setupDoubleClickHandler(treeView: vscode.TreeView<unknown>): void {
    let lastToggleNodeId: string | null = null;
    let lastToggleTime = 0;
    let ignoreNodeId: string | null = null;
    const DOUBLE_CLICK_THRESHOLD = 500;

    const getDoubleClickCommand = (element: unknown): string | null => {
      if (element instanceof TableTreeNode) {
        return 'hive-formatter.viewTableData';
      }
      if (element instanceof FunctionTreeNode) {
        return 'hive-formatter.viewFunctionDDL';
      }
      if (element instanceof ProcedureTreeNode) {
        return 'hive-formatter.viewProcedureDDL';
      }
      if (element instanceof TriggerTreeNode) {
        return 'hive-formatter.viewTriggerDDL';
      }
      return null;
    };

    const handleToggle = (element: unknown): void => {
      const command = getDoubleClickCommand(element);
      if (!command) {
        return;
      }
      const nodeId = (element as { id?: string })?.id;
      if (!nodeId || ignoreNodeId === nodeId) {
        return;
      }
      const now = Date.now();
      if (lastToggleNodeId === nodeId && now - lastToggleTime < DOUBLE_CLICK_THRESHOLD) {
        lastToggleNodeId = null;
        lastToggleTime = 0;
        ignoreNodeId = nodeId;
        vscode.commands.executeCommand(command, element);
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

  async dispose(): Promise<void> {
    this.outputChannel?.dispose();
    const connectionManager = getConnectionManager();
    await connectionManager.disconnectAll();
  }
}
