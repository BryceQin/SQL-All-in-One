# Webview Panel Base Class Refactoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract common Webview Panel boilerplate (singleton management, HTML loading, nonce/security, disposables) into a shared `BaseWebviewPanel` base class, then refactor 5 existing panels to inherit from it.

**Architecture:** Create an abstract `BaseWebviewPanel` class in `src/views/BaseWebviewPanel.ts` that encapsulates the repeated patterns across all 5 panel classes. Each existing panel extends this base class, keeping only its business-specific logic. The base class manages: singleton registry, HTML template loading with URI/CSP/nonce replacement, disposables lifecycle, and safe postMessage.

**Tech Stack:** TypeScript, VSCode Extension API

---

### Task 1: Create BaseWebviewPanel Base Class

**Files:**
- Create: `src/views/BaseWebviewPanel.ts`

- [ ] **Step 1: Create the BaseWebviewPanel abstract class**

```typescript
import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export interface WebviewPanelConfig {
    viewType: string;
    title: string;
    htmlFileName: string;
    cssFileName: string;
    jsFileName: string;
    additionalResourceRoots?: vscode.Uri[];
}

export abstract class BaseWebviewPanel implements vscode.Disposable {
    private static readonly _instances = new Map<string, BaseWebviewPanel>();

    protected readonly _panel: vscode.WebviewPanel;
    protected readonly _extensionUri: vscode.Uri;
    protected _disposables: vscode.Disposable[] = [];
    protected _cachedHtml: string | undefined;
    private _isDisposed = false;

    protected abstract readonly panelConfig: WebviewPanelConfig;

    protected constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    }

    protected static getExistingInstance<T extends BaseWebviewPanel>(viewType: string): T | undefined {
        const instance = BaseWebviewPanel._instances.get(viewType);
        return instance as T | undefined;
    }

    protected static registerInstance(instance: BaseWebviewPanel): void {
        BaseWebviewPanel._instances.set(instance.panelConfig.viewType, instance);
    }

    protected static unregisterInstance(viewType: string): void {
        BaseWebviewPanel._instances.delete(viewType);
    }

    protected static hasInstance(viewType: string): boolean {
        return BaseWebviewPanel._instances.has(viewType);
    }

    protected static revealExisting(viewType: string, viewColumn?: vscode.ViewColumn): boolean {
        const instance = BaseWebviewPanel._instances.get(viewType);
        if (instance && !instance._isDisposed) {
            instance._panel.reveal(viewColumn);
            return true;
        }
        return false;
    }

    protected static createWebviewPanel(
        viewType: string,
        title: string,
        extensionUri: vscode.Uri,
        options?: {
            viewColumn?: vscode.ViewColumn;
            additionalResourceRoots?: vscode.Uri[];
        }
    ): vscode.WebviewPanel {
        const resourceRoots = [
            vscode.Uri.joinPath(extensionUri, 'media'),
        ];
        if (options?.additionalResourceRoots) {
            resourceRoots.push(...options.additionalResourceRoots);
        }

        return vscode.window.createWebviewPanel(
            viewType,
            title,
            options?.viewColumn ?? vscode.ViewColumn.Two,
            {
                enableScripts: true,
                localResourceRoots: resourceRoots,
                retainContextWhenHidden: true,
            }
        );
    }

    protected async loadHtml(injections?: Array<{ placeholder: string; value: string }>): Promise<string> {
        if (this._cachedHtml) {
            return this._cachedHtml;
        }

        try {
            const cfg = this.panelConfig;
            const htmlPath = path.join(this._extensionUri.fsPath, 'media', cfg.htmlFileName);
            let html = await fs.promises.readFile(htmlPath, 'utf-8');

            const cssUri = this._panel.webview.asWebviewUri(
                vscode.Uri.joinPath(this._extensionUri, 'media', cfg.cssFileName)
            );
            const jsUri = this._panel.webview.asWebviewUri(
                vscode.Uri.joinPath(this._extensionUri, 'media', cfg.jsFileName)
            );

            html = html.replace('{{CSS_URI}}', cssUri.toString());
            html = html.replace('{{JS_URI}}', jsUri.toString());
            html = html.replace(/\{\{CSP_SOURCE\}\}/g, this._panel.webview.cspSource);

            const nonce = crypto.randomUUID();
            html = html.replace(/\{\{CSP_NONCE\}\}/g, nonce);
            html = html.replace(/<script(?=\s)/g, `<script nonce="${nonce}"`);
            html = html.replace(/<style(?=\s)/g, `<style nonce="${nonce}"`);

            if (injections) {
                for (const injection of injections) {
                    html = html.replace(injection.placeholder, injection.value);
                }
            }

            this._cachedHtml = html;
            return html;
        } catch (error) {
            console.error(`Failed to load ${this.panelConfig.viewType} HTML:`, error);
            return `<html><body><h2>Failed to load panel</h2><p>Please reinstall the extension.</p></body></html>`;
        }
    }

    protected updateHtml(html: string): void {
        this._panel.webview.html = html;
    }

    protected async initializeHtml(injections?: Array<{ placeholder: string; value: string }>): Promise<void> {
        if (this._cachedHtml) {
            this._panel.webview.html = this._cachedHtml;
            return;
        }
        const html = await this.loadHtml(injections);
        this._panel.webview.html = html;
    }

    protected postMessage(message: unknown): void {
        if (this._isDisposed) {
            return;
        }
        try {
            this._panel.webview.postMessage(message);
        } catch {
            // Webview may be disposed between the check and the call
        }
    }

    protected onDidReceiveMessage(handler: (message: unknown) => void | Promise<void>): void {
        this._disposables.push(
            this._panel.webview.onDidReceiveMessage(handler, null, this._disposables)
        );
    }

    protected invalidateHtmlCache(): void {
        this._cachedHtml = undefined;
    }

    public get isDisposed(): boolean {
        return this._isDisposed;
    }

    public dispose(): void {
        if (this._isDisposed) {
            return;
        }
        this._isDisposed = true;
        BaseWebviewPanel.unregisterInstance(this.panelConfig.viewType);
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            x?.dispose();
        }
        this._cachedHtml = undefined;
    }
}
```

- [ ] **Step 2: Run TypeScript compilation to verify no errors**

Run: `cd /Users/hao/Downloads/sql-all-in-one && npx tsc --noEmit`
Expected: PASS (new file, no references yet)

- [ ] **Step 3: Commit**

```bash
git add src/views/BaseWebviewPanel.ts
git commit -m "feat: add BaseWebviewPanel abstract base class"
```

---

### Task 2: Refactor ExplainPlanPanel (Simplest Panel)

**Files:**
- Modify: `src/views/explainPlan/ExplainPlanPanel.ts`

ExplainPlanPanel is the simplest panel (201 lines), making it the ideal first refactoring target.

- [ ] **Step 1: Rewrite ExplainPlanPanel to extend BaseWebviewPanel**

