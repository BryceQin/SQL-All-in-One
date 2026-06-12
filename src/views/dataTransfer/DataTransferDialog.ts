import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { getConnectionManager } from '../../database/connection/ConnectionManager';
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

interface DataTransferMessage {
    command: string;
    tableName?: string;
    filePath?: string;
    format?: string;
    previewRows?: number;
    delimiter?: string;
    config?: {
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
    };
    firstLineFilePath?: string;
}

export class DataTransferDialog {
    public static currentPanel: DataTransferDialog | undefined;
    public static readonly viewType = 'sqlAllInOneDataTransfer';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private _cachedHtml: string | undefined;

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
        _context: vscode.ExtensionContext
    ) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        // this.__context = context;

        this._update();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async (message: DataTransferMessage) => {
                switch (message.command) {
                    case 'selectFile':
                        await this._handleSelectFile();
                        break;
                    case 'requestTables':
                        await this._handleRequestTables();
                        break;
                    case 'requestColumns':
                        await this._handleRequestColumns(message.tableName ?? '');
                        break;
                    case 'requestPreview':
                        await this._handleRequestPreview(message.filePath ?? '', message.format ?? '', message.previewRows ?? 10, message.delimiter);
                        break;
                    case 'startImport':
                        if (message.config) {
                            await this._handleStartImport(message.config);
                        }
                        break;
                    case 'readFilePreview':
                        await this._handleReadFilePreview(message.firstLineFilePath ?? '');
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
        if (this._cachedHtml) {
            this._panel.webview.html = this._cachedHtml;
            return;
        }
        this._getHtmlForWebview().then(html => {
            this._cachedHtml = html;
            this._panel.webview.html = html;
        }).catch(e => {
            console.error('[SQL All in One] Failed to load DataTransferDialog HTML:', e);
        });
    }

    private async _getHtmlForWebview(): Promise<string> {
        try {
            const htmlPath = path.join(
                this._extensionUri.fsPath,
                'media',
                'data-transfer.html'
            );
            let html = await fs.promises.readFile(htmlPath, 'utf-8');

            const cssUri = this._panel.webview.asWebviewUri(
                vscode.Uri.joinPath(this._extensionUri, 'media', 'data-transfer.css')
            );
            const jsUri = this._panel.webview.asWebviewUri(
                vscode.Uri.joinPath(this._extensionUri, 'media', 'data-transfer.js')
            );

            html = html.replace('{{CSS_URI}}', cssUri.toString());
            html = html.replace('{{JS_URI}}', jsUri.toString());
            html = html.replace(/\{\{CSP_SOURCE\}\}/g, this._panel.webview.cspSource);

            const nonce = crypto.randomUUID();
            html = html.replace(/\{\{CSP_NONCE\}\}/g, nonce);
            html = html.replace(/<script(?=\s)/g, `<script nonce="${nonce}"`);
            html = html.replace(/<style(?=\s)/g, `<style nonce="${nonce}"`);

            return html;
        } catch (error) {
            console.error('Failed to load Data Transfer dialog HTML:', error);
            return '<html><body><h2>Failed to load Data Transfer dialog</h2><p>Please reinstall the extension.</p></body></html>';
        }
    }

    private async _handleReadFilePreview(filePath: string): Promise<void> {
        if (!filePath) {
            this._panel.webview.postMessage({
                type: 'filePreview',
                error: 'No file path provided.',
            });
            return;
        }

        try {
            if (!fs.existsSync(filePath)) {
                this._panel.webview.postMessage({
                    type: 'filePreview',
                    error: 'File not found: ' + filePath,
                });
                return;
            }

            const content = await fs.promises.readFile(filePath, 'utf-8');
            const firstLine = content.split(/\r?\n/)[0] || '';

            this._panel.webview.postMessage({
                type: 'filePreview',
                firstLine,
            });
        } catch (error: unknown) {
            this._panel.webview.postMessage({
                type: 'filePreview',
                error: error instanceof Error ? error.message : String(error),
            });
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
        const connectionManager = getConnectionManager();
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
        } catch (error: unknown) {
            this._panel.webview.postMessage({
                type: 'tables',
                tables: [],
                error: error instanceof Error ? error.message : String(error),
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

        const connectionManager = getConnectionManager();
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
        } catch (error: unknown) {
            this._panel.webview.postMessage({
                type: 'columns',
                columns: [],
                error: error instanceof Error ? error.message : String(error),
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
                const content = await fs.promises.readFile(filePath, 'utf-8');
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
                const content = await fs.promises.readFile(filePath, 'utf-8');
                const records = JSON.parse(content) as unknown[];
                if (!Array.isArray(records) || records.length === 0) {
                    this._panel.webview.postMessage({
                        type: 'previewError',
                        error: 'JSON file must contain a non-empty array.',
                    });
                    return;
                }

                const headers = Object.keys(records[0] as Record<string, unknown>);
                const rows = records.slice(0, rowCount).map((r: unknown) => {
                    const record = r as Record<string, unknown>;
                    return headers.map((h) => String(record[h] ?? ''));
                });

                this._panel.webview.postMessage({
                    type: 'preview',
                    headers,
                    rows,
                    format: 'json',
                });
            } else if (format === 'sql') {
                const content = await fs.promises.readFile(filePath, 'utf-8');
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
        } catch (error: unknown) {
            this._panel.webview.postMessage({
                type: 'previewError',
                error: error instanceof Error ? error.message : String(error),
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
        const connectionManager = getConnectionManager();
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
            async (progress, token) => {
                try {
                    if (token.isCancellationRequested) {
                        this._panel.webview.postMessage({
                            type: 'importResult',
                            result: {
                                success: false,
                                totalRows: 0,
                                importedRows: 0,
                                skippedRows: 0,
                                errors: [{ row: 0, message: 'Import cancelled by user.', data: '' }],
                            },
                        });
                        return;
                    }

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
                } catch (error: unknown) {
                    this._panel.webview.postMessage({
                        type: 'importResult',
                        result: {
                            success: false,
                            totalRows: 0,
                            importedRows: 0,
                            skippedRows: 0,
                            errors: [{ row: 0, message: error instanceof Error ? error.message : String(error), data: '' }],
                        },
                    });
                }
            }
        );
    }
}
