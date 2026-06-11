import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { getConnectionManager } from '../../database/connection/ConnectionManager';
import { getConnectionStore } from '../../database/connection/ConnectionStore';
import { ConnectionConfig, ConnectionGroup } from '../../database/connection/ConnectionConfig';
import { DatabaseTreeProvider } from '../databaseExplorer/DatabaseTreeProvider';

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

export class ConnectionDialog {
    public static currentPanel: ConnectionDialog | undefined;
    public static readonly viewType = 'sqlAllInOneConnectionDialog';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
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
        if (ConnectionDialog.currentPanel) {
            ConnectionDialog.currentPanel._panel.reveal();
            return undefined;
        }

        const panel = vscode.window.createWebviewPanel(
            ConnectionDialog.viewType,
            options.mode === 'create' ? 'New Connection' : 'Edit Connection',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'media'),
                ],
                retainContextWhenHidden: true,
            }
        );

        const dialog = new ConnectionDialog(panel, extensionUri, options.treeProvider);
        ConnectionDialog.currentPanel = dialog;

        dialog._mode = options.mode;
        dialog._connectionId = options.connectionId;

        const config = await dialog._buildConfig(options);
        await dialog._update(config);

        return new Promise<{ saved: boolean; connectionId?: string } | undefined>((resolve) => {
            dialog._resolveDialog = resolve;
        });
    }

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        treeProvider?: DatabaseTreeProvider
    ) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._treeProvider = treeProvider;

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async (message: DialogMessage) => {
                switch (message.command) {
                    case 'save':
                        await this._handleSave(message.data as ConnectionConfig);
                        break;
                    case 'testConnection':
                        await this._handleTestConnection(message.data as ConnectionConfig);
                        break;
                    case 'close':
                        this._closeDialog({ saved: false });
                        break;
                    case 'browseFile':
                        await this._handleBrowseFile(message.data as { field: string });
                        break;
                }
            },
            null,
            this._disposables
        );
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

    private async _update(config: ConnectionDialogConfig): Promise<void> {
        const html = await this._getHtmlForWebview(config);
        this._panel.webview.html = html;
    }

    private async _getHtmlForWebview(config: ConnectionDialogConfig): Promise<string> {
        try {
            const htmlPath = path.join(
                this._extensionUri.fsPath,
                'media',
                'connection-dialog.html'
            );
            let html = await fs.promises.readFile(htmlPath, 'utf-8');

            const cssUri = this._panel.webview.asWebviewUri(
                vscode.Uri.joinPath(this._extensionUri, 'media', 'connection-dialog.css')
            );
            const jsUri = this._panel.webview.asWebviewUri(
                vscode.Uri.joinPath(this._extensionUri, 'media', 'connection-dialog.js')
            );

            html = html.replace('{{CSS_URI}}', cssUri.toString());
            html = html.replace('{{JS_URI}}', jsUri.toString());
            html = html.replace(/\{\{CSP_SOURCE\}\}/g, this._panel.webview.cspSource);

            const configScript = '<script>window.__CONNECTION_DIALOG_CONFIG__ = ' + JSON.stringify(config) + ';</script>';
            html = html.replace('{{CONFIG_INJECT}}', configScript);

            return html;
        } catch (error) {
            console.error('Failed to load Connection Dialog HTML:', error);
            return '<html><body><h2>Failed to load Connection Dialog</h2><p>Please reinstall the extension.</p></body></html>';
        }
    }

    private async _handleSave(formData: ConnectionConfig): Promise<void> {
        const validationError = this._validateForm(formData);
        if (validationError) {
            this._panel.webview.postMessage({
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
            this._panel.webview.postMessage({
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
            this._panel.webview.postMessage({ command: 'testStart' });

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

            this._panel.webview.postMessage({
                command: 'testResult',
                success: result.success,
                serverVersion: result.serverVersion,
                latency: result.latency,
                error: result.error,
            });
        } catch (error) {
            this._panel.webview.postMessage({
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
            title: 'Select File',
        });

        if (uris && uris.length > 0) {
            this._panel.webview.postMessage({
                command: 'fileSelected',
                field: data.field,
                path: uris[0].fsPath,
            });
        }
    }

    private _validateForm(data: ConnectionConfig): string | null {
        if (!data.name || !data.name.trim()) {
            return 'Connection name is required';
        }

        const store = getConnectionStore();
        const existing = store.getConnections()
            .filter(c => c.id !== this._connectionId)
            .map(c => c.name);
        if (existing.includes(data.name.trim())) {
            return 'Connection name already exists';
        }

        if (data.dialect !== 'sqlite') {
            if (!data.host || !data.host.trim()) {
                return 'Host is required';
            }
            if (!data.port || data.port < 1 || data.port > 65535) {
                return 'Port must be between 1 and 65535';
            }
            if (!data.username || !data.username.trim()) {
                return 'Username is required';
            }
        }

        if (data.ssh?.enabled) {
            if (!data.ssh.host) return 'SSH host is required';
            if (!data.ssh.port || data.ssh.port < 1 || data.ssh.port > 65535) return 'SSH port must be between 1 and 65535';
            if (!data.ssh.username) return 'SSH username is required';
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
        ConnectionDialog.currentPanel = undefined;
        if (this._resolveDialog) {
            this._resolveDialog(undefined);
            this._resolveDialog = undefined;
        }
        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
}