```typescript
import * as vscode from 'vscode';
import { BaseWebviewPanel, type WebviewPanelConfig } from '../BaseWebviewPanel';
import { getConnectionManager } from '../../database/connection/ConnectionManager';
import { ExplainPlan } from '../../database/query/ExplainPlan';

export class ExplainPlanPanel extends BaseWebviewPanel {
    public static readonly viewType = 'sqlAllInOneExplainPlan';

    protected readonly panelConfig: WebviewPanelConfig = {
        viewType: ExplainPlanPanel.viewType,
        title: 'EXPLAIN Plan',
        htmlFileName: 'explain-panel.html',
        cssFileName: 'explain-panel.css',
        jsFileName: 'explain-panel.js',
    };

    public static createOrShow(extensionUri: vscode.Uri, _context: vscode.ExtensionContext): ExplainPlanPanel {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        const existing = BaseWebviewPanel.getExistingInstance<ExplainPlanPanel>(ExplainPlanPanel.viewType);
        if (existing) {
            BaseWebviewPanel.revealExisting(ExplainPlanPanel.viewType, column || vscode.ViewColumn.Two);
            return existing;
        }

        const panel = BaseWebviewPanel.createWebviewPanel(
            ExplainPlanPanel.viewType,
            'EXPLAIN Plan',
            extensionUri,
            { viewColumn: column ? column + 1 : vscode.ViewColumn.Two }
        );

        return new ExplainPlanPanel(panel, extensionUri);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        super(panel, extensionUri);
        this._initialize();
    }

    private async _initialize(): Promise<void> {
        await this.initializeHtml();
        this.onDidReceiveMessage(async (message: unknown) => {
            const msg = message as { command?: string; sql?: string };
            switch (msg.command) {
                case 'runAnalyze':
                    if (msg.sql) {
                        this.showExplainPlan(msg.sql, true);
                    }
                    break;
            }
        });
    }

    public async showExplainPlan(sql: string, useAnalyze = false): Promise<void> {
        const connectionManager = getConnectionManager();
        const activeConfig = connectionManager.getActiveConnection();

        if (!activeConfig) {
            this.postMessage({
                command: 'explainError',
                error: 'No active connection. Please connect to a database first.',
            });
            return;
        }

        const adapter = connectionManager.getAdapter(activeConfig.id);
        if (!adapter) {
            this.postMessage({
                command: 'explainError',
                error: 'No database adapter available. Please reconnect.',
            });
            return;
        }

        const capabilities = adapter.getDialectCapabilities();
        if (!capabilities.supportsExplain) {
            this.postMessage({
                command: 'explainError',
                error: 'EXPLAIN is not supported by this database dialect.',
            });
            return;
        }

        if (useAnalyze && !capabilities.supportsExplainAnalyze) {
            this.postMessage({
                command: 'explainError',
                error: 'EXPLAIN ANALYZE is not supported by this database dialect.',
            });
            return;
        }

        this._panel.title = useAnalyze ? 'EXPLAIN ANALYZE (Actual)' : 'EXPLAIN (Estimated)';

        this.postMessage({
            command: 'loading',
            sql,
        });

        try {
            const database = activeConfig.database || '';
            const explainSql = useAnalyze
                ? `EXPLAIN ANALYZE ${sql}`
                : `EXPLAIN FORMAT=JSON ${sql}`;

            const result = await adapter.getExplainPlan(database, explainSql);
            const parsed = ExplainPlan.parseMysqlExplain(result.raw);
            const suggestions = ExplainPlan.generateSuggestions(parsed);

            this.postMessage({
                command: 'explainResult',
                data: {
                    sql,
                    format: parsed.format,
                    nodes: parsed.nodes,
                    raw: parsed.raw,
                    suggestions,
                    useAnalyze,
                },
            });
        } catch (error: unknown) {
            this.postMessage({
                command: 'explainError',
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
}
```

- [ ] **Step 2: Run TypeScript compilation to verify no errors**

Run: `cd /Users/hao/Downloads/sql-all-in-one && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/views/explainPlan/ExplainPlanPanel.ts
git commit -m "refactor: ExplainPlanPanel extends BaseWebviewPanel"
```

---

### Task 3: Refactor DataTransferDialog

**Files:**
- Modify: `src/views/dataTransfer/DataTransferDialog.ts`

- [ ] **Step 1: Rewrite DataTransferDialog to extend BaseWebviewPanel**

```typescript
import * as vscode from 'vscode';
import * as fs from 'fs';
import { BaseWebviewPanel, type WebviewPanelConfig } from '../BaseWebviewPanel';
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

export class DataTransferDialog extends BaseWebviewPanel {
    public static readonly viewType = 'sqlAllInOneDataTransfer';

    protected readonly panelConfig: WebviewPanelConfig = {
        viewType: DataTransferDialog.viewType,
        title: 'Data Transfer',
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

        return new DataTransferDialog(panel, extensionUri);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        super(panel, extensionUri);
        this._initialize();
    }

    private async _initialize(): Promise<void> {
        await this.initializeHtml();
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
```

- [ ] **Step 2: Run TypeScript compilation to verify no errors**

Run: `cd /Users/hao/Downloads/sql-all-in-one && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/views/dataTransfer/DataTransferDialog.ts
git commit -m "refactor: DataTransferDialog extends BaseWebviewPanel"
```

---

### Task 4: Refactor TableDesignerPanel

**Files:**
- Modify: `src/views/tableDesigner/TableDesignerPanel.ts`

TableDesignerPanel has custom config injection (`__TABLE_DESIGNER_CONFIG__`) and uses `crypto.randomUUID()` without importing `crypto` (it was relying on Node.js global). The base class handles this.

- [ ] **Step 1: Rewrite TableDesignerPanel to extend BaseWebviewPanel**

