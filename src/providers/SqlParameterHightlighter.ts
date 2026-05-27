import * as vscode from 'vscode'
import { isSqlDocument } from '../core/sqlDialects'
import { t } from '../i18n'

export class SqlParameterHighlighter {
    private static readonly DEBOUNCE_DELAY = 150
    private decorationType: vscode.TextEditorDecorationType
    private disposables: vscode.Disposable[] = []
    private debounceTimer: NodeJS.Timeout | undefined

    constructor() {
        this.decorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
            border: '1px solid',
            borderColor: new vscode.ThemeColor('editor.findMatchBorder'),
            overviewRulerColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
            overviewRulerLane: vscode.OverviewRulerLane.Right
        })

        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor(editor => {
                if (editor && this.isSqlDocument(editor.document)) {
                    this.updateDecorations(editor)
                }
            }),
            vscode.workspace.onDidChangeTextDocument(event => {
                const editor = vscode.window.activeTextEditor
                if (editor && editor.document === event.document && this.isSqlDocument(event.document)) {
                    this.debouncedUpdateDecorations(editor)
                }
            }),
            vscode.window.onDidChangeTextEditorSelection(event => {
                if (this.isSqlDocument(event.textEditor.document)) {
                    this.debouncedUpdateDecorations(event.textEditor)
                }
            })
        )

        if (vscode.window.activeTextEditor) {
            this.updateDecorations(vscode.window.activeTextEditor)
        }
    }
    
    private isSqlDocument(document: vscode.TextDocument): boolean {
        return isSqlDocument(document)
    }
    
    private debouncedUpdateDecorations(editor: vscode.TextEditor): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer)
        }
        this.debounceTimer = setTimeout(() => {
            this.debounceTimer = undefined
            this.updateDecorations(editor)
        }, SqlParameterHighlighter.DEBOUNCE_DELAY)
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
            const wordRange = document.getWordRangeAtPosition(pos, /[$@][a-zA-Z0-9_]+|:\??[a-zA-Z0-9_]+/)
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
                    hoverMessage: t('paramHover', currentParameter)
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
                                     word.startsWith(':?') ||
                                     word.startsWith(':')
        return startsWithValidPrefix && /^([$@][a-zA-Z0-9_]+|:\??[a-zA-Z0-9_]+)$/.test(word)
    }
    
    private createParameterRegex(param: string): RegExp {
        // 转义特殊字符
        const escapedParam = param.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        return new RegExp(escapedParam, 'g')
    }
    
    public dispose(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer)
            this.debounceTimer = undefined
        }
        this.decorationType.dispose()
        for (const d of this.disposables) d.dispose()
    }
}

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class SqlParameterReplaceCommand {
    public static register(_context: vscode.ExtensionContext): vscode.Disposable {
        return vscode.commands.registerCommand('sql-all-in-one.replaceParameter', async () => {
            const editor = vscode.window.activeTextEditor
            if (!editor) {
                vscode.window.showErrorMessage(t('notification.noActiveEditor'))
                return
            }
            
            const document = editor.document
            if (!isSqlDocument(document)) {
                vscode.window.showErrorMessage(t('notification.notSqlDocument'))
                return
            }
            
            // 获取当前光标下的参数
            let currentParameter: string | null = null
            for (const selection of editor.selections) {
                const pos = selection.active
                const wordRange = document.getWordRangeAtPosition(pos, /[$@][a-zA-Z0-9_]+|:\??[a-zA-Z0-9_]+/)
                if (wordRange) {
                    const word = document.getText(wordRange)
                const startsWithValidPrefix = word.startsWith('$') ||
                                             word.startsWith('@') ||
                                             word.startsWith(':?') ||
                                             word.startsWith(':')
                if (startsWithValidPrefix && /^([$@][a-zA-Z0-9_]+|:\??[a-zA-Z0-9_]+)$/.test(word)) {
                        currentParameter = word
                        break
                    }
                }
            }
            
            if (!currentParameter) {
                vscode.window.showInformationMessage(t('notification.noParameterFound'))
                return
            }
            
            // 询问新值
            const newValue = await vscode.window.showInputBox({
                prompt: t('notification.replaceParameter', currentParameter),
                placeHolder: t('notification.replaceParameterPlaceholder'),
                value: currentParameter
            })
            
            if (newValue === undefined) {
                return
            }
            
            // 替换所有匹配
            const fullText = document.getText()
            const paramRegex = new RegExp(currentParameter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
            const ranges: vscode.Range[] = []
            let match

            while ((match = paramRegex.exec(fullText)) !== null) {
                const startPos = document.positionAt(match.index)
                const endPos = document.positionAt(match.index + match[0].length)
                ranges.push(new vscode.Range(startPos, endPos))
            }
            ranges.reverse()
            await editor.edit(editBuilder => {
                for (const range of ranges) {
                    editBuilder.replace(range, newValue)
                }
            })
            
            vscode.window.showInformationMessage(t('notification.replacedAll', currentParameter))
        })
    }
}
