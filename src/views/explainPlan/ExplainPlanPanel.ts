import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getConnectionManager } from '../../database/connection/ConnectionManager';
import { ExplainPlan } from '../../database/query/ExplainPlan';

export class ExplainPlanPanel {
    public static currentPanel: ExplainPlanPanel | undefined;
    public static readonly viewType = 'sqlAllInOneExplainPlan';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    // Context is received but not used in this dialog
    // private readonly __context: vscode.ExtensionContext;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri, context: vscode.ExtensionContext): ExplainPlanPanel {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (ExplainPlanPanel.currentPanel) {
            ExplainPlanPanel.currentPanel._panel.reveal(column || vscode.ViewColumn.Two);
            return ExplainPlanPanel.currentPanel;
        }

        const panel = vscode.window.createWebviewPanel(
            ExplainPlanPanel.viewType,
            'EXPLAIN Plan',
            column ? column + 1 : vscode.ViewColumn.Two,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'media'),
                ],
                retainContextWhenHidden: true,
            }
        );

        ExplainPlanPanel.currentPanel = new ExplainPlanPanel(panel, extensionUri, context);
        return ExplainPlanPanel.currentPanel;
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
            async (message: { command?: string; sql?: string }) => {
                switch (message.command) {
                    case 'runAnalyze':
                        if (message.sql) {
                            this.showExplainPlan(message.sql, true);
                        }
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    public async showExplainPlan(sql: string, useAnalyze = false): Promise<void> {
        const connectionManager = getConnectionManager();
        const activeConfig = connectionManager.getActiveConnection();

        if (!activeConfig) {
            this._panel.webview.postMessage({
                command: 'explainError',
                error: 'No active connection. Please connect to a database first.',
            });
            return;
        }

        const adapter = connectionManager.getAdapter(activeConfig.id);
        if (!adapter) {
            this._panel.webview.postMessage({
                command: 'explainError',
                error: 'No database adapter available. Please reconnect.',
            });
            return;
        }

        const capabilities = adapter.getDialectCapabilities();
        if (!capabilities.supportsExplain) {
            this._panel.webview.postMessage({
                command: 'explainError',
                error: 'EXPLAIN is not supported by this database dialect.',
            });
            return;
        }

        if (useAnalyze && !capabilities.supportsExplainAnalyze) {
            this._panel.webview.postMessage({
                command: 'explainError',
                error: 'EXPLAIN ANALYZE is not supported by this database dialect.',
            });
            return;
        }

        this._panel.title = useAnalyze ? 'EXPLAIN ANALYZE (Actual)' : 'EXPLAIN (Estimated)';

        this._panel.webview.postMessage({
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

            this._panel.webview.postMessage({
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
            this._panel.webview.postMessage({
                command: 'explainError',
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    public dispose(): void {
        ExplainPlanPanel.currentPanel = undefined;
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
        });
    }

    private async _getHtmlForWebview(): Promise<string> {
        try {
            const htmlPath = path.join(
                this._extensionUri.fsPath,
                'media',
                'explain-panel.html'
            );
            let html = await fs.promises.readFile(htmlPath, 'utf-8');

            const cssUri = this._panel.webview.asWebviewUri(
                vscode.Uri.joinPath(this._extensionUri, 'media', 'explain-panel.css')
            );
            const jsUri = this._panel.webview.asWebviewUri(
                vscode.Uri.joinPath(this._extensionUri, 'media', 'explain-panel.js')
            );

            html = html.replace('{{CSS_URI}}', cssUri.toString());
            html = html.replace('{{JS_URI}}', jsUri.toString());

            return html;
        } catch (error) {
            console.error('Failed to load EXPLAIN Plan panel HTML:', error);
            return '<html><body><h2>Failed to load EXPLAIN Plan panel</h2><p>Please reinstall the extension.</p></body></html>';
        }
    }
}