```typescript
import * as vscode from 'vscode';
import { BaseWebviewPanel, type WebviewPanelConfig } from '../BaseWebviewPanel';
import { getConnectionManager } from '../../database/connection/ConnectionManager';
import { getSchemaCache } from '../../database/schema/SchemaCache';
import type { IDatabaseAdapter, TableStructure, DataTypeCategory } from '../../database/adapters/IDatabaseAdapter';

interface ColumnDesign {
    id: string;
    name: string;
    type: string;
    length: string;
    nullable: boolean;
    defaultValue: string;
    comment: string;
    isPrimaryKey: boolean;
    isAutoIncrement: boolean;
    isUnique: boolean;
    originalName?: string;
}

interface IndexDesign {
    id: string;
    name: string;
    type: string;
    columns: string[];
    isUnique: boolean;
}

interface FkDesign {
    id: string;
    name: string;
    columns: string[];
    referencedTable: string;
    referencedColumns: string[];
    onDelete: string;
    onUpdate: string;
}

interface TriggerDesign {
    id: string;
    name: string;
    timing: string;
    event: string;
    statement: string;
}

interface TableOptions {
    engine: string;
    charset: string;
    collation: string;
    autoIncrement: string;
    comment: string;
}

interface TableDesignData {
    tableName: string;
    columns: ColumnDesign[];
    indexes: IndexDesign[];
    foreignKeys: FkDesign[];
    triggers: TriggerDesign[];
    options: TableOptions;
    mode: 'create' | 'edit';
    originalStructure?: TableStructure;
}

interface DesignerMessage {
    command: string;
    data?: TableDesignData;
    table?: string;
    sql?: string;
}

export class TableDesignerPanel extends BaseWebviewPanel {
    public static readonly viewType = 'sqlAllInOneTableDesigner';

    protected readonly panelConfig: WebviewPanelConfig = {
        viewType: TableDesignerPanel.viewType,
        title: 'Table Designer',
        htmlFileName: 'table-designer.html',
        cssFileName: 'table-designer.css',
        jsFileName: 'table-designer.js',
    };

    private _mode: 'create' | 'edit' = 'create';
    private _database = '';
    private _tableName = '';
    private _originalStructure?: TableStructure;

    public static createOrShow(extensionUri: vscode.Uri, _context: vscode.ExtensionContext): TableDesignerPanel {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        const existing = BaseWebviewPanel.getExistingInstance<TableDesignerPanel>(TableDesignerPanel.viewType);
        if (existing) {
            BaseWebviewPanel.revealExisting(TableDesignerPanel.viewType, column || vscode.ViewColumn.Two);
            return existing;
        }

        const panel = BaseWebviewPanel.createWebviewPanel(
            TableDesignerPanel.viewType,
            'Table Designer',
            extensionUri,
            { viewColumn: column ? column + 1 : vscode.ViewColumn.Two }
        );

        return new TableDesignerPanel(panel, extensionUri);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        super(panel, extensionUri);
        this._initialize();
    }

    private async _initialize(): Promise<void> {
        const configData = {
            mode: this._mode,
            database: this._database,
            tableName: this._tableName,
        };
        const configScript = '<script nonce="PLACEHOLDER">window.__TABLE_DESIGNER_CONFIG__ = ' + JSON.stringify(configData) + ';</script>';
        await this.initializeHtml([
            { placeholder: '{{CONFIG_INJECT}}', value: configScript },
        ]);
        this.onDidReceiveMessage(async (message: unknown) => {
            const msg = message as DesignerMessage;
            switch (msg.command) {
                case 'save':
                    if (msg.data) {
                        await this._handleSave(msg.data);
                    }
                    break;
                case 'requestTableList':
                    await this._handleRequestTableList();
                    break;
                case 'requestColumnList':
                    await this._handleRequestColumnList(msg.table ?? '');
                    break;
                case 'exportSql':
                    if (msg.sql) {
                        await this._handleExportSql(msg.sql);
                    }
                    break;
                case 'close':
                    this.dispose();
                    break;
            }
        });
    }

    public async openForCreate(database: string): Promise<void> {
        this._mode = 'create';
        this._database = database;
        this._tableName = '';
        this._originalStructure = undefined;
        this._panel.title = '\u{1F4CB} New Table - Table Designer';

        const adapter = this._getAdapter();
        let dataTypes: DataTypeCategory[] = [];
        if (adapter) {
            try {
                dataTypes = adapter.getSupportedDataTypes();
            } catch {
                dataTypes = [];
            }
        }

        const emptyData: TableDesignData = {
            tableName: '',
            columns: [this._createDefaultColumn()],
            indexes: [],
            foreignKeys: [],
            triggers: [],
            options: {
                engine: 'InnoDB',
                charset: 'utf8mb4',
                collation: 'utf8mb4_general_ci',
                autoIncrement: '',
                comment: '',
            },
            mode: 'create',
        };

        this.postMessage({
            command: 'tableStructure',
            data: emptyData,
            dataTypes: dataTypes,
        });
    }

    public async openForEdit(database: string, table: string): Promise<void> {
        this._mode = 'edit';
        this._database = database;
        this._tableName = table;
        this._panel.title = `\u{1F4CB} ${table} - Table Designer`;

        const adapter = this._getAdapter();
        if (!adapter) {
            vscode.window.showErrorMessage('No active database connection');
            return;
        }

        let dataTypes: DataTypeCategory[] = [];
        try {
            dataTypes = adapter.getSupportedDataTypes();
        } catch {
            dataTypes = [];
        }

        let structure: TableStructure;
        try {
            structure = await adapter.describeTable(database, table);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load table structure: ${(error as Error).message}`);
            return;
        }

        this._originalStructure = structure;

        const columns: ColumnDesign[] = structure.columns.map((col, idx) => ({
            id: `col_${idx}_${Date.now()}`,
            name: col.name,
            type: col.type,
            length: col.length !== undefined ? String(col.length) : '',
            nullable: col.nullable,
            defaultValue: col.defaultValue !== undefined ? String(col.defaultValue) : '',
            comment: col.comment || '',
            isPrimaryKey: col.isPrimaryKey,
            isAutoIncrement: col.isAutoIncrement,
            isUnique: col.isUnique,
            originalName: col.name,
        }));

        const indexes: IndexDesign[] = structure.indexes.map((idx, i) => ({
            id: `idx_${i}_${Date.now()}`,
            name: idx.name,
            type: idx.type,
            columns: [...idx.columns],
            isUnique: idx.isUnique,
        }));

        const foreignKeys: FkDesign[] = structure.foreignKeys.map((fk, i) => ({
            id: `fk_${i}_${Date.now()}`,
            name: fk.name,
            columns: [...fk.columns],
            referencedTable: fk.referencedTable,
            referencedColumns: [...fk.referencedColumns],
            onDelete: fk.onDelete,
            onUpdate: fk.onUpdate,
        }));

        const triggers: TriggerDesign[] = structure.triggers.map((trg, i) => ({
            id: `trg_${i}_${Date.now()}`,
            name: trg.name,
            timing: trg.timing,
            event: trg.event,
            statement: trg.statement,
        }));

        const designData: TableDesignData = {
            tableName: table,
            columns,
            indexes,
            foreignKeys,
            triggers,
            options: {
                engine: structure.engine || 'InnoDB',
                charset: structure.charset || 'utf8mb4',
                collation: '',
                autoIncrement: '',
                comment: structure.comment || '',
            },
            mode: 'edit',
            originalStructure: structure,
        };

        this.postMessage({
            command: 'tableStructure',
            data: designData,
            dataTypes: dataTypes,
        });
    }

    public dispose(): void {
        (this as unknown as { _originalStructure?: unknown })._originalStructure = undefined;
        super.dispose();
    }

    private _getAdapter(): IDatabaseAdapter | undefined {
        const connectionManager = getConnectionManager();
        const activeConn = connectionManager.getActiveConnection();
        if (!activeConn) {
            return undefined;
        }
        return connectionManager.getAdapter(activeConn.id);
    }

    private _createDefaultColumn(): ColumnDesign {
        return {
            id: `col_0_${Date.now()}`,
            name: '',
            type: 'INT',
            length: '',
            nullable: false,
            defaultValue: '',
            comment: '',
            isPrimaryKey: false,
            isAutoIncrement: false,
            isUnique: false,
        };
    }

    private _validateDesign(data: TableDesignData): string | null {
        if (!data.tableName || data.tableName.trim() === '') {
            return 'Table name is required';
        }

        if (!data.columns || data.columns.length === 0) {
            return 'At least one column is required';
        }

        const emptyNames = data.columns.filter(c => !c.name || c.name.trim() === '');
        if (emptyNames.length > 0) {
            return 'Column names cannot be empty';
        }

        const names = data.columns.map(c => c.name.toLowerCase());
        const duplicates = names.filter((name, idx) => names.indexOf(name) !== idx);
        if (duplicates.length > 0) {
            return `Duplicate column names: ${[...new Set(duplicates)].join(', ')}`;
        }

        return null;
    }

    private async _handleSave(data: TableDesignData): Promise<void> {
        const validationError = this._validateDesign(data);
        if (validationError) {
            this.postMessage({
                command: 'saveResult',
                success: false,
                error: validationError,
            });
            return;
        }

        const adapter = this._getAdapter();
        if (!adapter) {
            this.postMessage({
                command: 'saveResult',
                success: false,
                error: 'No active database connection',
            });
            return;
        }

        let sql: string;
        try {
            if (this._mode === 'create') {
                sql = this._generateCreateDDL(data);
            } else {
                sql = this._generateAlterDDL(data);
            }
        } catch (error) {
            this.postMessage({
                command: 'saveResult',
                success: false,
                error: `Failed to generate DDL: ${(error as Error).message}`,
            });
            return;
        }

        if (!sql || sql.trim() === '') {
            vscode.window.showInformationMessage('No changes detected');
            return;
        }

        const confirmed = await vscode.window.showWarningMessage(
            'Execute the following SQL?',
            { modal: true, detail: sql },
            'Execute'
        );

        if (confirmed !== 'Execute') {
            return;
        }

        try {
            const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);
            for (const stmt of statements) {
                await adapter.execute(stmt);
            }

            const connectionManager = getConnectionManager();
            const activeConn = connectionManager.getActiveConnection();
            if (activeConn) {
                getSchemaCache().invalidate(activeConn.id, 'table', this._database);
            }

            this.dispose();
            vscode.window.showInformationMessage(
                this._mode === 'create'
                    ? `Table \`${data.tableName}\` created successfully`
                    : `Table \`${data.tableName}\` updated successfully`
            );
        } catch (error) {
            this.postMessage({
                command: 'saveResult',
                success: false,
                error: (error as Error).message,
            });
        }
    }

    private async _handleRequestTableList(): Promise<void> {
        const adapter = this._getAdapter();
        if (!adapter) {
            this.postMessage({
                command: 'tableList',
                tables: [],
            });
            return;
        }

        try {
            const tables = await adapter.listTables(this._database);
            this.postMessage({
                command: 'tableList',
                tables: tables.map(t => t.name),
            });
        } catch {
            this.postMessage({
                command: 'tableList',
                tables: [],
            });
        }
    }

    private async _handleRequestColumnList(table: string): Promise<void> {
        const adapter = this._getAdapter();
        if (!adapter) {
            this.postMessage({
                command: 'columnList',
                table: table,
                columns: [],
            });
            return;
        }

        try {
            const structure = await adapter.describeTable(this._database, table);
            this.postMessage({
                command: 'columnList',
                table: table,
                columns: structure.columns.map(c => c.name),
            });
        } catch {
            this.postMessage({
                command: 'columnList',
                table: table,
                columns: [],
            });
        }
    }

    private async _handleExportSql(sql: string): Promise<void> {
        if (!sql) return;
        const document = await vscode.workspace.openTextDocument({
            content: sql,
            language: 'sql',
        });
        await vscode.window.showTextDocument(document);
    }

    private _generateCreateDDL(data: TableDesignData): string {
        const lines: string[] = [];

        for (const col of data.columns) {
            let line = `  \`${col.name}\` ${col.type.toUpperCase()}`;
            if (col.length) {
                line += `(${col.length})`;
            }
            if (!col.nullable) {
                line += ' NOT NULL';
            }
            if (col.isAutoIncrement) {
                line += ' AUTO_INCREMENT';
            }
            if (col.defaultValue) {
                if (col.defaultValue.toUpperCase() === 'NULL' ||
                    col.defaultValue.toUpperCase() === 'CURRENT_TIMESTAMP' ||
                    col.defaultValue.toUpperCase() === 'CURRENT_DATE') {
                    line += ` DEFAULT ${col.defaultValue}`;
                } else {
                    line += ` DEFAULT '${col.defaultValue.replace(/'/g, "''")}'`;
                }
            }
            if (col.comment) {
                line += ` COMMENT '${col.comment.replace(/'/g, "\\'")}'`;
            }
            lines.push(line);
        }

        const pkColumns = data.columns.filter(c => c.isPrimaryKey);
        if (pkColumns.length > 0) {
            lines.push(`  PRIMARY KEY (${pkColumns.map(c => `\`${c.name}\``).join(', ')})`);
        }

        for (const idx of data.indexes) {
            if (idx.isUnique) {
                lines.push(`  UNIQUE KEY \`${idx.name}\` (${idx.columns.map(c => `\`${c}\``).join(', ')})`);
            } else {
                lines.push(`  KEY \`${idx.name}\` (${idx.columns.map(c => `\`${c}\``).join(', ')})`);
            }
        }

        for (const fk of data.foreignKeys) {
            let fkLine = `  CONSTRAINT \`${fk.name}\` FOREIGN KEY (${fk.columns.map(c => `\`${c}\``).join(', ')}) REFERENCES \`${fk.referencedTable}\` (${fk.referencedColumns.map(c => `\`${c}\``).join(', ')})`;
            if (fk.onDelete) {
                fkLine += ` ON DELETE ${fk.onDelete}`;
            }
            if (fk.onUpdate) {
                fkLine += ` ON UPDATE ${fk.onUpdate}`;
            }
            lines.push(fkLine);
        }

        let ddl = `CREATE TABLE \`${data.tableName}\` (\n${lines.join(',\n')}\n)`;

        const options: string[] = [];
        if (data.options.engine) {
            options.push(`ENGINE=${data.options.engine}`);
        }
        if (data.options.charset) {
            options.push(`DEFAULT CHARSET=${data.options.charset}`);
        }
        if (data.options.collation) {
            options.push(`COLLATE=${data.options.collation}`);
        }
        if (data.options.autoIncrement) {
            options.push(`AUTO_INCREMENT=${data.options.autoIncrement}`);
        }
        if (data.options.comment) {
            options.push(`COMMENT='${data.options.comment.replace(/'/g, "\\'")}'`);
        }

        if (options.length > 0) {
            ddl += ' ' + options.join(' ');
        }

        ddl += ';';

        return ddl;
    }

    private _generateAlterDDL(data: TableDesignData): string {
        const statements: string[] = [];
        const original = this._originalStructure;

        if (!original) {
            return this._generateCreateDDL(data);
        }

        for (const col of data.columns) {
            const originalCol = original.columns.find(c => c.name === (col.originalName || col.name));

            if (!originalCol && !col.originalName) {
                let addSql = `ALTER TABLE \`${data.tableName}\` ADD COLUMN \`${col.name}\` ${col.type.toUpperCase()}`;
                if (col.length) {
                    addSql += `(${col.length})`;
                }
                if (!col.nullable) {
                    addSql += ' NOT NULL';
                }
                if (col.isAutoIncrement) {
                    addSql += ' AUTO_INCREMENT';
                }
                if (col.defaultValue) {
                    if (col.defaultValue.toUpperCase() === 'NULL' ||
                        col.defaultValue.toUpperCase() === 'CURRENT_TIMESTAMP' ||
                        col.defaultValue.toUpperCase() === 'CURRENT_DATE') {
                        addSql += ` DEFAULT ${col.defaultValue}`;
                    } else {
                        addSql += ` DEFAULT '${col.defaultValue.replace(/'/g, "''")}'`;
                    }
                }
                if (col.comment) {
                    addSql += ` COMMENT '${col.comment.replace(/'/g, "\\'")}'`;
                }
                statements.push(addSql + ';');
            } else if (originalCol) {
                const isRenamed = col.originalName && col.originalName !== col.name;
                const isModified =
                    originalCol.type.toUpperCase() !== col.type.toUpperCase() ||
                    String(originalCol.length || '') !== col.length ||
                    originalCol.nullable !== col.nullable ||
                    originalCol.isAutoIncrement !== col.isAutoIncrement ||
                    String(originalCol.defaultValue || '') !== col.defaultValue ||
                    (originalCol.comment || '') !== col.comment;

                if (isRenamed || isModified) {
                    let modSql: string;
                    if (isRenamed) {
                        modSql = `ALTER TABLE \`${data.tableName}\` CHANGE COLUMN \`${col.originalName}\` \`${col.name}\` ${col.type.toUpperCase()}`;
                    } else {
                        modSql = `ALTER TABLE \`${data.tableName}\` MODIFY COLUMN \`${col.name}\` ${col.type.toUpperCase()}`;
                    }
                    if (col.length) {
                        modSql += `(${col.length})`;
                    }
                    if (!col.nullable) {
                        modSql += ' NOT NULL';
                    }
                    if (col.isAutoIncrement) {
                        modSql += ' AUTO_INCREMENT';
                    }
                    if (col.defaultValue) {
                        if (col.defaultValue.toUpperCase() === 'NULL' ||
                            col.defaultValue.toUpperCase() === 'CURRENT_TIMESTAMP' ||
                            col.defaultValue.toUpperCase() === 'CURRENT_DATE') {
                            modSql += ` DEFAULT ${col.defaultValue}`;
                        } else {
                            modSql += ` DEFAULT '${col.defaultValue.replace(/'/g, "''")}'`;
                        }
                    }
                    if (col.comment) {
                        modSql += ` COMMENT '${col.comment.replace(/'/g, "\\'")}'`;
                    }
                    statements.push(modSql + ';');
                }
            }
        }

        for (const origCol of original.columns) {
            const stillExists = data.columns.some(c => c.name === origCol.name || c.originalName === origCol.name);
            if (!stillExists) {
                statements.push(`ALTER TABLE \`${data.tableName}\` DROP COLUMN \`${origCol.name}\`;`);
            }
        }

        const originalIdxNames = new Set(original.indexes.map(i => i.name));
        const newIdxNames = new Set(data.indexes.map(i => i.name));

        for (const idx of data.indexes) {
            if (!originalIdxNames.has(idx.name)) {
                if (idx.isUnique) {
                    statements.push(`ALTER TABLE \`${data.tableName}\` ADD UNIQUE KEY \`${idx.name}\` (${idx.columns.map(c => `\`${c}\``).join(', ')});`);
                } else {
                    statements.push(`ALTER TABLE \`${data.tableName}\` ADD KEY \`${idx.name}\` (${idx.columns.map(c => `\`${c}\``).join(', ')});`);
                }
            }
        }

        for (const origIdx of original.indexes) {
            if (!newIdxNames.has(origIdx.name) && !origIdx.isPrimary) {
                statements.push(`ALTER TABLE \`${data.tableName}\` DROP INDEX \`${origIdx.name}\`;`);
            }
        }

        const originalFkNames = new Set(original.foreignKeys.map(f => f.name));
        const newFkNames = new Set(data.foreignKeys.map(f => f.name));

        for (const origFk of original.foreignKeys) {
            if (!newFkNames.has(origFk.name)) {
                statements.push(`ALTER TABLE \`${data.tableName}\` DROP FOREIGN KEY \`${origFk.name}\`;`);
            }
        }

        for (const fk of data.foreignKeys) {
            if (!originalFkNames.has(fk.name)) {
                let addFkSql = `ALTER TABLE \`${data.tableName}\` ADD CONSTRAINT \`${fk.name}\` FOREIGN KEY (${fk.columns.map(c => `\`${c}\``).join(', ')}) REFERENCES \`${fk.referencedTable}\` (${fk.referencedColumns.map(c => `\`${c}\``).join(', ')})`;
                if (fk.onDelete) {
                    addFkSql += ` ON DELETE ${fk.onDelete}`;
                }
                if (fk.onUpdate) {
                    addFkSql += ` ON UPDATE ${fk.onUpdate}`;
                }
                statements.push(addFkSql + ';');
            }
        }

        const originalTrgNames = new Set(original.triggers.map(t => t.name));
        const newTrgNames = new Set(data.triggers.map(t => t.name));

        for (const origTrg of original.triggers) {
            if (!newTrgNames.has(origTrg.name)) {
                statements.push(`DROP TRIGGER \`${origTrg.name}\`;`);
            }
        }

        for (const trg of data.triggers) {
            if (!originalTrgNames.has(trg.name)) {
                statements.push(`CREATE TRIGGER \`${trg.name}\` ${trg.timing} ${trg.event} ON \`${data.tableName}\` FOR EACH ROW ${trg.statement};`);
            }
        }

        if (data.options.comment !== (original.comment || '')) {
            const optionParts: string[] = [];
            if (data.options.engine) {
                optionParts.push(`ENGINE=${data.options.engine}`);
            }
            if (data.options.charset) {
                optionParts.push(`DEFAULT CHARSET=${data.options.charset}`);
            }
            if (data.options.collation) {
                optionParts.push(`COLLATE=${data.options.collation}`);
            }
            if (data.options.comment) {
                optionParts.push(`COMMENT='${data.options.comment.replace(/'/g, "\\'")}'`);
            }
            if (optionParts.length > 0) {
                statements.push(`ALTER TABLE \`${data.tableName}\` ${optionParts.join(' ')};`);
            }
        }

        return statements.join('\n');
    }
}
```

- [ ] **Step 2: Run TypeScript compilation to verify no errors**

Run: `cd /Users/hao/Downloads/sql-all-in-one && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/views/tableDesigner/TableDesignerPanel.ts
git commit -m "refactor: TableDesignerPanel extends BaseWebviewPanel"
```

---

### Task 5: Refactor ConnectionDialog

**Files:**
- Modify: `src/views/connectionDialog/ConnectionDialog.ts`

ConnectionDialog has a unique `show()` async factory method (returns a Promise), custom config injection (`__CONNECTION_DIALOG_CONFIG__`), i18n injection (`__CONNECTION_DIALOG_I18N__`), and a `_resolveDialog` callback pattern. These differences must be preserved.

- [ ] **Step 1: Rewrite ConnectionDialog to extend BaseWebviewPanel**

```typescript
import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { BaseWebviewPanel, type WebviewPanelConfig } from '../BaseWebviewPanel';
import { getConnectionManager } from '../../database/connection/ConnectionManager';
import { getConnectionStore } from '../../database/connection/ConnectionStore';
import { ConnectionConfig, ConnectionGroup } from '../../database/connection/ConnectionConfig';
import { DatabaseTreeProvider } from '../databaseExplorer/DatabaseTreeProvider';
import { t } from '../../i18n';

