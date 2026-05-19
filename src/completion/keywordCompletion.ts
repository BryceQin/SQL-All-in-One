import * as vscode from 'vscode'

export function getKeywordItems(
    keywords: string[],
    dataTypes: string[],
    dialectName: string
): vscode.CompletionItem[] {
    const keywordItems = keywords.map((k) => {
        const item = new vscode.CompletionItem(k, vscode.CompletionItemKind.Keyword)
        item.insertText = k
        item.detail = `${dialectName.toUpperCase()} 关键字`
        item.sortText = `1_${k}`
        return item
    })
    const dataTypeItems = dataTypes.map((dt) => {
        const item = new vscode.CompletionItem(dt, vscode.CompletionItemKind.TypeParameter)
        item.insertText = dt
        item.detail = `${dialectName.toUpperCase()} 数据类型`
        item.sortText = `1_${dt}`
        return item
    })
    return [...keywordItems, ...dataTypeItems]
}