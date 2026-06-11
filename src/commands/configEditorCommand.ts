import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { format, type SqlLanguage } from '../formatter/sqlFormatter'
import type { KeywordCase, DataTypeCase, FunctionCase, IndentStyle, LogicalOperatorNewline } from '../formatter/FormatOptions'
import { t, getLanguage } from '../i18n'
import messagesEn from '../i18n/messages.en.json'
import messagesZh from '../i18n/messages.zh.json'
import { ALL_CONFIG_ITEMS, LINT_RULES, getDefaultConfig, getConfigKey } from '../config/configDefinitions'
import { ConnectionConfig } from '../database/connection/ConnectionConfig'

interface ConfigEditorMessage {
    command: string;
    data?: Record<string, unknown>;
    sql?: string;
    config?: Record<string, unknown>;
    lang?: string;
    id?: string;
}

export interface ConfigEditorOptions {
    initialTab?: string;
    autoAddConnection?: boolean;
    connectionId?: string;
}

export class ConfigEditorPanel {
    public static currentPanel: ConfigEditorPanel | undefined
    public static readonly viewType = 'SQLAllInOneConfig'

    private readonly _panel: vscode.WebviewPanel
    private readonly _extensionUri: vscode.Uri
    private _disposables: vscode.Disposable[] = []
    private _pendingNavigation: ConfigEditorOptions | undefined