interface ConnectionDialogConfig {
    mode: 'create' | 'edit';
    connectionId?: string;
    dialect: string;
    groups: ConnectionGroup[];
    existingNames: string[];
    initialValues?: Partial<ConnectionConfig>;
}

interface DialogMessage {
    command: string;
    data?: unknown;
}

export class ConnectionDialog extends BaseWebviewPanel {
    public static readonly viewType = 'sqlAllInOneConnectionDialog';

    protected readonly panelConfig: WebviewPanelConfig = {
        viewType: ConnectionDialog.viewType,
        title: 'Connection Dialog',
        htmlFileName: 'connection-dialog.html',
        cssFileName: 'connection-dialog.css',
        jsFileName: 'connection-dialog.js',
    };

    private _mode: 'create' | 'edit' = 'create';
    private _connectionId?: string;
    private _treeProvider?: DatabaseTreeProvider;
    private _resolveDialog?: (result: { saved: boolean; connectionId?: string } | undefined) => void;

    public static async show(
        extensionUri: vscode.Uri,
        options: {
            mode: 'create' | 'edit';
            connectionId?: string;
            treeProvider?: DatabaseTreeProvider;
        }
    ): Promise<{ saved: boolean; connectionId?: string } | undefined> {
        const existing = BaseWebviewPanel.getExistingInstance<ConnectionDialog>(ConnectionDialog.viewType);
        if (existing) {
            BaseWebviewPanel.revealExisting(ConnectionDialog.viewType);
            return undefined;
        }

        const panel = BaseWebviewPanel.createWebviewPanel(
            ConnectionDialog.viewType,
            options.mode === 'create' ? t('connDialog.newConnection') : t('connDialog.editConnection'),
            extensionUri,
            { viewColumn: vscode.ViewColumn.One }
        );

        const dialog = new ConnectionDialog(panel, extensionUri, options.treeProvider);
        BaseWebviewPanel.registerInstance(dialog);

        dialog._mode = options.mode;
        dialog._connectionId = options.connectionId;

        const config = await dialog._buildConfig(options);
        await dialog._initializeWithConfig(config);

        return new Promise<{ saved: boolean; connectionId?: string } | undefined>((resolve) => {
            dialog._resolveDialog = resolve;
        });
    }

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        treeProvider?: DatabaseTreeProvider
    ) {
        super(panel, extensionUri);
        this._treeProvider = treeProvider;
    }

    private async _buildConfig(options: { mode: 'create' | 'edit'; connectionId?: string }): Promise<ConnectionDialogConfig> {
        const store = getConnectionStore();
        const groups = store.getGroups();
        const connections = store.getConnections();
        const existingNames = connections
            .filter(c => c.id !== options.connectionId)
            .map(c => c.name);

        let initialValues: Partial<ConnectionConfig> = {};
        let dialect = 'mysql';

        if (options.mode === 'edit' && options.connectionId) {
            const conn = store.getConnection(options.connectionId);
            if (conn) {
                initialValues = conn;
                dialect = conn.dialect;
            }
        }

        return {
            mode: options.mode,
            connectionId: options.connectionId,
            dialect,
            groups,
            existingNames,
            initialValues,
        };
    }

    private async _initializeWithConfig(config: ConnectionDialogConfig): Promise<void> {
        const nonce = crypto.randomUUID();
        const configScript = '<script nonce="' + nonce + '">window.__CONNECTION_DIALOG_CONFIG__ = ' + JSON.stringify(config) + ';</script>';

        const i18nData: Record<string, string> = {
            'newConnection': t('connDialog.newConnection'),
            'editConnection': t('connDialog.editConnection'),
            'configureDatabaseConnection': t('connDialog.configureParams'),
            'databaseType': t('connDialog.databaseType'),
            'connectionName': t('connDialog.connectionName'),
            'connectionNamePlaceholder': t('connDialog.connectionNamePh'),
            'group': t('connDialog.group'),
            'noGroup': t('connDialog.noGroup'),
            'colorTag': t('connDialog.colorTag'),
            'host': t('connDialog.host'),
            'port': t('connDialog.port'),
            'username': t('connDialog.username'),
            'password': t('connDialog.password'),
            'enterPassword': t('connDialog.enterPassword'),
            'database': t('connDialog.database'),
            'databaseFilePath': t('connDialog.databaseFilePath'),
            'databaseFilePathPlaceholder': t('connDialog.databaseFilePathPh'),
            'browse': t('connDialog.browse'),
            'useSshTunnel': t('connDialog.useSshTunnel'),
            'sshHost': t('connDialog.sshHost'),
            'sshPort': t('connDialog.sshPort'),
            'authenticationMethod': t('connDialog.authenticationMethod'),
            'privateKey': t('connDialog.authPrivateKey'),
            'sshPassword': t('connDialog.sshPasswordPh'),
            'passphrase': t('connDialog.passphrase'),
            'optionalPassphrase': t('connDialog.passphrasePh'),
            'useSsl': t('connDialog.useSsl'),
            'caCertificate': t('connDialog.caCertificate'),
            'clientCertificate': t('connDialog.clientCertificate'),
            'clientKey': t('connDialog.clientKey'),
            'verifyServerCertificate': t('connDialog.verifyServerCert'),
            'connectTimeout': t('connDialog.connectTimeout'),
            'poolSize': t('connDialog.poolSize'),
            'charset': t('connDialog.charset'),
            'timezone': t('connDialog.timezone'),
            'initialSql': t('connDialog.initialSql'),
            'test': t('connDialog.test'),
            'cancel': t('connDialog.cancel'),
            'save': t('connDialog.save'),
            'testing': t('connDialog.testing'),
            'connectionSuccessful': t('connDialog.connectionSuccessful'),
            'connectionFailed': t('connDialog.connectionFailed'),
            'saveFailed': t('connDialog.saveFailed'),
            'unknownError': t('connDialog.unknownError'),
            'nameRequired': t('connDialog.nameRequired'),
            'nameExists': t('connDialog.nameExists'),
            'hostRequired': t('connDialog.hostRequired'),
            'portRange': t('connDialog.portRange'),
            'usernameRequired': t('connDialog.usernameRequired'),
            'sqlitePathRequired': t('connDialog.sqlitePathRequired'),
            'sshHostRequired': t('connDialog.sshHostRequired'),
            'sshPortRange': t('connDialog.sshPortRange'),
            'sshUsernameRequired': t('connDialog.sshUsernameRequired'),
            'newGroup': t('connDialog.newGroup'),
            'enterNewGroupName': t('connDialog.enterNewGroupName'),
            'selectFile': t('connDialog.selectFile'),
            'none': t('connDialog.none'),
        };
        const i18nScript = '<script nonce="' + nonce + '">window.__CONNECTION_DIALOG_I18N__ = ' + JSON.stringify(i18nData) + ';</script>';

        await this.initializeHtml([
            { placeholder: '{{CONFIG_INJECT}}', value: configScript },
            { placeholder: '{{I18N_INJECT}}', value: i18nScript },
        ]);

        this.onDidReceiveMessage(async (message: unknown) => {
            const msg = message as DialogMessage;
            switch (msg.command) {
                case 'save':
                    await this._handleSave(msg.data as ConnectionConfig);
                    break;
                case 'testConnection':
                    await this._handleTestConnection(msg.data as ConnectionConfig);
                    break;
                case 'close':
                    this._closeDialog({ saved: false });
                    break;
                case 'browseFile':
                    await this._handleBrowseFile(msg.data as { field: string });
                    break;
            }
        });
    }

    private async _handleSave(formData: ConnectionConfig): Promise<void> {
        const validationError = this._validateForm(formData);
        if (validationError) {
            this.postMessage({
                command: 'saveResult',
                success: false,
                error: validationError,
            });
            return;
        }

        const manager = getConnectionManager();

        try {
            if (this._mode === 'edit' && this._connectionId) {
                const store = getConnectionStore();
                const saveConfig = { ...formData };

                if (!saveConfig.password) {
                    saveConfig.password = await store.getPassword(this._connectionId);
                }
                if (saveConfig.ssh?.enabled) {
                    if (!saveConfig.ssh.password) {
                        saveConfig.ssh = { ...saveConfig.ssh, password: await store.getSshPassword(this._connectionId) };
                    }
                    if (!saveConfig.ssh.passphrase) {
                        saveConfig.ssh = { ...saveConfig.ssh, passphrase: await store.getSshPassphrase(this._connectionId) };
                    }
                }

                await manager.updateConnection(this._connectionId, saveConfig, formData.password || undefined);
            } else {
                const id = crypto.randomUUID();
                const config = { ...formData, id };
                await manager.addConnection(config, formData.password || undefined);
                this._connectionId = id;
            }

            this._treeProvider?.refresh();
            this._closeDialog({ saved: true, connectionId: this._connectionId });
        } catch (error) {
            this.postMessage({
                command: 'saveResult',
                success: false,
                error: (error as Error).message,
            });
        }
    }

    private async _handleTestConnection(formData: ConnectionConfig): Promise<void> {
        const manager = getConnectionManager();
        const store = getConnectionStore();

        try {
            this.postMessage({ command: 'testStart' });

            let password = formData.password;
            let sshPassword = formData.ssh?.password;
            let sshPassphrase = formData.ssh?.passphrase;

            if (this._mode === 'edit' && this._connectionId) {
                if (!password) {
                    password = await store.getPassword(this._connectionId);
                }
                if (formData.ssh?.enabled && !sshPassword) {
                    sshPassword = await store.getSshPassword(this._connectionId);
                }
                if (formData.ssh?.enabled && !sshPassphrase) {
                    sshPassphrase = await store.getSshPassphrase(this._connectionId);
                }
            }

            const testConfig = { ...formData };
            if (testConfig.ssh) {
                testConfig.ssh = { ...testConfig.ssh, password: sshPassword, passphrase: sshPassphrase };
            }

            const result = await manager.testConnection(testConfig, password);

            this.postMessage({
                command: 'testResult',
                success: result.success,
                serverVersion: result.serverVersion,
                latency: result.latency,
                error: result.error,
            });
        } catch (error) {
            this.postMessage({
                command: 'testResult',
                success: false,
                error: (error as Error).message,
            });
        }
    }

    private async _handleBrowseFile(data: { field: string }): Promise<void> {
        const uris = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            title: t('connDialog.selectFile'),
        });

        if (uris && uris.length > 0) {
            this.postMessage({
                command: 'fileSelected',
                field: data.field,
                path: uris[0].fsPath,
            });
        }
    }

    private _validateForm(data: ConnectionConfig): string | null {
        if (!data.name || !data.name.trim()) {
            return t('connDialog.nameRequired');
        }

        const store = getConnectionStore();
        const existing = store.getConnections()
            .filter(c => c.id !== this._connectionId)
            .map(c => c.name);
        if (existing.includes(data.name.trim())) {
            return t('connDialog.nameExists');
        }

        if (data.dialect !== 'sqlite') {
            if (!data.host || !data.host.trim()) {
                return t('connDialog.hostRequired');
            }
            if (!data.port || data.port < 1 || data.port > 65535) {
                return t('connDialog.portRange');
            }
            if (!data.username || !data.username.trim()) {
                return t('connDialog.usernameRequired');
            }
        }

        if (data.ssh?.enabled) {
            if (!data.ssh.host) return t('connDialog.sshHostRequired');
            if (!data.ssh.port || data.ssh.port < 1 || data.ssh.port > 65535) return t('connDialog.sshPortRange');
            if (!data.ssh.username) return t('connDialog.sshUsernameRequired');
        }

        return null;
    }

    private _closeDialog(result: { saved: boolean; connectionId?: string }): void {
        if (this._resolveDialog) {
            this._resolveDialog(result);
            this._resolveDialog = undefined;
        }
        this.dispose();
    }

    public dispose(): void {
        if (this._resolveDialog) {
            this._resolveDialog(undefined);
            this._resolveDialog = undefined;
        }
        super.dispose();
    }
}
```

- [ ] **Step 2: Run TypeScript compilation to verify no errors**

Run: `cd /Users/hao/Downloads/sql-all-in-one && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/views/connectionDialog/ConnectionDialog.ts
git commit -m "refactor: ConnectionDialog extends BaseWebviewPanel"
```

---

### Task 6: Refactor QueryResultPanel (Most Complex Panel)

**Files:**
- Modify: `src/views/queryResult/QueryResultPanel.ts`

QueryResultPanel is the most complex panel (725 lines). It has: Monaco editor integration, custom config injection, LanguageBridge, theme change listener, `_isDisposed` guard, `_webviewReady` / `_pendingSql` pattern, and a `_postMessage` method with disposed check. The base class already provides `postMessage` with disposed check and `isDisposed` getter.

- [ ] **Step 1: Rewrite QueryResultPanel to extend BaseWebviewPanel**

```typescript
import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { BaseWebviewPanel, type WebviewPanelConfig } from '../BaseWebviewPanel';
import type { QueryResult, QueryError, QueryRow } from '../../database/adapters/IDatabaseAdapter';
import type { QueryHistoryEntry } from '../../database/query/QueryResult';
import { getLanguage, t } from '../../i18n';
import { LanguageBridge } from './LanguageBridge';
import { getConnectionManager } from '../../database/connection/ConnectionManager';

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
    | { command: 'requestDiagnostics'; requestId: string; sql: string; dialect: string }
    | { command: 'webviewReady' };

