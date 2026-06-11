import * as vscode from 'vscode'
import { t } from '../i18n'
import { isSqlDocument } from '../core/sqlDialects'
import { getConfigManager } from '../core/configManager'

export class StatusBarProvider {
    private statusBarItem: vscode.StatusBarItem
    private disposables: vscode.Disposable[] = []
    private tempItem: vscode.StatusBarItem | undefined
    private tempTimeout: ReturnType<typeof setTimeout> | undefined

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)
        this.statusBarItem.text = '$(sql)'
        this.statusBarItem.tooltip = t('statusBar.tooltip')
        this.statusBarItem.command = 'hive-formatter.open-config-editor'
        
        this.updateStatusBar()
        this.statusBarItem.show()

        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration((e) => {
                if (e.affectsConfiguration('SQL-All-in-One')) {
                    this.updateStatusBar()
                }
            }),
            vscode.window.onDidChangeActiveTextEditor(() => {
                this.updateStatusBar()
            })
        )
    }

    private updateStatusBar(): void {
        const dialect = getConfigManager().get<string>('dialect', 'hive')
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

    public showTemporaryMessage(message: string): void {
        if (this.tempItem) {
            this.tempItem.dispose()
        }
        if (this.tempTimeout) {
            clearTimeout(this.tempTimeout)
        }
        this.tempItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99)
        this.tempItem.text = `$(check) ${message}`
        this.tempItem.show()
        this.tempTimeout = setTimeout(() => {
            if (this.tempItem) {
                this.tempItem.dispose()
                this.tempItem = undefined
            }
        }, 2000)
    }

    public dispose(): void {
        if (this.tempTimeout) clearTimeout(this.tempTimeout)
        if (this.tempItem) this.tempItem.dispose()
        this.statusBarItem.dispose()
        this.disposables.forEach(d => { d.dispose(); })
    }
}
