import * as vscode from 'vscode';
import { BaseWebviewPanel, type WebviewPanelConfig } from '../BaseWebviewPanel';
import type { QueryResult, QueryError, QueryRow } from '../../database/adapters/IDatabaseAdapter';
import type { QueryHistoryEntry } from '../../database/query/QueryResult';
import { getLanguage, t } from '../../i18n';
import { LanguageBridge } from './LanguageBridge';
import type { IConnectionService, IDataTransferService } from '../../application/ports';
import type { IQueryResultPanel } from '../../application/QueryResultController';
import type { SchemaProvider } from '../../database/schema/SchemaProvider';
import type { SqlHoverProvider } from '../../providers/SqlHoverProvider';
import type { SqlCompletionProvider } from '../../completion/SqlCompletionProvider';
import { getTokenColors } from '../../utils/themeColors';
import { handleError, ErrorCategory } from '../../core/errorHandler';
// Types are imported from the shared type layer so that neither the
// `database` nor `views` layer needs to import from the other for these
// shared contract types. Re-exported here for backward compatibility.
export type { FilterCondition, PendingChange, ForeignKeyOption } from '../../shared/editTypes';
import type { FilterCondition, PendingChange, ForeignKeyOption } from '../../shared/editTypes';

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
    | { command: 'requestDiagnostics'; requestId: string; sql: string; dialect: string }
    | { command: 'changeDatabase'; database: string }
    | { command: 'webviewReady' };

export class QueryResultPanel extends BaseWebviewPanel implements IQueryResultPanel {
    public static readonly viewType = 'sqlAllInOneQueryResult';

    /**
     * The query result panel runs long-lived operations (queries, transactions,
     * language-server bridges) and must keep its JavaScript state alive when
     * hidden, so override the base default.
     */
    protected static override shouldRetainContextWhenHidden(): boolean {
        return true;
    }

    public static getCurrentInstance(): QueryResultPanel | undefined {
        return BaseWebviewPanel.getExistingInstance<QueryResultPanel>(QueryResultPanel.viewType);
    }

    protected readonly panelConfig: WebviewPanelConfig = {
        viewType: QueryResultPanel.viewType,
        htmlFileName: 'query-result.html',
        cssFileName: 'query-result.css',
        jsFileName: 'query-result.js',
    };

    private _currentResult: QueryResult | undefined;
    private _languageBridge: LanguageBridge;
    private _currentDialect = 'mysql';
    private _sendLanguageDataTimer: ReturnType<typeof setTimeout> | undefined;
    private _webviewReady = false;
    private _pendingSql: { sql: string; autoExecute: boolean } | undefined;
    private readonly _connectionService: IConnectionService;
    private readonly _dataTransferService: IDataTransferService;

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
    public onChangeDatabase?: (database: string) => Promise<void>;

