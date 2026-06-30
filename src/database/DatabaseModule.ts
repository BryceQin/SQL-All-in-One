import * as vscode from 'vscode';
import type { Activatable } from '../core/Activatable';
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
import { getErrorHandler, ErrorLevel, ErrorCategory } from '../core/errorHandler';

/**
 * Delay (ms) before revealing the toggled tree node after a double-click.
 * Gives VSCode time to process the expand/collapse state transition so that
 * `TreeView.reveal` targets the correct node state.
 */
const REVEAL_DELAY_MS = 50;

/**
 * Window (ms) during which subsequent toggle events on the same node are
 * ignored after a double-click has been recognized. Prevents the second
 * click of a double-click from immediately collapsing the node we just
 * expanded.
 */
const IGNORE_WINDOW_MS = 300;

export class DatabaseModule implements Activatable {
  private context: vscode.ExtensionContext;
  private queryExecutor: QueryExecutor;
  private safeQueryGuard: SafeQueryGuard;
  private queryHistory: QueryHistory;
  private statementDetector: SqlStatementDetector;
  private treeProvider!: DatabaseTreeProvider;
  private outputChannel!: vscode.OutputChannel;
  private initialized = false;
  private disposed = false;

  constructor(
    context: vscode.ExtensionContext,
    queryExecutor: QueryExecutor,
    safeQueryGuard: SafeQueryGuard,
    queryHistory: QueryHistory,
    statementDetector: SqlStatementDetector,
  ) {
    this.context = context;
    this.queryExecutor = queryExecutor;
    this.safeQueryGuard = safeQueryGuard;
    this.queryHistory = queryHistory;
    this.statementDetector = statementDetector;
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
    const connectionStore = getConnectionStore();
    connectionStore.setSecretStorage(this.context.secrets);

    await this.tryStep('Connection manager initialization', async () => {
      const connectionManager = getConnectionManager();
      await connectionManager.initialize();
      vscode.commands.executeCommand('setContext', 'hive-formatter.connectionCount', connectionManager.getAllConnections().length);
    });

    await this.tryStep('Tree view initialization', async () => {
      this.treeProvider = new DatabaseTreeProvider(this.context);
      const treeView = vscode.window.createTreeView('hive-formatter.databaseExplorer', {
        treeDataProvider: this.treeProvider,
        showCollapseAll: true,
      });
      this.setupDoubleClickHandler(treeView);
    });

    await this.tryStep('Query/Schema initialization', async () => {
      this.queryHistory.initialize(this.context);
      this.outputChannel = vscode.window.createOutputChannel('SQL All in One');

      this.setupSchemaCacheListeners();
    });

    this.initialized = true;
  }

  /**
   * Runs a single initialization step, swallowing any error so that subsequent
   * steps can still run. Errors are logged to the console and forwarded to the
   * centralized error handler as a FEATURE-level error (non-critical: the
   * extension remains usable even if one init step fails).
   */
  private async tryStep(name: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (e) {
      console.error(`[SQL All in One] ${name} failed:`, e);
      getErrorHandler().handle(e, name, ErrorLevel.ERROR, ErrorCategory.FEATURE);
    }
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
        }, REVEAL_DELAY_MS);
        setTimeout(() => {
          ignoreNodeId = null;
        }, IGNORE_WINDOW_MS);
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

  async activate(_context: vscode.ExtensionContext): Promise<void> {
    this.registerCommands();
    try {
      await this.initialize();
    } catch (e) {
      console.error('[SQL All in One] Database initialization failed:', e);
      getErrorHandler().handle(e, 'Database initialization', ErrorLevel.ERROR, ErrorCategory.CRITICAL);
    }
  }

  async deactivate(): Promise<void> {
    await this.dispose();
  }

  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.outputChannel?.dispose();
    const connectionManager = getConnectionManager();
    await connectionManager.disconnectAll();
  }
}
