import * as vscode from 'vscode';
import type { Activatable } from '../core/Activatable';
import { getConnectionManager } from './connection/ConnectionManager';
import { getConnectionStore } from './connection/ConnectionStore';
import { SqlStatementDetector } from './query/SqlStatementDetector';
import { QueryExecutor } from './query/QueryExecutor';
import { SafeQueryGuard } from './query/SafeQueryGuard';
import { QueryHistory } from './history/QueryHistory';
import { getSchemaCache } from './schema/SchemaCache';
import { registerConnectionCommands } from './commands/ConnectionCommands';
import { registerQueryCommands } from './commands/QueryCommands';
import { registerExportCommands } from './commands/ExportCommands';
import { registerSchemaCommands } from './commands/SchemaCommands';
import { getErrorHandler, ErrorLevel, ErrorCategory } from '../core/errorHandler';

// NOTE: This module no longer imports anything from the views layer.
// The database explorer tree (DatabaseTreeProvider + TreeView + double-click
// handling) is now created and owned by the views layer (Task 6/8). The
// database layer refreshes / drives the tree via vscode commands:
//   - hive-formatter.refreshTreeProvider()
//   - hive-formatter.addTreeFavorite(...)
//   - hive-formatter.removeTreeFavorite(...)


export class DatabaseModule implements Activatable {
  private context: vscode.ExtensionContext;
  private queryExecutor: QueryExecutor;
  private safeQueryGuard: SafeQueryGuard;
  private queryHistory: QueryHistory;
  private statementDetector: SqlStatementDetector;
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
    const { disposables: queryDisposables } = registerQueryCommands(
      this.context,
      this,
    );
    const exportDisposables = registerExportCommands();
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

    // NOTE: Tree view (DatabaseTreeProvider + TreeView + double-click handler)
    // initialization has been moved to the views layer (Task 6/8). The views
    // layer creates the TreeDataProvider, registers it with
    // `vscode.window.createTreeView('hive-formatter.databaseExplorer', ...)`,
    // and wires the double-click -> viewTableData / view*DDL commands. The
    // database layer only refreshes the tree via
    // `hive-formatter.refreshTreeProvider`.

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
