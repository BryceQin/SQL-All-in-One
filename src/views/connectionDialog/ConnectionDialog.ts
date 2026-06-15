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

    private async _initializeWithConfig(config: ConnectionDialogConfig): Promise<void> {
        const configScript = '<script>window.__CONNECTION_DIALOG_CONFIG__ = ' + JSON.stringify(config) + ';</script>';

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
        const i18nScript = '<script>window.__CONNECTION_DIALOG_I18N__ = ' + JSON.stringify(i18nData) + ';</script>';

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

    public override dispose(): void {
        if (this._resolveDialog) {
            this._resolveDialog(undefined);
            this._resolveDialog = undefined;
        }
        super.dispose();
    }
}