export class QueryResultPanel extends BaseWebviewPanel {
    public static readonly viewType = 'sqlAllInOneQueryResult';

    protected readonly panelConfig: WebviewPanelConfig = {
        viewType: QueryResultPanel.viewType,
        title: 'Query Result',
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

    public static createOrShow(extensionUri: vscode.Uri, _context: vscode.ExtensionContext): QueryResultPanel {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        const existing = BaseWebviewPanel.getExistingInstance<QueryResultPanel>(QueryResultPanel.viewType);
        if (existing) {
            BaseWebviewPanel.revealExisting(QueryResultPanel.viewType, column || vscode.ViewColumn.Two);
            return existing;
        }

        const panel = BaseWebviewPanel.createWebviewPanel(
            QueryResultPanel.viewType,
            'Query Result',
            extensionUri,
            { viewColumn: column ? column + 1 : vscode.ViewColumn.Two }
        );

        return new QueryResultPanel(panel, extensionUri);
    }

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri
    ) {
        super(panel, extensionUri);
        this._languageBridge = new LanguageBridge(extensionUri);
        this._initialize();
    }

    private async _initialize(): Promise<void> {
        this._disposables.push(
            vscode.window.onDidChangeActiveColorTheme((theme) => {
                this.postMessage({
                    type: 'themeChange',
                    data: { kind: theme.kind },
                });
            })
        );

        const nonce = crypto.randomUUID();
        const config = vscode.workspace.getConfiguration('SQL-All-in-One');
        const monacoLoaderUri = this._panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'monaco', 'vs', 'loader.js')
        );
        const monacoBaseUri = this._panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'monaco', 'vs')
        );

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
            lang: getLanguage(),
        };
        const configJson = JSON.stringify(configData).replace(/<\/script>/gi, '<\\/script>');
        const configScript = '<script nonce="' + nonce + '">window.__CONFIG__ = ' + configJson + ';</script>';

        await this.initializeHtml([
            { placeholder: '{{MONACO_LOADER_URI}}', value: monacoLoaderUri.toString() },
            { placeholder: '{{CONFIG_INJECT}}', value: configScript },
        ]);

        this._sendLanguageData();

        this.onDidReceiveMessage(async (message: unknown) => {
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
        });
    }

    public showResult(result: QueryResult, connectionName?: string, connectionColor?: string, tableName?: string): void {
        this._currentResult = result;

        try {
            const activeConn = getConnectionManager().getActiveConnection();
            if (activeConn) {
                const newDialect = activeConn.dialect || 'mysql';
                if (newDialect !== this._currentDialect) {
                    this._currentDialect = newDialect;
                    this._sendLanguageData();
                }
            }
        } catch { /* ignore */ }

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

        this.postMessage({
            type: 'queryResultStart',
            data: metadata,
        });

        const BATCH_SIZE = 1000;
        const rows = result.rows;
        const totalRows = rows.length;
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

    public dispose(): void {
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

    private async _handleExport(format: string, options?: Record<string, unknown>): Promise<void> {
        if (!this._currentResult) {
            vscode.window.showWarningMessage(t('resultPanel.noResultToExport'));
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
            vscode.window.showWarningMessage(t('resultPanel.noActiveConnectionForDDL'));
            return;
        }

        const database = options?.database as string || activeConfig?.database || '';
        const table = options?.tableName as string || '';

        if (!table) {
            vscode.window.showWarningMessage(t('resultPanel.noTableForDDL'));
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
            } catch {
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
```

- [ ] **Step 2: Run TypeScript compilation to verify no errors**

Run: `cd /Users/hao/Downloads/sql-all-in-one && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/views/queryResult/QueryResultPanel.ts
git commit -m "refactor: QueryResultPanel extends BaseWebviewPanel"
```

---

### Task 7: Final Verification and Cleanup

**Files:**
- All modified files

- [ ] **Step 1: Run full TypeScript compilation**

Run: `cd /Users/hao/Downloads/sql-all-in-one && npx tsc --noEmit`
Expected: PASS with zero errors

- [ ] **Step 2: Run ESLint**

Run: `cd /Users/hao/Downloads/sql-all-in-one && npx eslint src/views/BaseWebviewPanel.ts src/views/explainPlan/ExplainPlanPanel.ts src/views/dataTransfer/DataTransferDialog.ts src/views/tableDesigner/TableDesignerPanel.ts src/views/connectionDialog/ConnectionDialog.ts src/views/queryResult/QueryResultPanel.ts`
Expected: PASS with zero errors (or only pre-existing warnings)

- [ ] **Step 3: Verify no stale imports remain**

Search for any remaining `import * as crypto` or `import * as fs` or `import * as path` in the refactored panel files that are no longer needed:
- ExplainPlanPanel: should NOT import crypto, fs, path
- DataTransferDialog: should still import fs (used in business logic), should NOT import crypto, path
- TableDesignerPanel: should NOT import crypto, fs, path
- ConnectionDialog: should still import crypto (used in _handleSave), should NOT import fs, path
- QueryResultPanel: should still import crypto (used in _initialize), should NOT import fs, path

- [ ] **Step 4: Verify public API compatibility**

Check that all callers in `src/database/commands/SchemaCommands.ts` and `src/database/commands/QueryCommands.ts` still compile correctly with the refactored panels. The static `createOrShow` method signatures must remain compatible.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "refactor: complete Webview Panel base class extraction"
```
