import * as vscode from 'vscode'

export class StatusBarProvider {
    private statusBarItem: vscode.StatusBarItem
    private disposables: vscode.Disposable[] = []

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)
        this.statusBarItem.text = '$(sql)'
        this.statusBarItem.tooltip = 'Hive Formatter'
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
        const isSqlDocument = ['sql', 'hive'].includes(langId)

        if (isSqlDocument) {
            this.statusBarItem.text = `$(sql) ${dialect.toUpperCase()}`
            this.statusBarItem.show()
        } else {
            this.statusBarItem.hide()
        }
    }

    public dispose() {
        this.statusBarItem.dispose()
        this.disposables.forEach(d => d.dispose())
    }
}
