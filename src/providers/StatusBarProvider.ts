import * as vscode from 'vscode'
import { t } from '../i18n'
import { isSqlDocument } from '../core/sqlDialects'

export class StatusBarProvider {
    private statusBarItem: vscode.StatusBarItem
    private disposables: vscode.Disposable[] = []
    private static tempItem: vscode.StatusBarItem | undefined
    private static tempTimeout: ReturnType<typeof setTimeout> | undefined

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)
        this.statusBarItem.text = '$(sql)'
        this.statusBarItem.tooltip = t('statusBar.tooltip')
        this.statusBarItem.command = 'hive-formatter.open-config-editor'
        
        this.updateStatusBar()
        this.statusBarItem.show()

        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration((e) => {
                if (e.affectsConfiguration('Hive-Formatter')) {
                    this.updateStatusBar()
                }
            }),
            vscode.window.onDidChangeActiveTextEditor(() => {
                this.updateStatusBar()
            })
        )
    }

    private updateStatusBar() {
        const config = vscode.workspace.getConfiguration('Hive-Formatter')
        const dialect = config.get('dialect', 'hive')
        const activeEditor = vscode.window.activeTextEditor

        if (!activeEditor) {
            this.statusBarItem.text = `$(sql) ${dialect.toUpperCase()}`
            return
        }

        const langId = activeEditor.document.languageId
        const isSql = isSqlDocument({ languageId: langId })

        if (isSql) {
            this.statusBarItem.text = `$(sql) ${dialect.toUpperCase()}`
            this.statusBarItem.show()
        } else {
            this.statusBarItem.hide()
        }
    }

    public static showTemporaryMessage(message: string): void {
        if (StatusBarProvider.tempItem) {
            StatusBarProvider.tempItem.dispose()
        }
        if (StatusBarProvider.tempTimeout) {
            clearTimeout(StatusBarProvider.tempTimeout)
        }
        StatusBarProvider.tempItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99)
        StatusBarProvider.tempItem.text = `$(check) ${message}`
        StatusBarProvider.tempItem.show()
        StatusBarProvider.tempTimeout = setTimeout(() => {
            if (StatusBarProvider.tempItem) {
                StatusBarProvider.tempItem.dispose()
                StatusBarProvider.tempItem = undefined
            }
        }, 2000)
    }

    public dispose() {
        if (StatusBarProvider.tempTimeout) clearTimeout(StatusBarProvider.tempTimeout)
        if (StatusBarProvider.tempItem) StatusBarProvider.tempItem.dispose()
        this.statusBarItem.dispose()
        this.disposables.forEach(d => d.dispose())
    }
}
