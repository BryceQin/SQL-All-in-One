import * as vscode from 'vscode'
import { sqlDialects } from '../core/sqlDialects'

export class SqlParameterHighlighter {
    private decorationType: vscode.TextEditorDecorationType
    private disposable: vscode.Disposable
    
    constructor() {
        this.decorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
            border: '1px solid',
            borderColor: new vscode.ThemeColor('editor.findMatchBorder'),
            overviewRulerColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
            overviewRulerLane: vscode.OverviewRulerLane.Right
        })
        
        // 监听活动编辑器变化
        this.disposable = vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor && this.isSqlDocument(editor.document)) {
                this.updateDecorations(editor)
            }
        })
        
        // 监听文档变化
        vscode.workspace.onDidChangeTextDocument(event => {
            const editor = vscode.window.activeTextEditor
            if (editor && editor.document === event.document && this.isSqlDocument(event.document)) {
                this.updateDecorations(editor)
            }
        })
        
        // 监听光标位置变化
        vscode.window.onDidChangeTextEditorSelection(event => {
            if (this.isSqlDocument(event.textEditor.document)) {
                this.updateDecorations(event.textEditor)
            }
        })
        
        // 初始更新
        if (vscode.window.activeTextEditor) {
            this.updateDecorations(vscode.window.activeTextEditor)
        }
    }
    
    private isSqlDocument(document: vscode.TextDocument): boolean {
        return Object.keys(sqlDialects).includes(document.languageId)
    }
    
    public updateDecorations(editor: vscode.TextEditor): void {
        if (!this.isSqlDocument(editor.document)) {
            editor.setDecorations(this.decorationType, [])
            return
        }
        
        const document = editor.document
        const text = document.getText()
        const selections = editor.selections
        
        // 找出当前光标下的参数
        let currentParameter: string | null = null
        
        for (const selection of selections) {
            const pos = selection.active
            const wordRange = document.getWordRangeAtPosition(pos, /[$:?@][a-zA-Z0-9_]+|:[a-zA-Z0-9_]+/)
            if (wordRange) {
                const word = document.getText(wordRange)
                if (this.isParameter(word)) {
                    currentParameter = word
                    break
                }
            }
        }
        
        // 如果找到当前参数，高亮所有相同的参数
        if (currentParameter) {
            const decorations: vscode.DecorationOptions[] = []
            const paramRegex = this.createParameterRegex(currentParameter)
            let match
            
            while ((match = paramRegex.exec(text)) !== null) {
                const startPos = document.positionAt(match.index)
                const endPos = document.positionAt(match.index + match[0].length)
                const range = new vscode.Range(startPos, endPos)
                
                decorations.push({
                    range,
                    hoverMessage: `Parameter: ${currentParameter}`
                })
            }
            
            editor.setDecorations(this.decorationType, decorations)
        } else {
            editor.setDecorations(this.decorationType, [])
        }
    }
    
    private isParameter(word: string): boolean {
        // 支持常见的参数格式
        const startsWithValidPrefix = word.startsWith('$') || 
                                     word.startsWith('@') || 
                                     word.startsWith(':') ||
                                     word.startsWith(':?')
        return startsWithValidPrefix && /^[$:?@][a-zA-Z0-9_]+$/.test(word)
    }
    
    private createParameterRegex(param: string): RegExp {
        // 转义特殊字符
        const escapedParam = param.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        return new RegExp(escapedParam, 'g')
    }
    
    public dispose(): void {
        this.decorationType.dispose()
        this.disposable.dispose()
    }
}

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class SqlParameterReplaceCommand {
    public static register(_context: vscode.ExtensionContext): vscode.Disposable {
        return vscode.commands.registerCommand('hive-formatter.replaceParameter', async () => {
            const editor = vscode.window.activeTextEditor
            if (!editor) {
                vscode.window.showErrorMessage('No active editor')
                return
            }
            
            const document = editor.document
            if (document.languageId !== 'sql' && document.languageId !== 'hive') {
                vscode.window.showErrorMessage('Not an SQL document')
                return
            }
            
            // 获取当前光标下的参数
            let currentParameter: string | null = null
            for (const selection of editor.selections) {
                const pos = selection.active
                const wordRange = document.getWordRangeAtPosition(pos, /[$:?@][a-zA-Z0-9_]+|:[a-zA-Z0-9_]+/)
                if (wordRange) {
                    const word = document.getText(wordRange)
                const startsWithValidPrefix = word.startsWith('$') || 
                                             word.startsWith('@') || 
                                             word.startsWith(':') ||
                                             word.startsWith(':?')
                if (startsWithValidPrefix && /^[$:?@][a-zA-Z0-9_]+$/.test(word)) {
                        currentParameter = word
                        break
                    }
                }
            }
            
            if (!currentParameter) {
                vscode.window.showInformationMessage('No parameter under cursor')
                return
            }
            
            // 询问新值
            const newValue = await vscode.window.showInputBox({
                prompt: `Replace ${currentParameter} with:`,
                placeHolder: 'Enter new value',
                value: currentParameter
            })
            
            if (newValue === undefined) {
                return
            }
            
            // 替换所有匹配
            await editor.edit(editBuilder => {
                const text = document.getText()
                const paramRegex = new RegExp(currentParameter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
                let match
                
                while ((match = paramRegex.exec(text)) !== null) {
                    const startPos = document.positionAt(match.index)
                    const endPos = document.positionAt(match.index + match[0].length)
                    const range = new vscode.Range(startPos, endPos)
                    editBuilder.replace(range, newValue)
                }
            })
            
            vscode.window.showInformationMessage(`Replaced all occurrences of ${currentParameter}`)
        })
    }
}
