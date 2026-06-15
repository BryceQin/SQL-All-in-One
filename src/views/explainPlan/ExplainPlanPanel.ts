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

        const instance = new ExplainPlanPanel(panel, extensionUri);
        BaseWebviewPanel.registerInstance(instance);
        return instance;
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
