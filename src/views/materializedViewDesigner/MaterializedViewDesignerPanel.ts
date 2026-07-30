import * as vscode from 'vscode';
import { BaseWebviewPanel, type WebviewPanelConfig } from '../BaseWebviewPanel';
import type { IConnectionService, ISchemaService } from '../../application/ports';
import type { MaterializedViewInfo } from '../../database/adapters/IDatabaseAdapter';
import { handleError, ErrorCategory } from '../../core/errorHandler';
import { getLanguage } from '../../i18n';
import { getTokenColors } from '../../utils/themeColors';

function formatColumnDefs(ddl: string): string {
    const viewMatch = ddl.match(/^CREATE\s+(?:MATERIALIZED\s+)?VIEW\s+`[^`]+`\s*\(/i);
    if (!viewMatch) return ddl;
    const startIdx = viewMatch.index! + viewMatch[0].length - 1;
    let depth = 1;
    let i = startIdx + 1;
    let inQuote = false;
    let quoteChar = '';
    while (i < ddl.length && depth > 0) {
        const ch = ddl[i];
        if (inQuote) {
            if (ch === quoteChar && ddl[i - 1] !== '\\') { inQuote = false; }
            i++;
            continue;
        }
        if (ch === '"' || ch === "'") { inQuote = true; quoteChar = ch; i++; continue; }
        if (ch === '(') { depth++; i++; continue; }
        if (ch === ')') { depth--; if (depth === 0) break; i++; continue; }
        i++;
    }
    if (depth !== 0) return ddl;
    const endIdx = i;
    const inner = ddl.substring(startIdx + 1, endIdx);
    const cols = splitColumnDefs(inner);
    if (cols.length <= 1) return ddl;
    return ddl.substring(0, startIdx + 1) + '\n  ' + cols.join(',\n  ') + '\n' + ddl.substring(endIdx);
}

function splitColumnDefs(content: string): string[] {
    const items: string[] = [];
    let current = '';
    let depth = 0;
    let inQuote = false;
    let quoteChar = '';
    for (let i = 0; i < content.length; i++) {
        const ch = content[i];
        if (inQuote) {
            current += ch;
            if (ch === quoteChar && content[i - 1] !== '\\') { inQuote = false; }
            continue;
        }
        if (ch === '"' || ch === "'") { inQuote = true; quoteChar = ch; current += ch; continue; }
        if (ch === '(') { depth++; current += ch; continue; }
        if (ch === ')') { depth--; current += ch; continue; }
        if (ch === ',' && depth === 0) {
            const trimmed = current.trim();
            if (trimmed) items.push(trimmed);
            current = '';
            continue;
        }
        current += ch;
    }
    const trimmed = current.trim();
    if (trimmed) items.push(trimmed);
    return items;
}

function splitSelectColumns(rest: string): string {
    const fromMatch = rest.search(/\s+FROM\b/i);
    if (fromMatch === -1) return rest;
    const before = rest.substring(0, fromMatch);
    const after = rest.substring(fromMatch);
    const cols = splitColumnDefs(before.trim());
    if (cols.length <= 1) return rest;
    return '\n  ' + cols.join(',\n  ') + after;
}

function splitProperties(content: string): string[] {
    const items: string[] = [];
    let current = '';
    let inQuote = false;
    let quoteChar = '';
    for (let i = 0; i < content.length; i++) {
        const ch = content[i];
        if (inQuote) {
            current += ch;
            if (ch === quoteChar && content[i - 1] !== '\\') { inQuote = false; }
            continue;
        }
        if (ch === '"' || ch === "'") { inQuote = true; quoteChar = ch; current += ch; continue; }
        if (ch === ',' && !inQuote) {
            const trimmed = current.trim();
            if (trimmed) items.push(trimmed);
            current = '';
            continue;
        }
        current += ch;
    }
    const trimmed = current.trim();
    if (trimmed) items.push(trimmed);
    return items;
}

function hasTopLevelUnionAll(sql: string): boolean {
    let depth = 0;
    let inQuote = false;
    let quoteChar = '';
    const upper = sql.toUpperCase();
    for (let i = 0; i < sql.length; i++) {
        const ch = sql[i];
        if (inQuote) {
            if (ch === quoteChar && sql[i - 1] !== '\\') { inQuote = false; }
            continue;
        }
        if (ch === '"' || ch === "'") { inQuote = true; quoteChar = ch; continue; }
        if (ch === '(') { depth++; continue; }
        if (ch === ')') { depth--; continue; }
        if (depth === 0 && upper.substring(i).startsWith('UNION ALL')) { return true; }
    }
    return false;
}

function formatUnionSelect(sql: string): string {
    const parts: string[] = [];
    let current = '';
    let depth = 0;
    let inQuote = false;
    let quoteChar = '';
    const upper = sql.toUpperCase();
    let i = 0;
    while (i < sql.length) {
        const ch = sql[i];
        if (inQuote) {
            current += ch;
            if (ch === quoteChar && sql[i - 1] !== '\\') { inQuote = false; }
            i++;
            continue;
        }
        if (ch === '"' || ch === "'") { inQuote = true; quoteChar = ch; current += ch; i++; continue; }
        if (ch === '(') { depth++; current += ch; i++; continue; }
        if (ch === ')') { depth--; current += ch; i++; continue; }
        if (depth === 0 && upper.substring(i).startsWith('UNION ALL')) {
            parts.push(current.trim());
            current = '';
            i += 'UNION ALL'.length;
            continue;
        }
        current += ch;
        i++;
    }
    if (current.trim()) parts.push(current.trim());
    return parts.join('\nUNION ALL\n');
}

function formatSubquery(sql: string): string {
    return sql.replace(/\(\s*(SELECT\b)/gi, '(\n  $1');
}

function formatDdlOutput(ddl: string): string {
    let s = ddl.replace(/\s+/g, ' ').trim();
    s = formatColumnDefs(s);
    s = s.replace(/\)\s+(COMMENT\s)/i, ')\n$1');
    s = s.replace(/\)\s+(DISTRIBUTED\b)/i, ')\n$1');
    s = s.replace(/\)\s+(REFRESH\b)/i, ')\n$1');
    s = s.replace(/\)\s+(PROPERTIES\s*\()/i, ')\n$1');
    s = s.replace(/\)\s+(AS\s+SELECT\b)/i, ')\n$1');
    s = s.replace(/"\s+(DISTRIBUTED\b)/g, '"\n$1');
    s = s.replace(/"\s+(REFRESH\b)/g, '"\n$1');
    s = s.replace(/"\s+(PROPERTIES\s*\()/g, '"\n$1');
    s = s.replace(/"\s+(AS\s+SELECT\b)/g, '"\n$1');
    s = s.replace(
        /PROPERTIES\s*\(([^)]+)\)/i,
        (_m: string, inner: string) => {
            const items = splitProperties(inner);
            return 'PROPERTIES (\n  ' + items.join(',\n  ') + '\n)';
        }
    );
    s = s.replace(
        /\bAS\s+SELECT\b(.+)/is,
        (_m: string, rest: string) => {
            if (hasTopLevelUnionAll(rest)) {
                return 'AS\n' + formatUnionSelect(rest);
            }
            let formatted = rest
                .replace(/\s+FROM\b/gi, '\nFROM')
                .replace(/\s+WHERE\b/gi, '\nWHERE')
                .replace(/\s+GROUP\s+BY\b/gi, '\nGROUP BY')
                .replace(/\s+HAVING\b/gi, '\nHAVING')
                .replace(/\s+ORDER\s+BY\b/gi, '\nORDER BY')
                .replace(/\s+LIMIT\b/gi, '\nLIMIT');
            formatted = 'AS\nSELECT' + splitSelectColumns(formatted);
            return formatSubquery(formatted);
        }
    );
    return s;
}

export interface MaterializedViewDesign {
    viewName: string;
    database: string;
    mode: 'create' | 'alter';
    ddl: string;
    originalDDL: string;
    refreshType: string;
    activeStatus?: string;
    originalActiveStatus?: string;
    originalView?: MaterializedViewInfo;
}

interface DesignerMessage {
    command: string;
    data?: MaterializedViewDesign;
    viewName?: string;
    sql?: string;
}

export class MaterializedViewDesignerPanel extends BaseWebviewPanel {
    public static readonly viewType = 'sqlAllInOneMaterializedViewDesigner';

    protected readonly panelConfig: WebviewPanelConfig = {
        viewType: MaterializedViewDesignerPanel.viewType,
        htmlFileName: 'materialized-view-designer.html',
        cssFileName: 'materialized-view-designer.css',
        jsFileName: 'materialized-view-designer.js',
    };

    private _mode: 'create' | 'alter' = 'create';
    private _database = '';
    private _viewName = '';
    private _refreshType = 'ASYNC';
    private readonly _connectionService: IConnectionService;
    private readonly _schemaService: ISchemaService;

    public static createOrShow(
        extensionUri: vscode.Uri,
        _context: vscode.ExtensionContext,
        connectionService: IConnectionService,
        schemaService: ISchemaService,
    ): MaterializedViewDesignerPanel {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (MaterializedViewDesignerPanel.revealExisting(MaterializedViewDesignerPanel.viewType, column)) {
            return MaterializedViewDesignerPanel.getExistingInstance<MaterializedViewDesignerPanel>(
                MaterializedViewDesignerPanel.viewType,
            )!;
        }

        const panel = MaterializedViewDesignerPanel.createWebviewPanel(
            MaterializedViewDesignerPanel.viewType,
            'Materialized View Designer',
            extensionUri,
        );

        const instance = new MaterializedViewDesignerPanel(panel, extensionUri, connectionService, schemaService);
        MaterializedViewDesignerPanel.registerInstance(instance);
        return instance;
    }

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        connectionService: IConnectionService,
        schemaService: ISchemaService,
    ) {
        super(panel, extensionUri);
        this._connectionService = connectionService;
        this._schemaService = schemaService;
        this._initialize();
    }

    private async _initialize(): Promise<void> {
        this._disposables.push(
            vscode.window.onDidChangeActiveColorTheme(async (theme) => {
                this._panel.webview.postMessage({
                    type: 'themeChange',
                    data: { kind: theme.kind, tokenColors: await getTokenColors() },
                });
            })
        );

        const monacoLoaderUri = this._panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'monaco', 'vs', 'loader.js')
        );
        const monacoBaseUri = this._panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'monaco', 'vs')
        );

        const configData = {
            mode: this._mode,
            database: this._database,
            viewName: this._viewName,
            monacoBasePath: monacoBaseUri.toString(),
            themeKind: vscode.window.activeColorTheme.kind,
            tokenColors: await getTokenColors(),
            lang: getLanguage(),
        };
        const configJson = JSON.stringify(configData).replace(/<\/script>/gi, '<\\/script>');
        const configScript = '<script>window.__MATERIALIZED_VIEW_DESIGNER_CONFIG__ = ' + configJson + ';</script>';

        await this.initializeHtml([
            { placeholder: '{{MONACO_LOADER_URI}}', value: monacoLoaderUri.toString() },
            { placeholder: '{{CONFIG_INJECT}}', value: configScript },
        ]);

        this._setupMessageHandling();
    }

    public async openForCreate(database: string): Promise<void> {
        this._mode = 'create';
        this._database = database;
        this._viewName = '';
        this._refreshType = 'ASYNC';

        const activeConn = this._connectionService.getActiveConnection();
        if (!activeConn) {
            vscode.window.showErrorMessage('No active connection');
            return;
        }

        const adapter = this._connectionService.getAdapter(activeConn.id);
        if (!adapter) {
            vscode.window.showErrorMessage('No adapter found for connection');
            return;
        }

        const defaultDDL = `CREATE MATERIALIZED VIEW \`\`\nAS\nSELECT *\nFROM ;`;

        this._panel.title = `New Materialized View - ${database}`;
        this._panel.webview.postMessage({
            type: 'materializedViewStructure',
            data: {
                viewName: '',
                database,
                mode: 'create',
                ddl: defaultDDL,
                originalDDL: '',
                refreshType: 'ASYNC',
                activeStatus: 'ACTIVE',
            },
        });
    }

    public async openForEdit(database: string, viewName: string): Promise<void> {
        this._mode = 'alter';
        this._database = database;
        this._viewName = viewName;

        const activeConn = this._connectionService.getActiveConnection();
        if (!activeConn) {
            vscode.window.showErrorMessage('No active connection');
            return;
        }

        const adapter = this._connectionService.getAdapter(activeConn.id);
        if (!adapter) {
            vscode.window.showErrorMessage('No adapter found for connection');
            return;
        }

        try {
            const rawDdl = await adapter.schemaAdapter.getMaterializedViewDDL(database, viewName);
            const ddl = formatDdlOutput(rawDdl);

            const refreshMatch = ddl.match(/REFRESH\s+(ASYNC|SYNC|MANUAL)/i);
            this._refreshType = refreshMatch ? refreshMatch[1].toUpperCase() : 'ASYNC';

            let activeStatus = 'ACTIVE';
            try {
                const mvResult = await adapter.queryAdapter.execute(
                    `SHOW MATERIALIZED VIEWS FROM \`${database}\``
                );
                if (mvResult.status === 'success' && mvResult.rows.length > 0) {
                    const row = mvResult.rows.find((r: Record<string, unknown>) => {
                        return String(r.name || r.Name || r.TABLE_NAME || '').toLowerCase() === viewName.toLowerCase();
                    });
                    if (row) {
                        const isActive = row.is_active ?? row.active ?? row.IS_ACTIVE;
                        if (isActive !== undefined && isActive !== null) {
                            const activeBool = isActive === true || isActive === 'true' || isActive === 'TRUE' || isActive === 1 || isActive === '1';
                            if (!activeBool) {
                                activeStatus = 'INACTIVE';
                            }
                        }
                    }
                }
            } catch {
                // ignore query failures; default to ACTIVE
            }

            this._panel.title = `Edit Materialized View - ${viewName}`;
            this._panel.webview.postMessage({
                type: 'materializedViewStructure',
                data: {
                    viewName,
                    database,
                    mode: 'alter',
                    ddl,
                    originalDDL: ddl,
                    refreshType: this._refreshType,
                    activeStatus,
                },
            });
        } catch (error) {
            handleError(error, 'openForEdit', ErrorCategory.SUB_ITEM);
            vscode.window.showErrorMessage(`Failed to load materialized view: ${error}`);
        }
    }

    private _setupMessageHandling(): void {
        this._panel.webview.onDidReceiveMessage(
            async (message: DesignerMessage) => {
                try {
                    switch (message.command) {
                        case 'save':
                            if (message.data) {
                                await this._handleSave(message.data);
                            }
                            break;
                        case 'refresh':
                            if (message.viewName) {
                                await this._handleRefresh(message.viewName);
                            }
                            break;
                        case 'exportSql':
                            if (message.sql) {
                                await this._handleExportSql(message.sql);
                            }
                            break;
                        case 'close':
                            this.dispose();
                            break;
                        case 'ready':
                            if (this._mode === 'create') {
                                await this.openForCreate(this._database);
                            } else {
                                await this.openForEdit(this._database, this._viewName);
                            }
                            break;
                    }
                } catch (error) {
                    handleError(error, 'setupMessageHandling', ErrorCategory.FEATURE);
                    this._panel.webview.postMessage({
                        type: 'error',
                        message: `Operation failed: ${error}`,
                    });
                }
            },
            null,
            this._disposables,
        );
    }

    private async _handleSave(data: MaterializedViewDesign): Promise<void> {
        const validationError = this._validateDesign(data);
        if (validationError) {
            this._panel.webview.postMessage({
                type: 'queryError',
                data: { message: validationError },
            });
            return;
        }

        try {
            const activeConn = this._connectionService.getActiveConnection();
            if (!activeConn) {
                throw new Error('No active connection');
            }

            const adapter = this._connectionService.getAdapter(activeConn.id);
            if (!adapter) {
                throw new Error('No adapter found for connection');
            }

            const hasDdlChanges = data.mode === 'create' || data.ddl !== data.originalDDL;
            const hasStatusChanges = data.mode === 'alter' && data.activeStatus !== data.originalActiveStatus;

            if (!hasDdlChanges && !hasStatusChanges) {
                this._panel.webview.postMessage({
                    type: 'querySuccess',
                    data: { message: 'No changes to save' },
                });
                return;
            }

            const statements: string[] = [];

            if (hasDdlChanges) {
                if (data.mode === 'create') {
                    statements.push(data.ddl);
                } else {
                    const tempViewName = `${data.viewName}_tmp_${Date.now()}`;
                    const tempDDL = data.ddl.replace(
                        new RegExp(`CREATE\\s+MATERIALIZED\\s+VIEW\\s+\`?${data.viewName}\`?`, 'i'),
                        `CREATE MATERIALIZED VIEW \`${tempViewName}\``
                    );
                    statements.push(tempDDL);
                    statements.push(`ALTER MATERIALIZED VIEW \`${data.viewName}\` SWAP WITH \`${tempViewName}\``);
                    statements.push(`DROP MATERIALIZED VIEW IF EXISTS \`${tempViewName}\``);
                }
            }

            if (hasStatusChanges) {
                const statusCmd = data.activeStatus === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE';
                statements.push(`ALTER MATERIALIZED VIEW \`${data.viewName}\` ${statusCmd}`);
            }

            const sqlToExecute = statements.join(';\n');

            const confirmed = await vscode.window.showWarningMessage(
                `Confirm execution of the following SQL?\n\n${sqlToExecute}`,
                { modal: true },
                'Execute',
                'Cancel',
            );

            if (confirmed !== 'Execute') {
                return;
            }

            const execStatements = sqlToExecute.split(';').map(s => s.trim()).filter(s => s);

            this._panel.webview.postMessage({
                type: 'queryStart',
                data: { sql: execStatements[0] || '' }
            });

            let allSuccess = true;
            let lastError = '';
            for (let i = 0; i < execStatements.length; i++) {
                const stmt = execStatements[i];
                const result = await adapter.queryAdapter.execute(stmt);
                if (result.status === 'error' && result.error) {
                    allSuccess = false;
                    lastError = result.error.message || 'Unknown error';
                    break;
                }
            }

            if (allSuccess) {
                this._panel.webview.postMessage({
                    type: 'querySuccess',
                    data: { message: 'Query executed successfully' }
                });
            } else {
                this._panel.webview.postMessage({
                    type: 'queryError',
                    data: { message: lastError }
                });
            }

            if (allSuccess) {
                this._schemaService.invalidate(activeConn.id, 'materializedView', this._database);
            }

            if (data.mode === 'alter' && allSuccess) {
                const newDDL = await adapter.schemaAdapter.getMaterializedViewDDL(data.database, data.viewName);
                const formattedDDL = formatDdlOutput(newDDL);
                this._panel.webview.postMessage({
                    type: 'updateOriginalDDL',
                    data: { originalDDL: formattedDDL, originalActiveStatus: data.activeStatus },
                });
            }
        } catch (error: any) {
            handleError(error, 'handleSave', ErrorCategory.SUB_ITEM);
            const errorMsg = error?.message || String(error);
            this._panel.webview.postMessage({
                type: 'queryError',
                data: { message: errorMsg },
            });
        }
    }

    private async _handleRefresh(viewName: string): Promise<void> {
        try {
            const activeConn = this._connectionService.getActiveConnection();
            if (!activeConn) {
                throw new Error('No active connection');
            }

            const adapter = this._connectionService.getAdapter(activeConn.id);
            if (!adapter) {
                throw new Error('No adapter found for connection');
            }

            const sql = `REFRESH MATERIALIZED VIEW \`${this._database}\`.\`${viewName}\``;
            await adapter.queryAdapter.execute(sql);

            vscode.window.showInformationMessage(`Materialized view ${viewName} refresh initiated`);
        } catch (error) {
            handleError(error, 'handleRefresh', ErrorCategory.SUB_ITEM);
            vscode.window.showErrorMessage(`Failed to refresh materialized view: ${error}`);
        }
    }

    private async _handleExportSql(sql: string): Promise<void> {
        const document = await vscode.workspace.openTextDocument({
            content: sql,
            language: 'sql',
        });
        await vscode.window.showTextDocument(document);
    }

    private _validateDesign(data: MaterializedViewDesign): string | null {
        if (!data.viewName || data.viewName.trim() === '') {
            return 'View name is required';
        }

        if (!data.ddl || data.ddl.trim() === '') {
            return 'DDL is required';
        }

        return null;
    }

    public override dispose(): void {
        MaterializedViewDesignerPanel.unregisterInstance(MaterializedViewDesignerPanel.viewType);
        super.dispose();
    }
}