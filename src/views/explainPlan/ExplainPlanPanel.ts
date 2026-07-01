import * as vscode from 'vscode';
import { BaseWebviewPanel, type WebviewPanelConfig } from '../BaseWebviewPanel';
import type { IConnectionService, IExplainPlanService } from '../../application/ports';
import { getContainer, Tokens } from '../../core/diContainer';
import { getLanguage } from '../../i18n';

export class ExplainPlanPanel extends BaseWebviewPanel {
    public static readonly viewType = 'sqlAllInOneExplainPlan';

    protected readonly panelConfig: WebviewPanelConfig = {
        viewType: ExplainPlanPanel.viewType,
        htmlFileName: 'explain-panel.html',
        cssFileName: 'explain-panel.css',
        jsFileName: 'explain-panel.js',
    };

    private readonly _connectionService: IConnectionService;
    private readonly _explainPlanService: IExplainPlanService;

    public static createOrShow(
        extensionUri: vscode.Uri,
        _context: vscode.ExtensionContext,
        connectionService?: IConnectionService,
        explainPlanService?: IExplainPlanService,
    ): ExplainPlanPanel {
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

        const instance = new ExplainPlanPanel(panel, extensionUri, connectionService, explainPlanService);
        BaseWebviewPanel.registerInstance(instance);
        return instance;
    }

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        connectionService?: IConnectionService,
        explainPlanService?: IExplainPlanService,
    ) {
        super(panel, extensionUri);
        // Resolve port services from the DI container (core layer) when the
        // caller did not inject them explicitly. Task 7 will wire the ports
        // at the call site.
        const container = getContainer();
        this._connectionService = connectionService ?? container.get(Tokens.ConnectionService);
        this._explainPlanService = explainPlanService ?? container.get(Tokens.ExplainPlanService);
        this._initialize();
    }

    private async _initialize(): Promise<void> {
        // Build config injection (no nonce — base class regex adds it)
        const configData = { lang: getLanguage() };
        const configJson = JSON.stringify(configData).replace(/<\/script>/gi, '<\\/script>');
        const configScript = '<script>window.__CONFIG__ = ' + configJson + ';</script>';

        await this.initializeHtml([
            { placeholder: '{{CONFIG_INJECT}}', value: configScript },
        ]);
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
        const activeConfig = this._connectionService.getActiveConnection();

        if (!activeConfig) {
            this.postMessage({
                command: 'explainError',
                error: 'No active connection. Please connect to a database first.',
            });
            return;
        }

        const adapter = this._connectionService.getAdapter(activeConfig.id);
        if (!adapter) {
            this.postMessage({
                command: 'explainError',
                error: 'No database adapter available. Please reconnect.',
            });
            return;
        }

        const capabilities = adapter.schemaAdapter.getDialectCapabilities();
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

            const result = await adapter.schemaAdapter.getExplainPlan(database, explainSql);
            const parsed = this._explainPlanService.parseExplain(result.raw);
            const suggestions = this._explainPlanService.generateSuggestions(parsed);

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
