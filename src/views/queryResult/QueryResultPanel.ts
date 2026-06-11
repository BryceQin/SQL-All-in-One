import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { QueryResult, QueryError, QueryRow } from '../../database/adapters/IDatabaseAdapter';
import type { QueryHistoryEntry } from '../../database/query/QueryResult';
import { LanguageBridge } from './LanguageBridge';

export interface FilterCondition {
    column: string;
    operator: string;
    value: string;
}

export interface PendingChange {
    type: 'update' | 'insert' | 'delete';
    table: string;
    primaryKey: Record<string, unknown>;
    changes?: Record<string, { old: unknown; new: unknown }>;
    originalRow?: QueryRow;
    rowIndex: number;
}

export interface ForeignKeyOption {
    value: unknown;
    displayText: string;
}

type WebviewMessage =
    | { command: 'executeQuery'; sql: string }
    | { command: 'executePanelSql'; sql: string }
    | { command: 'cancelQuery' }
    | { command: 'requestExport'; format: string; options?: Record<string, unknown> }
    | { command: 'requestSort'; column: string; direction: string }
    | { command: 'requestFilter'; conditions: FilterCondition[] }
    | { command: 'requestPage'; page: number }
    | { command: 'commitChanges'; changes: PendingChange[]; tableName: string; database: string }
    | { command: 'requestForeignKeyOptions'; column: string; referencedTable: string; database: string }
    | { command: 'beginTransaction' }
    | { command: 'commitTransaction' }
    | { command: 'rollbackTransaction' }
    | { command: 'createSavepoint'; name: string }
    | { command: 'rollbackToSavepoint'; name: string }
    | { command: 'requestBlobPreview'; rowIndex: number; colIndex: number }
    | { command: 'requestCompletion'; requestId: string; sql: string; position: { line: number; column: number }; dialect: string }
    | { command: 'requestHover'; requestId: string; sql: string; position: { line: number; column: number }; dialect: string }
    | { command: 'requestFormat'; requestId: string; sql: string; dialect: string }
    | { command: 'requestDiagnostics'; requestId: string; sql: string; dialect: string };

export class QueryResultPanel {
    public static currentPanel: QueryResultPanel | undefined;
    public static readonly viewType = 'sqlAllInOneQueryResult';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    // Context is received but not used in this dialog
    // private readonly __context: vscode.ExtensionContext;
    private _disposables: vscode.Disposable[] = [];
    private _currentResult: QueryResult | undefined;
    private _languageBridge: LanguageBridge;
    private _currentDialect = 'mysql';

    public onExecuteQuery?: (sql: string) => void;
    public onCancelQuery?: () => void;
    public onRequestSort?: (column: string, direction: string) => void;
    public onRequestFilter?: (conditions: FilterCondition[]) => void;
    public onRequestPage?: (page: number) => void;
    public onCommitChanges?: (changes: PendingChange[], tableName: string, database: string) => Promise<{ success: boolean; errors?: string[] }>;
    public onRequestForeignKeyOptions?: (column: string, referencedTable: string, database: string) => Promise<ForeignKeyOption[]>;
    public onBeginTransaction?: () => Promise<void>;
    public onCommitTransaction?: () => Promise<void>;
    public onRollbackTransaction?: () => Promise<void>;
    public onCreateSavepoint?: (name: string) => Promise<void>;
    public onRollbackToSavepoint?: (name: string) => Promise<void>;
    public onExecutePanelSql?: (sql: string) => Promise<void>;

