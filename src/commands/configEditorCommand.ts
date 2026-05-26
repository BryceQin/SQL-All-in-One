import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { format, type SqlLanguage } from '../formatter/sqlFormatter'
import type { KeywordCase, DataTypeCase, FunctionCase, IndentStyle, LogicalOperatorNewline } from '../formatter/FormatOptions'
import { t, getLanguage } from '../i18n'
import type { MessageKey } from '../i18n'
import { ALL_CONFIG_ITEMS, LINT_RULES, getDefaultConfig, getConfigKey } from '../config/configDefinitions'

export class ConfigEditorPanel {
    public static currentPanel: ConfigEditorPanel | undefined
    public static readonly viewType = 'SQLAllInOneConfig'

    private readonly _panel: vscode.WebviewPanel
    private readonly _extensionUri: vscode.Uri
    private _disposables: vscode.Disposable[] = []

    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined

        if (ConfigEditorPanel.currentPanel) {
            ConfigEditorPanel.currentPanel._panel.reveal(column)
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

        ConfigEditorPanel.currentPanel = new ConfigEditorPanel(panel, extensionUri)
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel
        this._extensionUri = extensionUri

        this._update()

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables)

        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'updateConfig':
                        try {
                            await this._updateConfig(message.data)
                            this._panel.webview.postMessage({ command: 'saveResult', success: true })
                        } catch {
                            this._panel.webview.postMessage({ command: 'saveResult', success: false })
                        }
                        break
                    case 'resetConfig':
                        await this._resetConfig()
                        break
                    case 'previewFormat':
                        await this._previewFormat(message.sql, message.config)
                        break
                    case 'getCurrentConfig':
                        await this._sendCurrentConfig()
                        break
                }
            },
            null,
            this._disposables
        )
    }

    public dispose() {
        ConfigEditorPanel.currentPanel = undefined
        this._panel.dispose()

        while (this._disposables.length) {
            const x = this._disposables.pop()
            if (x) {
                x.dispose()
            }
        }
    }

    private async _update() {
        this._panel.webview.html = this._getHtmlForWebview()
        await this._sendCurrentConfig()
    }

    private _getHtmlForWebview(): string {
        try {
            const htmlPath = path.join(this._extensionUri.fsPath, 'media', 'config-editor.html')
            let html = fs.readFileSync(htmlPath, 'utf-8')

            const cssUri = this._panel.webview.asWebviewUri(
                vscode.Uri.joinPath(this._extensionUri, 'media', 'config-editor.css')
            )
            const jsUri = this._panel.webview.asWebviewUri(
                vscode.Uri.joinPath(this._extensionUri, 'media', 'config-editor.js')
            )

            html = html.replace('{{CSS_URI}}', cssUri.toString())
            html = html.replace('{{JS_URI}}', jsUri.toString())

            const i18nDict = this._getConfigEditorI18n()
            const i18nScript = '<script>window.__I18N__ = ' + JSON.stringify(i18nDict) + '; window.__LANG__ = "' + getLanguage() + '";</script>'
            html = html.replace('{{I18N_INJECT}}', i18nScript)

            return html
        } catch {
            return '<html><body><h2>' + t('configEditor.loadFailed') + '</h2><p>' + t('configEditor.reinstall') + '</p></body></html>'
        }
    }

    private _getConfigEditorI18n(): Record<string, string> {
        const keys: MessageKey[] = [
            'configEditor.title', 'configEditor.subtitle',
            'configEditor.presets', 'configEditor.presetDefault',
            'configEditor.presetHive', 'configEditor.presetMySQL',
            'configEditor.presetCompact', 'configEditor.resetDefault',
            'configEditor.save', 'configEditor.previewTitle',
            'configEditor.previewPlaceholder', 'configEditor.formatPreviewBtn',
            'configEditor.formattingOptions', 'configEditor.loadFailed',
            'configEditor.reinstall',
        ]
        const dict: Record<string, string> = {}
        for (const key of keys) {
            dict[key] = t(key)
        }
        return dict
    }

    private async _sendCurrentConfig() {
        const config = vscode.workspace.getConfiguration('SQL-All-in-One')
        const data: Record<string, unknown> = {}

        for (const item of ALL_CONFIG_ITEMS) {
            const configKey = getConfigKey(item)
            data[item.key] = config.get(configKey, item.defaultValue as any)
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

    private async _updateConfig(data: Record<string, unknown>) {
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

    private async _resetConfig() {
        const defaults = getDefaultConfig()
        await this._updateConfig(defaults)
        await this._sendCurrentConfig()
    }

    private async _previewFormat(sql: string, webviewConfig?: Record<string, unknown>) {
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
}

export function openConfigEditorCommand(extensionUri: vscode.Uri) {
    ConfigEditorPanel.createOrShow(extensionUri)
}
