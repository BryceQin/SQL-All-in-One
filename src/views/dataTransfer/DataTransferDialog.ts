import * as vscode from 'vscode';
import * as fs from 'fs';
import { BaseWebviewPanel, type WebviewPanelConfig } from '../BaseWebviewPanel';
import { getConnectionManager } from '../../database/connection/ConnectionManager';
import { getLanguage } from '../../i18n';
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

export class DataTransferDialog extends BaseWebviewPanel {
    public static readonly viewType = 'sqlAllInOneDataTransfer';

    protected readonly panelConfig: WebviewPanelConfig = {
        viewType: DataTransferDialog.viewType,
        htmlFileName: 'data-transfer.html',
        cssFileName: 'data-transfer.css',
        jsFileName: 'data-transfer.js',
    };

    public static createOrShow(extensionUri: vscode.Uri, _context: vscode.ExtensionContext): DataTransferDialog {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        const existing = BaseWebviewPanel.getExistingInstance<DataTransferDialog>(DataTransferDialog.viewType);
        if (existing) {
            BaseWebviewPanel.revealExisting(DataTransferDialog.viewType, column || vscode.ViewColumn.Two);
            return existing;
        }

        const panel = BaseWebviewPanel.createWebviewPanel(
            DataTransferDialog.viewType,
            'Data Transfer',
            extensionUri,
            { viewColumn: column ? column + 1 : vscode.ViewColumn.Two }
        );

        const instance = new DataTransferDialog(panel, extensionUri);
        BaseWebviewPanel.registerInstance(instance);
        return instance;
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        super(panel, extensionUri);
        this._initialize();
    }

    private async _initialize(): Promise<void> {
        const configData = { lang: getLanguage() };
        const configJson = JSON.stringify(configData).replace(/<\/script>/gi, '<\\/script>');
        const configScript = '<script>window.__DATA_TRANSFER_CONFIG__ = ' + configJson + ';</script>';
        await this.initializeHtml([
            { placeholder: '{{CONFIG_INJECT}}', value: configScript },
        ]);
        this.onDidReceiveMessage(async (message: unknown) => {
            const msg = message as DataTransferMessage;
            switch (msg.command) {
                case 'selectFile':
                    await this._handleSelectFile();
                    break;
                case 'requestTables':
                    await this._handleRequestTables();
                    break;
                case 'requestColumns':
                    await this._handleRequestColumns(msg.tableName ?? '');
                    break;
                case 'requestPreview':
                    await this._handleRequestPreview(msg.filePath ?? '', msg.format ?? '', msg.previewRows ?? 10, msg.delimiter);
                    break;
                case 'startImport':
                    if (msg.config) {
                        await this._handleStartImport(msg.config);
                    }
                    break;
                case 'readFilePreview':
                    await this._handleReadFilePreview(msg.firstLineFilePath ?? '');
                    break;
            }
        });
    }

    private async _handleReadFilePreview(filePath: string): Promise<void> {
        if (!filePath) {
            this.postMessage({
                type: 'filePreview',
                error: 'No file path provided.',
            });
            return;
        }

        try {
            if (!fs.existsSync(filePath)) {
                this.postMessage({
                    type: 'filePreview',
                    error: 'File not found: ' + filePath,
                });
                return;
            }

            const content = await fs.promises.readFile(filePath, 'utf-8');
            const firstLine = content.split(/\r?\n/)[0] || '';

            this.postMessage({
                type: 'filePreview',
                firstLine,
            });
        } catch (error: unknown) {
            this.postMessage({
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
            this.postMessage({
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
            this.postMessage({
                type: 'tables',
                tables: [],
                error: 'No active connection. Please connect to a database first.',
            });
            return;
        }

        const adapter = connectionManager.getAdapter(activeConfig.id);
        if (!adapter) {
            this.postMessage({
                type: 'tables',
                tables: [],
                error: 'No database adapter available. Please reconnect.',
            });
            return;
        }

        try {
            const database = activeConfig.database || '';
            const tables = await adapter.listTables(database);
            this.postMessage({
                type: 'tables',
                tables: tables.map((t) => t.name),
            });
        } catch (error: unknown) {
            this.postMessage({
                type: 'tables',
                tables: [],
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    private async _handleRequestColumns(tableName: string): Promise<void> {
        if (!tableName) {
            this.postMessage({
                type: 'columns',
                columns: [],
                error: 'No table specified.',
            });
            return;
        }

        const connectionManager = getConnectionManager();
        const activeConfig = connectionManager.getActiveConnection();

        if (!activeConfig) {
            this.postMessage({
                type: 'columns',
                columns: [],
                error: 'No active connection.',
            });
            return;
        }

        const adapter = connectionManager.getAdapter(activeConfig.id);
        if (!adapter) {
            this.postMessage({
                type: 'columns',
                columns: [],
                error: 'No database adapter available.',
            });
            return;
        }

        try {
            const database = activeConfig.database || '';
            const structure = await adapter.describeTable(database, tableName);
            this.postMessage({
                type: 'columns',
                columns: structure.columns.map((c) => ({
                    name: c.name,
                    type: c.type,
                    nullable: c.nullable,
                    isPrimaryKey: c.isPrimaryKey,
                })),
            });
        } catch (error: unknown) {
            this.postMessage({
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
            this.postMessage({
                type: 'previewError',
                error: 'No file selected.',
            });
            return;
        }

        try {
            if (!fs.existsSync(filePath)) {
                this.postMessage({
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
                    this.postMessage({
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

                this.postMessage({
                    type: 'preview',
                    headers,
                    rows,
                    format: 'csv',
                });
            } else if (format === 'json') {
                const content = await fs.promises.readFile(filePath, 'utf-8');
                const records = JSON.parse(content) as unknown[];
                if (!Array.isArray(records) || records.length === 0) {
                    this.postMessage({
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

                this.postMessage({
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

                this.postMessage({
                    type: 'preview',
                    headers: ['Statement'],
                    rows: previewStatements.map((s) => [s.length > 200 ? s.substring(0, 200) + '...' : s]),
                    format: 'sql',
                    totalStatements: statements.length,
                });
            }
        } catch (error: unknown) {
            this.postMessage({
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
            this.postMessage({
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
            this.postMessage({
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
                        this.postMessage({
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

                    this.postMessage({
                        type: 'importResult',
                        result,
                    });
                } catch (error: unknown) {
                    this.postMessage({
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