    public static createOrShow(extensionUri: vscode.Uri, context: vscode.ExtensionContext): QueryResultPanel {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (QueryResultPanel.currentPanel) {
            QueryResultPanel.currentPanel._panel.reveal(column || vscode.ViewColumn.Two);
            return QueryResultPanel.currentPanel;
        }

        const panel = vscode.window.createWebviewPanel(
            QueryResultPanel.viewType,
            'Query Result',
            column ? column + 1 : vscode.ViewColumn.Two,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'media'),
                ],
                retainContextWhenHidden: true,
            }
        );

        QueryResultPanel.currentPanel = new QueryResultPanel(panel, extensionUri, context);
        return QueryResultPanel.currentPanel;
    }

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        _context: vscode.ExtensionContext
    ) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._languageBridge = new LanguageBridge(extensionUri);
        // this.__context = context;

        this._update();

        this._disposables.push(
            vscode.window.onDidChangeActiveColorTheme((theme) => {
                this._panel.webview.postMessage({
                    type: 'themeChange',
                    data: { kind: theme.kind },
                });
            })
        );

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async (message: WebviewMessage) => {
                switch (message.command) {
                    case 'executeQuery':
                        if (message.sql && this.onExecuteQuery) {
                            this.onExecuteQuery(message.sql);
                        }
                        break;
                    case 'cancelQuery':
                        if (this.onCancelQuery) {
                            this.onCancelQuery();
                        }
                        break;
                    case 'requestExport':
                        await this._handleExport(message.format, message.options);
                        break;
                    case 'requestSort':
                        if (message.column && message.direction && this.onRequestSort) {
                            this.onRequestSort(message.column, message.direction);
                        }
                        break;
                    case 'requestFilter':
                        if (message.conditions && this.onRequestFilter) {
                            this.onRequestFilter(message.conditions);
                        }
                        break;
                    case 'requestPage':
                        if (message.page !== undefined && this.onRequestPage) {
                            this.onRequestPage(message.page);
                        }
                        break;
                    case 'commitChanges':
                        if (message.changes && this.onCommitChanges) {
                            const result = await this.onCommitChanges(
                                message.changes,
                                message.tableName || '',
                                message.database || ''
                            );
                            this._panel.webview.postMessage({
                                type: 'commitResult',
                                data: result,
                            });
                        }
                        break;
                    case 'requestForeignKeyOptions':
                        if (message.column && this.onRequestForeignKeyOptions) {
                            const options = await this.onRequestForeignKeyOptions(
                                message.column,
                                message.referencedTable || '',
                                message.database || ''
                            );
                            this._panel.webview.postMessage({
                                type: 'foreignKeyOptions',
                                data: { column: message.column, options },
                            });
                        }
                        break;
                    case 'beginTransaction':
                        if (this.onBeginTransaction) {
                            await this.onBeginTransaction();
                            this._panel.webview.postMessage({ type: 'transactionStatus', data: { active: true } });
                        }
                        break;
                    case 'commitTransaction':
                        if (this.onCommitTransaction) {
                            await this.onCommitTransaction();
                            this._panel.webview.postMessage({ type: 'transactionStatus', data: { active: false } });
                        }
                        break;
                    case 'rollbackTransaction':
                        if (this.onRollbackTransaction) {
                            await this.onRollbackTransaction();
                            this._panel.webview.postMessage({ type: 'transactionStatus', data: { active: false } });
                        }
                        break;
                    case 'createSavepoint':
                        if (this.onCreateSavepoint) {
                            await this.onCreateSavepoint(message.name || 'sp1');
                        }
                        break;
                    case 'rollbackToSavepoint':
                        if (this.onRollbackToSavepoint) {
                            await this.onRollbackToSavepoint(message.name || 'sp1');
                        }
                        break;
                    case 'requestBlobPreview':
                        this._handleBlobPreview(message.rowIndex, message.colIndex);
                        break;
                    case 'executePanelSql':
                        if (message.sql && this.onExecutePanelSql) {
                            await this.onExecutePanelSql(message.sql);
                        }
                        break;
                    case 'requestCompletion': {
                        const items = await this._languageBridge.handleCompletionRequest(
                            message.sql,
                            message.position,
                            message.dialect,
                        );
                        this._panel.webview.postMessage({
                            type: 'completionResult',
                            data: { requestId: message.requestId, items },
                        });
                        break;
                    }
                    case 'requestHover': {
                        const contents = await this._languageBridge.handleHoverRequest(
                            message.sql,
                            message.position,
                            message.dialect,
                        );
                        this._panel.webview.postMessage({
                            type: 'hoverResult',
                            data: { requestId: message.requestId, contents },
                        });
                        break;
                    }
                    case 'requestFormat': {
                        const formattedSql = await this._languageBridge.handleFormatRequest(
                            message.sql,
                            message.dialect,
                        );
                        this._panel.webview.postMessage({
                            type: 'formatResult',
                            data: { requestId: message.requestId, formattedSql },
                        });
                        break;
                    }
                    case 'requestDiagnostics': {
                        const diagnostics = await this._languageBridge.handleDiagnosticsRequest(
                            message.sql,
                            message.dialect,
                        );
                        this._panel.webview.postMessage({
                            type: 'diagnosticsResult',
                            data: { requestId: message.requestId, diagnostics },
                        });
                        break;
                    }
                }
            },
            null,
            this._disposables
        );
    }

    public showResult(result: QueryResult, connectionName?: string, connectionColor?: string, tableName?: string): void {
        this._currentResult = result;

        (async () => {
            try {
                const { getConnectionManager } = await import('../../database/connection/ConnectionManager.js');
                const activeConn = getConnectionManager().getActiveConnection();
                if (activeConn) {
                    const newDialect = activeConn.dialect || 'mysql';
                    if (newDialect !== this._currentDialect) {
                        this._currentDialect = newDialect;
                        this._sendLanguageData();
                    }
                }
            } catch { /* ignore if ConnectionManager not available */ }
        })();

        const metadata = {
            queryId: result.queryId,
            status: result.status,
            columns: result.columns.map((c) => ({
                name: c.name,
                type: c.type,
                nullable: c.nullable,
                isPrimaryKey: c.isPrimaryKey,
                isAutoIncrement: c.isAutoIncrement,
                isEnum: c.isEnum,
                enumValues: c.enumValues,
                referencedTable: c.referencedTable,
                comment: c.comment,
            })),
            rowCount: result.rowCount,
            affectedRows: result.affectedRows,
            executionTime: result.executionTime,
            error: result.error,
            database: result.database,
            connectionName: connectionName || '',
            connectionColor: connectionColor || '',
            tableName: tableName || '',
        };

        this._panel.webview.postMessage({
            type: 'queryResultStart',
            data: metadata,
        });

        const BATCH_SIZE = 1000;
        const totalRows = result.rows.length;
        const totalBatches = Math.ceil(totalRows / BATCH_SIZE);

        for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
            const start = batchIndex * BATCH_SIZE;
            const end = Math.min(start + BATCH_SIZE, totalRows);
            const batchRows = result.rows.slice(start, end).map((row) =>
                result.columns.map((c) => row[c.name])
            );

            this._panel.webview.postMessage({
                type: 'queryResultBatch',
                data: {
                    batchIndex,
                    totalBatches,
                    rows: batchRows,
                },
            });
        }

        this._panel.webview.postMessage({
            type: 'queryResultEnd',
            data: { queryId: result.queryId },
        });
    }

    public showLoading(sql: string): void {
        this._panel.webview.postMessage({
            type: 'queryStart',
            data: { sql },
        });
    }

    public showError(error: QueryError): void {
        this._panel.webview.postMessage({
            type: 'queryError',
            data: error,
        });
    }

    public setSqlAndExecute(sql: string): void {
        this._panel.webview.postMessage({
            type: 'setEditorSql',
            data: { sql, autoExecute: true },
        });
    }

    public setSql(sql: string): void {
        this._panel.webview.postMessage({
            type: 'setEditorSql',
            data: { sql, autoExecute: false },
        });
    }

    public clear(): void {
        this._currentResult = undefined;
        this._panel.webview.postMessage({
            type: 'clear',
        });
    }

    public sendHistoryData(entries: QueryHistoryEntry[]): void {
        this._panel.webview.postMessage({
            type: 'historyData',
            data: entries,
        });
    }

    public getCurrentResult(): QueryResult | undefined {
        return this._currentResult;
    }

    public triggerExport(format: string): void {
        this._handleExport(format);
    }

    public setDialect(dialect: string): void {
        this._currentDialect = dialect;
        this._sendLanguageData();
    }

    public dispose(): void {
        QueryResultPanel.currentPanel = undefined;
        this._languageBridge.dispose();
        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private _update(): void {
        this._getHtmlForWebview().then(html => {
            this._panel.webview.html = html;
            this._sendLanguageData();
        });
    }

    private _sendLanguageData(): void {
        const data = this._languageBridge.exportLanguageData(this._currentDialect);
        this._panel.webview.postMessage({
            type: 'languageData',
            data,
        });
    }

    private async _getHtmlForWebview(): Promise<string> {
        try {
            const htmlPath = path.join(
                this._extensionUri.fsPath,
                'media',
                'query-result.html'
            );
            let html = await fs.promises.readFile(htmlPath, 'utf-8');

            const cssUri = this._panel.webview.asWebviewUri(
                vscode.Uri.joinPath(this._extensionUri, 'media', 'query-result.css')
            );
            const jsUri = this._panel.webview.asWebviewUri(
                vscode.Uri.joinPath(this._extensionUri, 'media', 'query-result.js')
            );
            const monacoLoaderUri = this._panel.webview.asWebviewUri(
                vscode.Uri.joinPath(this._extensionUri, 'media', 'monaco', 'vs', 'loader.js')
            );
            const monacoBaseUri = this._panel.webview.asWebviewUri(
                vscode.Uri.joinPath(this._extensionUri, 'media', 'monaco', 'vs')
            );

            html = html.replace('{{CSS_URI}}', cssUri.toString());
            html = html.replace('{{JS_URI}}', jsUri.toString());
            html = html.replace('{{MONACO_LOADER_URI}}', monacoLoaderUri.toString());
            html = html.replace(/\{\{CSP_SOURCE\}\}/g, this._panel.webview.cspSource);

            const config = vscode.workspace.getConfiguration('SQL-All-in-One');
            const configData = {
                pageSize: config.get<number>('query.pageSize', 100),
                nullPlaceholder: config.get<string>('query.nullPlaceholder', '(NULL)'),
                enablePreload: config.get<boolean>('results.enablePreload', true),
                jsonPrettyPrint: config.get<boolean>('results.jsonPrettyPrint', true),
                dateFormat: config.get<string>('results.dateFormat', 'local'),
                longTextThreshold: config.get<number>('results.longTextThreshold', 200),
                editMode: config.get<string>('dataEditor.editMode', 'readonly'),
                autoCommit: config.get<boolean>('dataEditor.autoCommit', true),
                defaultView: config.get<string>('dataEditor.defaultView', 'grid'),
                optimisticLocking: config.get<boolean>('dataEditor.optimisticLocking', false),
                maxBlobPreviewSize: config.get<number>('dataEditor.maxBlobPreviewSize', 5242880),
                blobTextPreviewSize: config.get<number>('dataEditor.blobTextPreviewSize', 1048576),
                longTransactionWarning: config.get<number>('dataEditor.longTransactionWarning', 300),
                showTransactionStatus: config.get<boolean>('dataEditor.showTransactionStatus', true),
                enableValidation: config.get<boolean>('dataEditor.enableValidation', true),
                validateOnEdit: config.get<boolean>('dataEditor.validateOnEdit', true),
                validateForeignKeys: config.get<boolean>('dataEditor.validateForeignKeys', false),
                dialect: this._currentDialect,
                monacoBasePath: monacoBaseUri.toString(),
                themeKind: vscode.window.activeColorTheme.kind,
            };
            const configScript = '<script>window.__CONFIG__ = ' + JSON.stringify(configData) + ';</script>';
            html = html.replace('{{CONFIG_INJECT}}', configScript);

            return html;
        } catch (error) {
            console.error('Failed to load Query Result panel HTML:', error);
            return '<html><body><h2>Failed to load Query Result panel</h2><p>Please reinstall the extension.</p></body></html>';
        }
    }

    private async _handleExport(format: string, options?: Record<string, unknown>): Promise<void> {
        if (!this._currentResult) {
            vscode.window.showWarningMessage('No query result to export');
            return;
        }

        try {
            const { DataExporter } = await import('../../database/transfer/DataExporter.js');
            const exporter = new DataExporter();
            const columns = this._currentResult.columns;
            const rows = this._currentResult.rows;
            const tableName = (options?.tableName as string) || 'exported_table';

            switch (format) {
                case 'csv':
                    await exporter.exportToCsv(rows, columns);
                    break;
                case 'json':
                    await exporter.exportToJson(rows, columns);
                    break;
                case 'insert': {
                    const { getConnectionManager: getConnMgr } = await import('../../database/connection/ConnectionManager.js');
                    const activeConnCfg = getConnMgr().getActiveConnection();
                    const insertAdapter = activeConnCfg ? getConnMgr().getAdapter(activeConnCfg.id) : undefined;
                    await exporter.exportToInsert(rows, columns, tableName, undefined, insertAdapter);
                    break;
                }
                case 'ddl':
                    await this._handleDdlExport(exporter, options);
                    break;
                default:
                    vscode.window.showErrorMessage(`Unsupported export format: ${format}`);
                    return;
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Export failed: ${(error as Error).message}`);
        }
    }

    private async _handleDdlExport(
        exporter: InstanceType<typeof import('../../database/transfer/DataExporter.js').DataExporter>,
        options?: Record<string, unknown>
    ): Promise<void> {
        const { getConnectionManager } = (await import('../../database/connection/ConnectionManager.js'));
        const connectionManager = getConnectionManager();
        const activeConfig = connectionManager.getActiveConnection();
        const adapter = activeConfig
            ? connectionManager.getAdapter(activeConfig.id)
            : undefined;

        if (!adapter) {
            vscode.window.showWarningMessage('No active connection for DDL export');
            return;
        }

        const database = options?.database as string || activeConfig?.database || '';
        const table = options?.tableName as string || '';

        if (!table) {
            vscode.window.showWarningMessage('No table specified for DDL export');
            return;
        }

        await exporter.exportToDdl(adapter, database, table);
    }

    private _handleBlobPreview(rowIndex: number, colIndex: number): void {
        if (!this._currentResult) return;
        const row = this._currentResult.rows[rowIndex];
        const col = this._currentResult.columns[colIndex];
        if (!row || !col) return;

        const value = row[col.name];
        if (value === null || value === undefined) {
            this._panel.webview.postMessage({
                type: 'blobPreview',
                data: { rowIndex, colIndex, content: null, mode: 'null' },
            });
            return;
        }

        let buffer: Buffer;
        if (Buffer.isBuffer(value)) {
            buffer = value;
        } else if (typeof value === 'string') {
            buffer = Buffer.from(value, 'base64');
        } else {
            buffer = Buffer.from(String(value));
        }

        const config = vscode.workspace.getConfiguration('SQL-All-in-One');
        const maxSize = config.get<number>('dataEditor.maxBlobPreviewSize', 5242880);
        const textMaxSize = config.get<number>('dataEditor.blobTextPreviewSize', 1048576);

        if (buffer.length > maxSize) {
            this._panel.webview.postMessage({
                type: 'blobPreview',
                data: { rowIndex, colIndex, size: buffer.length, mode: 'too_large' },
            });
            return;
        }

        const isImage = this._detectImageBuffer(buffer);
        if (isImage) {
            const base64 = buffer.toString('base64');
            const mimeType = this._getImageMimeType(buffer);
            this._panel.webview.postMessage({
                type: 'blobPreview',
                data: { rowIndex, colIndex, content: base64, mimeType, mode: 'image' },
            });
            return;
        }

        if (buffer.length <= textMaxSize) {
            try {
                const text = buffer.toString('utf-8');
                this._panel.webview.postMessage({
                    type: 'blobPreview',
                    data: { rowIndex, colIndex, content: text, mode: 'text' },
                });
            } catch {
                this._panel.webview.postMessage({
                    type: 'blobPreview',
                    data: { rowIndex, colIndex, content: buffer.toString('hex'), mode: 'hex' },
                });
            }
        } else {
            this._panel.webview.postMessage({
                type: 'blobPreview',
                data: { rowIndex, colIndex, content: buffer.toString('hex').substring(0, 2048), mode: 'hex' },
            });
        }
    }

    private _detectImageBuffer(buf: Buffer): boolean {
        if (buf.length < 4) return false;
        const header = buf.subarray(0, 4);
        if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47) return true;
        if (header[0] === 0xFF && header[1] === 0xD8) return true;
        if (header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46) return true;
        return false;
    }

    private _getImageMimeType(buf: Buffer): string {
        if (buf.length < 4) return 'application/octet-stream';
        if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'image/png';
        if (buf[0] === 0xFF && buf[1] === 0xD8) return 'image/jpeg';
        if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif';
        return 'application/octet-stream';
    }
}