    public static createOrShow(
        extensionUri: vscode.Uri,
        _context: vscode.ExtensionContext,
        connectionService: IConnectionService,
        dataTransferService: IDataTransferService,
        schemaProvider: SchemaProvider,
        hoverProvider: SqlHoverProvider,
        completionProvider: SqlCompletionProvider,
    ): QueryResultPanel {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        const existing = BaseWebviewPanel.getExistingInstance<QueryResultPanel>(QueryResultPanel.viewType);
        if (existing) {
            BaseWebviewPanel.revealExisting(QueryResultPanel.viewType, column || vscode.ViewColumn.Two);
            return existing;
        }

        const panel = QueryResultPanel.createWebviewPanel(
            QueryResultPanel.viewType,
            t('resultPanel.queryResult'),
            extensionUri,
            { viewColumn: column ? column + 1 : vscode.ViewColumn.Two }
        );

        const instance = new QueryResultPanel(
            panel,
            extensionUri,
            connectionService,
            dataTransferService,
            schemaProvider,
            hoverProvider,
            completionProvider,
        );
        BaseWebviewPanel.registerInstance(instance);
        return instance;
    }

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        connectionService: IConnectionService,
        dataTransferService: IDataTransferService,
        schemaProvider: SchemaProvider,
        hoverProvider: SqlHoverProvider,
        completionProvider: SqlCompletionProvider,
    ) {
        super(panel, extensionUri);
        this._connectionService = connectionService;
        this._dataTransferService = dataTransferService;
        this._languageBridge = new LanguageBridge(
            extensionUri,
            schemaProvider,
            hoverProvider,
            completionProvider,
        );
        this._initialize();
    }

    private async _initialize(): Promise<void> {
        // Register theme change listener
        this._disposables.push(
            vscode.window.onDidChangeActiveColorTheme(async (theme) => {
                this.postMessage({
                    type: 'themeChange',
                    data: { kind: theme.kind, tokenColors: await getTokenColors() },
                });
            })
        );

        // Build Monaco URIs
        const monacoLoaderUri = this._panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'monaco', 'vs', 'loader.js')
        );
        const monacoBaseUri = this._panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'monaco', 'vs')
        );

        // Build config injection (no nonce — base class regex adds it)
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
            tokenColors: await getTokenColors(),
            lang: getLanguage(),
        };
        const configJson = JSON.stringify(configData).replace(/<\/script>/gi, '<\\/script>');
        const configScript = '<script>window.__CONFIG__ = ' + configJson + ';</script>';

        // Initialize HTML with custom injections
        await this.initializeHtml([
            { placeholder: '{{MONACO_LOADER_URI}}', value: monacoLoaderUri.toString() },
            { placeholder: '{{CONFIG_INJECT}}', value: configScript },
        ]);

        // Send language data after HTML is loaded
        this._sendLanguageData();

        // Register message handler
        this.onDidReceiveMessage(
            async (message: unknown) => {
                const msg = message as WebviewMessage;
                switch (msg.command) {
                    case 'executeQuery':
                        if (msg.sql && this.onExecuteQuery) {
                            this.onExecuteQuery(msg.sql);
                        }
                        break;
                    case 'cancelQuery':
                        if (this.onCancelQuery) {
                            this.onCancelQuery();
                        }
                        break;
                    case 'requestExport':
                        await this._handleExport(msg.format, msg.options);
                        break;
                    case 'requestSort':
                        if (msg.column && msg.direction && this.onRequestSort) {
                            this.onRequestSort(msg.column, msg.direction);
                        }
                        break;
                    case 'requestFilter':
                        if (msg.conditions && this.onRequestFilter) {
                            this.onRequestFilter(msg.conditions);
                        }
                        break;
                    case 'requestPage':
                        if (msg.page !== undefined && this.onRequestPage) {
                            this.onRequestPage(msg.page);
                        }
                        break;
                    case 'commitChanges':
                        if (msg.changes && this.onCommitChanges) {
                            const result = await this.onCommitChanges(
                                msg.changes,
                                msg.tableName || '',
                                msg.database || ''
                            );
                            this.postMessage({
                                type: 'commitResult',
                                data: result,
                            });
                        }
                        break;
                    case 'requestForeignKeyOptions':
                        if (msg.column && this.onRequestForeignKeyOptions) {
                            const options = await this.onRequestForeignKeyOptions(
                                msg.column,
                                msg.referencedTable || '',
                                msg.database || ''
                            );
                            this.postMessage({
                                type: 'foreignKeyOptions',
                                data: { column: msg.column, options },
                            });
                        }
                        break;
                    case 'beginTransaction':
                        if (this.onBeginTransaction) {
                            await this.onBeginTransaction();
                            this.postMessage({ type: 'transactionStatus', data: { active: true } });
                        }
                        break;
                    case 'commitTransaction':
                        if (this.onCommitTransaction) {
                            await this.onCommitTransaction();
                            this.postMessage({ type: 'transactionStatus', data: { active: false } });
                        }
                        break;
                    case 'rollbackTransaction':
                        if (this.onRollbackTransaction) {
                            await this.onRollbackTransaction();
                            this.postMessage({ type: 'transactionStatus', data: { active: false } });
                        }
                        break;
                    case 'createSavepoint':
                        if (this.onCreateSavepoint) {
                            await this.onCreateSavepoint(msg.name || 'sp1');
                        }
                        break;
                    case 'rollbackToSavepoint':
                        if (this.onRollbackToSavepoint) {
                            await this.onRollbackToSavepoint(msg.name || 'sp1');
                        }
                        break;
                    case 'requestBlobPreview':
                        this._handleBlobPreview(msg.rowIndex, msg.colIndex);
                        break;
                    case 'executePanelSql':
                        if (msg.sql && this.onExecutePanelSql) {
                            await this.onExecutePanelSql(msg.sql);
                        }
                        break;
                    case 'changeDatabase':
                        if (this.onChangeDatabase) {
                            await this.onChangeDatabase(msg.database);
                        }
                        break;
                    case 'requestCompletion': {
                        const items = await this._languageBridge.handleCompletionRequest(
                            msg.sql,
                            msg.position,
                            msg.dialect,
                        );
                        this.postMessage({
                            type: 'completionResult',
                            data: { requestId: msg.requestId, items },
                        });
                        break;
                    }
                    case 'requestHover': {
                        const contents = await this._languageBridge.handleHoverRequest(
                            msg.sql,
                            msg.position,
                            msg.dialect,
                        );
                        this.postMessage({
                            type: 'hoverResult',
                            data: { requestId: msg.requestId, contents },
                        });
                        break;
                    }
                    case 'requestFormat': {
                        const formattedSql = await this._languageBridge.handleFormatRequest(
                            msg.sql,
                            msg.dialect,
                        );
                        this.postMessage({
                            type: 'formatResult',
                            data: { requestId: msg.requestId, formattedSql },
                        });
                        break;
                    }
                    case 'requestDiagnostics': {
                        const diagnostics = await this._languageBridge.handleDiagnosticsRequest(
                            msg.sql,
                            msg.dialect,
                        );
                        this.postMessage({
                            type: 'diagnosticsResult',
                            data: { requestId: msg.requestId, diagnostics },
                        });
                        break;
                    }
                    case 'webviewReady': {
                        this._webviewReady = true;
                        this._sendLanguageData();
                        this._sendDatabaseList();
                        if (this._pendingSql) {
                            this.postMessage({
                                type: 'setEditorSql',
                                data: this._pendingSql,
                            });
                            this._pendingSql = undefined;
                        }
                        break;
                    }
                }
            }
        );
    }

    public showResult(result: QueryResult, connectionName?: string, connectionColor?: string, tableName?: string): void {
        this._currentResult = result;

        try {
            const activeConn = this._connectionService.getActiveConnection();
            if (activeConn) {
                const newDialect = activeConn.dialect || 'mysql';
                if (newDialect !== this._currentDialect) {
                    this._currentDialect = newDialect;
                    this._sendLanguageData();
                }
            }
        } catch (e) { /* ignore: dialect detection is best-effort */ handleError(e, 'QueryResultPanel.dialectDetection', ErrorCategory.SUB_ITEM) }

        // Threshold above which we drop the main-thread copy of rows after
        // streaming them to the webview. 100k rows is large enough to keep the
        // common interactive case fully cached while still bounding memory for
        // genuinely large exports. When triggered, the extension host retains
        // only the first page (see LARGE_RESULT_RETAIN_ROWS) plus metadata.
        const LARGE_RESULT_THRESHOLD = 100000;
        // Number of leading rows the extension host keeps after streaming a
        // large result, so that the first page and in-row blob previews keep
        // working without re-querying.
        const LARGE_RESULT_RETAIN_ROWS = 1000;

        const totalRows = result.rows.length;
        const isLargeResultSet = totalRows > LARGE_RESULT_THRESHOLD;

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
            // Signal to the webview that client-side sort/filter is disabled
            // and the user should push these operations into SQL.
            largeResultSet: isLargeResultSet,
        };

        this.postMessage({
            type: 'queryResultStart',
            data: metadata,
        });

        const BATCH_SIZE = 1000;
        const rows = result.rows;
        const totalBatches = Math.ceil(totalRows / BATCH_SIZE);
        const colNames = result.columns.map((c) => c.name);
        const colCount = colNames.length;

        for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
            const start = batchIndex * BATCH_SIZE;
            const end = Math.min(start + BATCH_SIZE, totalRows);
            const batchRows: unknown[][] = new Array<unknown[]>(end - start);

            for (let i = start; i < end; i++) {
                const row = rows[i];
                const values = new Array(colCount);
                for (let j = 0; j < colCount; j++) {
                    values[j] = row[colNames[j]];
                }
                batchRows[i - start] = values;
                // Once a row has been serialized into a postMessage batch we
                // no longer need the original object on the main thread. For
                // large result sets we null out the slot so the GC can reclaim
                // the row immediately, instead of waiting for the entire
                // result set to be sent. We keep the first LARGE_RESULT_RETAIN
                // rows intact so the first page / blob previews still work.
                if (isLargeResultSet && i >= LARGE_RESULT_RETAIN_ROWS) {
                    rows[i] = undefined as unknown as QueryRow;
                }
            }

            this.postMessage({
                type: 'queryResultBatch',
                data: {
                    batchIndex,
                    totalBatches,
                    rows: batchRows,
                },
            });
        }

        if (isLargeResultSet) {
            // Drop the rows beyond the retained head so the extension host no
            // longer holds the full result set. Replace `rows` with a trimmed
            // array (keeping the first page region) so downstream code that
            // reads `_currentResult.rows` keeps working for the first page.
            const retained = result.rows.slice(0, LARGE_RESULT_RETAIN_ROWS);
            result.rows = retained;
            // Keep rowCount as the server-reported total so the UI can display
            // "showing N of M" correctly; rows.length is now the retained head.
        }

        this.postMessage({
            type: 'queryResultEnd',
            data: { queryId: result.queryId },
        });
    }

    public showLoading(sql: string): void {
        this.postMessage({
            type: 'queryStart',
            data: { sql },
        });
    }

    public showError(error: QueryError): void {
        this.postMessage({
            type: 'queryError',
            data: error,
        });
    }

    public setSqlAndExecute(sql: string): void {
        const data = { sql, autoExecute: true };
        if (this._webviewReady) {
            this.postMessage({
                type: 'setEditorSql',
                data,
            });
        } else {
            this._pendingSql = data;
        }
    }

    public setSql(sql: string): void {
        const data = { sql, autoExecute: false };
        if (this._webviewReady) {
            this.postMessage({
                type: 'setEditorSql',
                data,
            });
        } else {
            this._pendingSql = data;
        }
    }

    public clear(): void {
        this._currentResult = undefined;
        this.postMessage({
            type: 'clear',
        });
    }

    public sendHistoryData(entries: QueryHistoryEntry[]): void {
        this.postMessage({
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

    public sendDatabaseList(databases: string[], currentDatabase: string): void {
        this.postMessage({
            type: 'databaseList',
            data: { databases, currentDatabase },
        });
    }

    public override dispose(): void {
        if (this._sendLanguageDataTimer) {
            clearTimeout(this._sendLanguageDataTimer);
            this._sendLanguageDataTimer = undefined;
        }
        this._languageBridge.dispose();
        super.dispose();
    }

    private _sendLanguageData(): void {
        if (this._sendLanguageDataTimer) {
            clearTimeout(this._sendLanguageDataTimer);
        }
        this._sendLanguageDataTimer = setTimeout(() => {
            const data = this._languageBridge.exportLanguageData(this._currentDialect);
            this.postMessage({
                type: 'languageData',
                data,
            });
            this._sendLanguageDataTimer = undefined;
        }, 100);
    }

    private _sendDatabaseList(): void {
        try {
            const activeConn = this._connectionService.getActiveConnection();
            if (activeConn) {
                const adapter = this._connectionService.getAdapter(activeConn.id);
                if (adapter) {
                    adapter.metadataAdapter.listDatabases().then(dbs => {
                        const databases = dbs.map(d => d.name);
                        this.sendDatabaseList(databases, activeConn.database || '');
                    }).catch((_e) => { /* ignore: database list prefetch is best-effort */ handleError(_e, 'QueryResultPanel.databaseListPrefetch', ErrorCategory.SUB_ITEM) });
                }
            }
        } catch (e) { /* ignore: database list is best-effort */ handleError(e, 'QueryResultPanel.sendDatabaseList', ErrorCategory.SUB_ITEM) }
    }

    private async _handleExport(format: string, options?: Record<string, unknown>): Promise<void> {
        if (!this._currentResult) {
            vscode.window.showWarningMessage(t('resultPanel.noResultToExport'));
            return;
        }

        try {
            const columns = this._currentResult.columns;
            const rows = this._currentResult.rows;
            const tableName = (options?.tableName as string) || 'exported_table';

            switch (format) {
                case 'csv':
                    await this._dataTransferService.exportToCsv(rows, columns);
                    break;
                case 'json':
                    await this._dataTransferService.exportToJson(rows, columns);
                    break;
                case 'insert': {
                    const activeConnCfg = this._connectionService.getActiveConnection();
                    const insertAdapter = activeConnCfg ? this._connectionService.getAdapter(activeConnCfg.id) : undefined;
                    await this._dataTransferService.exportToInsert(rows, columns, tableName, undefined, insertAdapter);
                    break;
                }
                case 'ddl':
                    await this._handleDdlExport(options);
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
        options?: Record<string, unknown>
    ): Promise<void> {
        const activeConfig = this._connectionService.getActiveConnection();
        const adapter = activeConfig
            ? this._connectionService.getAdapter(activeConfig.id)
            : undefined;

        if (!adapter) {
            vscode.window.showWarningMessage(t('resultPanel.noActiveConnectionForDDL'));
            return;
        }

        const database = options?.database as string || activeConfig?.database || '';
        const table = options?.tableName as string || '';

        if (!table) {
            vscode.window.showWarningMessage(t('resultPanel.noTableForDDL'));
            return;
        }

        await this._dataTransferService.exportToDdl(adapter, database, table);
    }

    private _handleBlobPreview(rowIndex: number, colIndex: number): void {
        if (!this._currentResult) return;
        const row = this._currentResult.rows[rowIndex];
        const col = this._currentResult.columns[colIndex];
        if (!row || !col) return;

        const value = row[col.name];
        if (value === null || value === undefined) {
            this.postMessage({
                type: 'blobPreview',
                data: { rowIndex, colIndex, content: null, mode: 'null' },
            });
            return;
        }

        if (typeof value === 'number' || typeof value === 'boolean') {
            this.postMessage({
                type: 'blobPreview',
                data: { rowIndex, colIndex, content: String(value), mode: 'text' },
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

        if (buffer.length > maxSize) {
            this.postMessage({
                type: 'blobPreview',
                data: { rowIndex, colIndex, size: buffer.length, mode: 'too_large' },
            });
            return;
        }

        const isImage = this._detectImageBuffer(buffer);
        if (isImage) {
            const base64 = buffer.toString('base64');
            const mimeType = this._getImageMimeType(buffer);
            this.postMessage({
                type: 'blobPreview',
                data: { rowIndex, colIndex, content: base64, mimeType, mode: 'image' },
            });
            return;
        }

        const textMaxSize = config.get<number>('dataEditor.blobTextPreviewSize', 1048576);
        if (buffer.length <= textMaxSize) {
            try {
                const text = buffer.toString('utf-8');
                this.postMessage({
                    type: 'blobPreview',
                    data: { rowIndex, colIndex, content: text, mode: 'text' },
                });
            } catch (e) {
                // Text preview failed; fall back to hex representation
                handleError(e, 'QueryResultPanel.blobTextPreview', ErrorCategory.SUB_ITEM)
                this.postMessage({
                    type: 'blobPreview',
                    data: { rowIndex, colIndex, content: buffer.toString('hex'), mode: 'hex' },
                });
            }
        } else {
            const hexPreview = buffer.subarray(0, 1024).toString('hex');
            this.postMessage({
                type: 'blobPreview',
                data: { rowIndex, colIndex, content: hexPreview, mode: 'hex' },
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