    public static createOrShow(extensionUri: vscode.Uri, options?: ConfigEditorOptions): void {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined

        if (ConfigEditorPanel.currentPanel) {
            ConfigEditorPanel.currentPanel._panel.reveal(column)
            if (options) {
                ConfigEditorPanel.currentPanel._navigateTo(options)
            }
            return
        }

        const panel = vscode.window.createWebviewPanel(
            ConfigEditorPanel.viewType,
            t('configEditor.panelTitle'),
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'media'),
                ],
            }
        )

        ConfigEditorPanel.currentPanel = new ConfigEditorPanel(panel, extensionUri, options)
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, options?: ConfigEditorOptions) {
        this._panel = panel
        this._extensionUri = extensionUri
        this._pendingNavigation = options

        this._update()

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables)

        this._panel.webview.onDidReceiveMessage(
            async (message: ConfigEditorMessage) => {
                switch (message.command) {
                    case 'updateConfig':
                        try {
                            if (message.data) {
                                await this._updateConfig(message.data)
                            }
                            this._panel.webview.postMessage({ command: 'saveResult', success: true })
                        } catch {
                            this._panel.webview.postMessage({ command: 'saveResult', success: false })
                        }
                        break
                    case 'resetConfig':
                        await this._resetConfig()
                        break
                    case 'previewFormat':
                        await this._previewFormat(message.sql ?? '', message.config)
                        break
                    case 'getCurrentConfig':
                        await this._sendCurrentConfig()
                        break
                    case 'changeLanguage':
                        if (message.lang) {
                            const config = vscode.workspace.getConfiguration('SQL-All-in-One')
                            await config.update('displayLanguage', message.lang, vscode.ConfigurationTarget.Global)
                        }
                        this._sendI18nData()
                        break
                    case 'requestI18n':
                        this._sendI18nData()
                        break
                    case 'getConnections':
                        await this._sendConnectionsList()
                        break
                    case 'getConnectionDetail':
                        if (message.id) {
                            await this._sendConnectionDetail(message.id)
                        }
                        break
                    case 'addConnection':
                        if (message.data) {
                            await this._handleAddConnection(message.data)
                        }
                        break
                    case 'updateConnection':
                        if (message.data) {
                            await this._handleUpdateConnection(message.data)
                        }
                        break
                    case 'deleteConnection':
                        if (message.id) {
                            await this._handleDeleteConnection(message.id)
                        }
                        break
                    case 'testConnection':
                        if (message.data) {
                            await this._handleTestConnection(message.data)
                        }
                        break
                    case 'testExistingConnection':
                        if (message.id) {
                            await this._handleTestExistingConnection(message.id)
                        }
                        break
                }
            },
            null,
            this._disposables
        )
    }

    public dispose(): void {
        ConfigEditorPanel.currentPanel = undefined
        this._panel.dispose()

        while (this._disposables.length) {
            const x = this._disposables.pop()
            if (x) {
                x.dispose()
            }
        }
    }

    private async _update(): Promise<void> {
        this._panel.webview.html = await this._getHtmlForWebview()
        await this._sendCurrentConfig()
        this._sendI18nData()

        if (this._pendingNavigation) {
            const nav = this._pendingNavigation
            this._pendingNavigation = undefined
            setTimeout(() => this._navigateTo(nav), 300)
        }
    }

    private _navigateTo(options: ConfigEditorOptions): void {
        const message: Record<string, unknown> = { command: 'navigateTo' }
        if (options.initialTab) {
            message.tab = options.initialTab
        }
        if (options.autoAddConnection) {
            message.autoAddConnection = true
        }
        if (options.connectionId) {
            message.connectionId = options.connectionId
        }
        this._panel.webview.postMessage(message)
    }

    private async _getHtmlForWebview(): Promise<string> {
        try {
            const htmlPath = path.join(this._extensionUri.fsPath, 'media', 'config-editor.html')
            let html = await fs.promises.readFile(htmlPath, 'utf-8')

            const cssUri = this._panel.webview.asWebviewUri(
                vscode.Uri.joinPath(this._extensionUri, 'media', 'config-editor.css')
            )
            const jsUri = this._panel.webview.asWebviewUri(
                vscode.Uri.joinPath(this._extensionUri, 'media', 'config-editor.js')
            )

            html = html.replace('{{CSS_URI}}', cssUri.toString())
            html = html.replace('{{JS_URI}}', jsUri.toString())
            html = html.replace(/\{\{CSP_SOURCE\}\}/g, this._panel.webview.cspSource)

            return html
        } catch {
            return '<html><body><h2>' + t('configEditor.loadFailed') + '</h2><p>' + t('configEditor.reinstall') + '</p></body></html>'
        }
    }

    private _getConfigEditorI18n(): { zh: Record<string, string>; en: Record<string, string> } {
        return {
            zh: messagesZh as Record<string, string>,
            en: messagesEn as Record<string, string>,
        }
    }

    private _sendI18nData(): void {
        const i18nDicts = this._getConfigEditorI18n()
        const currentLang = getLanguage()
        this._panel.webview.postMessage({
            command: 'initI18n',
            zh: i18nDicts.zh,
            en: i18nDicts.en,
            lang: currentLang,
        })
    }

    private async _sendCurrentConfig(): Promise<void> {
        const config = vscode.workspace.getConfiguration('SQL-All-in-One')
        const data: Record<string, unknown> = {}

        for (const item of ALL_CONFIG_ITEMS) {
            const configKey = getConfigKey(item)
            data[item.key] = config.get(configKey, item.defaultValue as boolean | string | number)
        }

        for (const rule of LINT_RULES) {
            const ruleConfig = config.get(rule.configKey, { enabled: rule.defaultEnabled, severity: rule.defaultSeverity })
            data[rule.enabledKey] = ruleConfig.enabled
            data[rule.severityKey] = ruleConfig.severity
        }

        this._panel.webview.postMessage({
            command: 'loadConfig',
            data
        })
    }

    private async _updateConfig(data: Record<string, unknown>): Promise<void> {
        const config = vscode.workspace.getConfiguration('SQL-All-in-One')

        for (const item of ALL_CONFIG_ITEMS) {
            let value = data[item.key]
            const configKey = getConfigKey(item)
            if (item.type === 'string' && value === '') {
                value = undefined
            }
            try { await config.update(configKey, value, vscode.ConfigurationTarget.Global) } catch { /* skip */ }
        }

        for (const rule of LINT_RULES) {
            const enabled = data[rule.enabledKey]
            const severity = data[rule.severityKey]
            try {
                await config.update(rule.configKey, { enabled, severity }, vscode.ConfigurationTarget.Global)
            } catch { /* skip */ }
        }

        vscode.window.showInformationMessage(t('notification.configSaved'))
    }

    private async _resetConfig(): Promise<void> {
        const defaults = getDefaultConfig()
        await this._updateConfig(defaults)
        await this._sendCurrentConfig()
    }

    private async _previewFormat(sql: string, webviewConfig?: Record<string, unknown>): Promise<void> {
        try {
            const config = vscode.workspace.getConfiguration('SQL-All-in-One')
            const get = <T>(key: string, defaultValue: T): T => {
                if (webviewConfig && key in webviewConfig && webviewConfig[key] !== undefined) {
                    return webviewConfig[key] as T
                }
                return config.get<T>(key, defaultValue)
            }
            const result = format(sql, {
                language: get('dialect', 'hive') as SqlLanguage,
                keywordCase: get('keywordCase', 'preserve') as KeywordCase,
                dataTypeCase: get('dataTypeCase', 'preserve') as DataTypeCase,
                functionCase: get('functionCase', 'preserve') as FunctionCase,
                identifierCase: get('identifierCase', 'preserve') as KeywordCase,
                indentStyle: get('indentStyle', 'standard') as IndentStyle,
                logicalOperatorNewline: get('logicalOperatorNewline', 'before') as LogicalOperatorNewline,
                expressionWidth: get('expressionWidth', 50),
                linesBetweenQueries: get('linesBetweenQueries', 1),
                denseOperators: get('denseOperators', false),
                newlineBeforeSemicolon: get('newlineBeforeSemicolon', false)
            })

            this._panel.webview.postMessage({
                command: 'previewResult',
                data: result
            })
        } catch (error) {
            vscode.window.showErrorMessage(t('notification.formatPreviewError', (error as Error).message))
        }
    }

    private async _getConnectionStore(): Promise<import('../database/connection/ConnectionStore').ConnectionStore> {
        const { getConnectionStore } = await import('../database/connection/ConnectionStore.js')
        const store = getConnectionStore()
        await store.load()
        return store
    }

    private async _getConnectionManager(): Promise<import('../database/connection/ConnectionManager').ConnectionManager> {
        const { getConnectionManager } = await import('../database/connection/ConnectionManager.js')
        return getConnectionManager()
    }

    private async _sendConnectionsList(): Promise<void> {
        try {
            const store = await this._getConnectionStore()
            const connections = store.getConnections()
            const groups = store.getGroups()
            this._panel.webview.postMessage({
                command: 'connectionsList',
                connections,
                groups
            })
        } catch {
            this._panel.webview.postMessage({
                command: 'connectionsList',
                connections: [],
                groups: []
            })
        }
    }

    private async _sendConnectionDetail(id: string): Promise<void> {
        try {
            const store = await this._getConnectionStore()
            const conn = store.getConnection(id)
            if (conn) {
                const connWithPassword = { ...conn, password: await store.getPassword(id) ? '••••••••' : '' }
                if (conn.ssh?.enabled) {
                    connWithPassword.ssh = {
                        ...conn.ssh,
                        password: await store.getSshPassword(id) ? '••••••••' : '',
                        passphrase: await store.getSshPassphrase(id) ? '••••••••' : ''
                    }
                }
                this._panel.webview.postMessage({
                    command: 'editConnectionDetail',
                    connection: connWithPassword,
                    groups: store.getGroups()
                })
            }
        } catch {
            // ignore
        }
    }

    private async _handleAddConnection(data: Record<string, unknown>): Promise<void> {
        try {
            const manager = await this._getConnectionManager()
            const id = Date.now().toString(36) + Math.random().toString(36).substr(2)
            const config = { ...data, id } as unknown as ConnectionConfig
            const password = data.password as string | undefined
            await manager.addConnection(config, password)
            this._panel.webview.postMessage({ command: 'connectionSaveResult', success: true })
        } catch (error) {
            this._panel.webview.postMessage({
                command: 'connectionSaveResult',
                success: false,
                error: (error as Error).message
            })
        }
    }

    private async _handleUpdateConnection(data: Record<string, unknown>): Promise<void> {
        try {
            const manager = await this._getConnectionManager()
            const id = data.id as string
            if (!id) {
                this._panel.webview.postMessage({ command: 'connectionSaveResult', success: false, error: 'Missing connection ID' })
                return
            }
            const config = data as unknown as ConnectionConfig
            const password = data.password as string | undefined
            await manager.updateConnection(id, config, password)
            this._panel.webview.postMessage({ command: 'connectionSaveResult', success: true })
        } catch (error) {
            this._panel.webview.postMessage({
                command: 'connectionSaveResult',
                success: false,
                error: (error as Error).message
            })
        }
    }

    private async _handleDeleteConnection(id: string): Promise<void> {
        try {
            const manager = await this._getConnectionManager()
            await manager.removeConnection(id)
            this._panel.webview.postMessage({ command: 'connectionDeleteResult', success: true })
        } catch (error) {
            this._panel.webview.postMessage({
                command: 'connectionDeleteResult',
                success: false,
                error: (error as Error).message
            })
        }
    }

    private async _handleTestConnection(data: Record<string, unknown>): Promise<void> {
        try {
            const manager = await this._getConnectionManager()
            const config = data as unknown as ConnectionConfig
            const password = data.password as string | undefined
            const result = await manager.testConnection(config, password)
            this._panel.webview.postMessage({
                command: 'connectionTestResult',
                success: result.success,
                serverVersion: result.serverVersion,
                latency: result.latency,
                error: result.error
            })
        } catch (error) {
            this._panel.webview.postMessage({
                command: 'connectionTestResult',
                success: false,
                error: (error as Error).message
            })
        }
    }

    private async _handleTestExistingConnection(id: string): Promise<void> {
        try {
            const store = await this._getConnectionStore()
            const conn = store.getConnection(id)
            if (!conn) {
                this._panel.webview.postMessage({
                    command: 'connectionTestResult',
                    success: false,
                    error: 'Connection not found'
                })
                return
            }
            const manager = await this._getConnectionManager()
            const password = await store.getPassword(id)
            const testConfig = { ...conn }
            if (conn.ssh?.enabled) {
                testConfig.ssh = {
                    ...conn.ssh,
                    password: await store.getSshPassword(id),
                    passphrase: await store.getSshPassphrase(id)
                }
            }
            const result = await manager.testConnection(testConfig, password)
            this._panel.webview.postMessage({
                command: 'connectionTestResult',
                success: result.success,
                serverVersion: result.serverVersion,
                latency: result.latency,
                error: result.error
            })
        } catch (error) {
            this._panel.webview.postMessage({
                command: 'connectionTestResult',
                success: false,
                error: (error as Error).message
            })
        }
    }
}

export function openConfigEditorCommand(extensionUri: vscode.Uri, options?: ConfigEditorOptions): void {
    ConfigEditorPanel.createOrShow(extensionUri, options)
}
