import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ConnectionManager } from '../../database/connection/ConnectionManager';
import {
    importFromCsv,
    importFromJson,
    importFromSql,
    detectFileFormat,
    detectCsvDelimiter,
    type ImportResult,
    type CsvImportOptions,
    type JsonImportOptions,
} from '../../database/transfer/DataImporter';

export class DataTransferDialog {
    public static currentPanel: DataTransferDialog | undefined;
    public static readonly viewType = 'sqlAllInOneDataTransfer';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private readonly _context: vscode.ExtensionContext;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri, context: vscode.ExtensionContext): DataTransferDialog {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (DataTransferDialog.currentPanel) {
            DataTransferDialog.currentPanel._panel.reveal(column || vscode.ViewColumn.Two);
            return DataTransferDialog.currentPanel;
        }

        const panel = vscode.window.createWebviewPanel(
            DataTransferDialog.viewType,
            'Data Transfer',
            column ? column + 1 : vscode.ViewColumn.Two,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'media'),
                    vscode.Uri.joinPath(extensionUri, 'src', 'views', 'dataTransfer'),
                ],
                retainContextWhenHidden: true,
            }
        );

        DataTransferDialog.currentPanel = new DataTransferDialog(panel, extensionUri, context);
        return DataTransferDialog.currentPanel;
    }

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        context: vscode.ExtensionContext
    ) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._context = context;

        this._update();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'selectFile':
                        await this._handleSelectFile();
                        break;
                    case 'requestTables':
                        await this._handleRequestTables();
                        break;
                    case 'requestColumns':
                        await this._handleRequestColumns(message.tableName);
                        break;
                    case 'requestPreview':
                        await this._handleRequestPreview(message.filePath, message.format, message.previewRows, message.delimiter);
                        break;
                    case 'startImport':
                        await this._handleStartImport(message.config);
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    public dispose(): void {
        DataTransferDialog.currentPanel = undefined;
        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private _update(): void {
        this._panel.webview.html = this._getHtmlForWebview();
    }

    private _getHtmlForWebview(): string {
        try {
            const htmlPath = path.join(
                this._extensionUri.fsPath,
                'src',
                'views',
                'dataTransfer',
                'transferDialog.html'
            );
            let html = fs.readFileSync(htmlPath, 'utf-8');

            const cssUri = this._panel.webview.asWebviewUri(
                vscode.Uri.joinPath(this._extensionUri, 'src', 'views', 'dataTransfer', 'transferDialog.css')
            );
            const jsUri = this._panel.webview.asWebviewUri(
                vscode.Uri.joinPath(this._extensionUri, 'src', 'views', 'dataTransfer', 'transferDialog.js')
            );

            html = html.replace('{{CSS_URI}}', cssUri.toString());
            html = html.replace('{{JS_URI}}', jsUri.toString());

            return html;
        } catch {
            return '<html><body><h2>Failed to load Data Transfer dialog</h2><p>Please reinstall the extension.</p></body></html>';
        }
    }

    private async _handleSelectFile(): Promise<void> {
        const uris = await vscode.window.showOpenDialog({
            canSelectMany: false,
            openLabel: 'Select Data File',
            filters: {
                'Data Files': ['csv', 'json', 'sql', 'tsv'],
            },
        });

        if (uris && uris.length > 0) {
            const filePath = uris[0].fsPath;
            let detectedFormat: string;
            try {
                detectedFormat = detectFileFormat(filePath);
            } catch {
                detectedFormat = 'csv';
            }
            this._panel.webview.postMessage({
                type: 'fileSelected',
                filePath,
                format: detectedFormat,
            });
        }
    }

    private async _handleRequestTables(): Promise<void> {
        const connectionManager = ConnectionManager.getInstance();
        const activeConfig = connectionManager.getActiveConnection();

        if (!activeConfig) {
            this._panel.webview.postMessage({
                type: 'tables',
                tables: [],
                error: 'No active connection. Please connect to a database first.',
            });
            return;
        }

        const adapter = connectionManager.getAdapter(activeConfig.id);
        if (!adapter) {
            this._panel.webview.postMessage({
                type: 'tables',
                tables: [],
                error: 'No database adapter available. Please reconnect.',
            });
            return;
        }

        try {
            const database = activeConfig.database || '';
            const tables = await adapter.listTables(database);
            this._panel.webview.postMessage({
                type: 'tables',
                tables: tables.map((t) => t.name),
            });
        } catch (error: any) {
            this._panel.webview.postMessage({
                type: 'tables',
                tables: [],
                error: error.message || String(error),
            });
        }
    }

    private async _handleRequestColumns(tableName: string): Promise<void> {
        if (!tableName) {
            this._panel.webview.postMessage({
                type: 'columns',
                columns: [],
                error: 'No table specified.',
            });
            return;
        }

        const connectionManager = ConnectionManager.getInstance();
        const activeConfig = connectionManager.getActiveConnection();

        if (!activeConfig) {
            this._panel.webview.postMessage({
                type: 'columns',
                columns: [],
                error: 'No active connection.',
            });
            return;
        }

        const adapter = connectionManager.getAdapter(activeConfig.id);
        if (!adapter) {
            this._panel.webview.postMessage({
                type: 'columns',
                columns: [],
                error: 'No database adapter available.',
            });
            return;
        }

        try {
            const database = activeConfig.database || '';
            const structure = await adapter.describeTable(database, tableName);
            this._panel.webview.postMessage({
                type: 'columns',
                columns: structure.columns.map((c) => ({
                    name: c.name,
                    type: c.type,
                    nullable: c.nullable,
                    isPrimaryKey: c.isPrimaryKey,
                })),
            });
        } catch (error: any) {
            this._panel.webview.postMessage({
                type: 'columns',
                columns: [],
                error: error.message || String(error),
            });
        }
    }

    private async _handleRequestPreview(
        filePath: string,
        format: string,
        previewRows: number,
        delimiter?: string,
    ): Promise<void> {
        if (!filePath) {
            this._panel.webview.postMessage({
                type: 'previewError',
                error: 'No file selected.',
            });
            return;
        }

        try {
            if (!fs.existsSync(filePath)) {
                this._panel.webview.postMessage({
                    type: 'previewError',
                    error: 'File not found: ' + filePath,
                });
                return;
            }

            const rowCount = previewRows || 10;

            if (format === 'csv') {
                const content = fs.readFileSync(filePath, 'utf-8');
                const lines = content.split(/\r?\n/).filter((l) => l.trim() !== '');
                if (lines.length === 0) {
                    this._panel.webview.postMessage({
                        type: 'previewError',
                        error: 'File is empty.',
                    });
                    return;
                }

                const actualDelimiter = delimiter === 'auto' || !delimiter
                    ? detectCsvDelimiter(lines[0])
                    : delimiter === 'tab' ? '\t' : delimiter === 'semicolon' ? ';' : ',';

                const { parseCsvLine } = await import('../../database/transfer/DataImporter.js');
                const headers = parseCsvLine(lines[0], actualDelimiter);
                const rows: string[][] = [];
                for (let i = 1; i < Math.min(lines.length, rowCount + 1); i++) {
                    rows.push(parseCsvLine(lines[i], actualDelimiter));
                }

                this._panel.webview.postMessage({
                    type: 'preview',
                    headers,
                    rows,
                    format: 'csv',
                });
            } else if (format === 'json') {
                const content = fs.readFileSync(filePath, 'utf-8');
                const records = JSON.parse(content);
                if (!Array.isArray(records) || records.length === 0) {
                    this._panel.webview.postMessage({
                        type: 'previewError',
                        error: 'JSON file must contain a non-empty array.',
                    });
                    return;
                }

                const headers = Object.keys(records[0]);
                const rows = records.slice(0, rowCount).map((r: Record<string, unknown>) =>
                    headers.map((h) => String(r[h] ?? ''))
                );

                this._panel.webview.postMessage({
                    type: 'preview',
                    headers,
                    rows,
                    format: 'json',
                });
            } else if (format === 'sql') {
                const content = fs.readFileSync(filePath, 'utf-8');
                const statements = content
                    .split(';')
                    .map((s) => s.trim())
                    .filter((s) => s.length > 0);

                const previewStatements = statements.slice(0, rowCount);

                this._panel.webview.postMessage({
                    type: 'preview',
                    headers: ['Statement'],
                    rows: previewStatements.map((s) => [s.length > 200 ? s.substring(0, 200) + '...' : s]),
                    format: 'sql',
                    totalStatements: statements.length,
                });
            }
        } catch (error: any) {
            this._panel.webview.postMessage({
                type: 'previewError',
                error: error.message || String(error),
            });
        }
    }

    private async _handleStartImport(config: {
        filePath: string;
        format: string;
        tableName: string;
        newTableName?: string;
        mapping?: Record<string, string>;
        onError: 'skip' | 'abort';
        dedupStrategy: 'ignore' | 'skip' | 'update';
        batchSize: number;
        delimiter?: string;
        encoding?: string;
    }): Promise<void> {
        const connectionManager = ConnectionManager.getInstance();
        const activeConfig = connectionManager.getActiveConnection();

        if (!activeConfig) {
            this._panel.webview.postMessage({
                type: 'importResult',
                result: {
                    success: false,
                    totalRows: 0,
                    importedRows: 0,
                    skippedRows: 0,
                    errors: [{ row: 0, message: 'No active connection.', data: '' }],
                },
            });
            return;
        }

        const adapter = connectionManager.getAdapter(activeConfig.id);
        if (!adapter) {
            this._panel.webview.postMessage({
                type: 'importResult',
                result: {
                    success: false,
                    totalRows: 0,
                    importedRows: 0,
                    skippedRows: 0,
                    errors: [{ row: 0, message: 'No database adapter available.', data: '' }],
                },
            });
            return;
        }

        const tableName = config.newTableName || config.tableName;

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Importing data...',
                cancellable: true,
            },
            async (progress) => {
                try {
                    let result: ImportResult;

                    if (config.format === 'csv') {
                        const csvDelimiter = config.delimiter === 'tab'
                            ? '\t'
                            : config.delimiter === 'semicolon'
                                ? ';'
                                : config.delimiter === 'auto' || !config.delimiter
                                    ? undefined
                                    : ',';

                        const options: CsvImportOptions = {
                            delimiter: csvDelimiter,
                            encoding: config.encoding || 'utf-8',
                            hasHeaders: true,
                            batchSize: config.batchSize || 100,
                            onError: config.onError || 'skip',
                            dedupStrategy: config.dedupStrategy || 'ignore',
                            mapping: config.mapping,
                        };

                        progress.report({ message: `Importing CSV to ${tableName}...` });
                        result = await importFromCsv(adapter, tableName, config.filePath, options);
                    } else if (config.format === 'json') {
                        const options: JsonImportOptions = {
                            batchSize: config.batchSize || 100,
                            onError: config.onError || 'skip',
                            dedupStrategy: config.dedupStrategy || 'ignore',
                        };

                        progress.report({ message: `Importing JSON to ${tableName}...` });
                        result = await importFromJson(adapter, tableName, config.filePath, options);
                    } else if (config.format === 'sql') {
                        progress.report({ message: 'Executing SQL file...' });
                        result = await importFromSql(adapter, config.filePath);
                    } else {
                        result = {
                            success: false,
                            totalRows: 0,
                            importedRows: 0,
                            skippedRows: 0,
                            errors: [{ row: 0, message: `Unsupported format: ${config.format}`, data: '' }],
                        };
                    }

                    this._panel.webview.postMessage({
                        type: 'importResult',
                        result,
                    });
                } catch (error: any) {
                    this._panel.webview.postMessage({
                        type: 'importResult',
                        result: {
                            success: false,
                            totalRows: 0,
                            importedRows: 0,
                            skippedRows: 0,
                            errors: [{ row: 0, message: error.message || String(error), data: '' }],
                        },
                    });
                }
            }
        );
    }
}
