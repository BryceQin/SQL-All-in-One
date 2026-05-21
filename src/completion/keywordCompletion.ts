import * as vscode from 'vscode'
import { t } from '../i18n'

export function getKeywordItems(
    keywords: string[],
    dataTypes: string[],
    dialectName: string
): vscode.CompletionItem[] {
    const keywordItems = keywords.map((k) => {
        const item = new vscode.CompletionItem(k, vscode.CompletionItemKind.Keyword)
        item.insertText = k
        item.detail = t('completion.keywordLabel', `${dialectName.toUpperCase()}`)
        item.sortText = `1_${k}`
        return item
    })
    const dataTypeItems = dataTypes.map((dt) => {
        const item = new vscode.CompletionItem(dt, vscode.CompletionItemKind.TypeParameter)
        item.insertText = dt
        item.detail = t('completion.dataTypeLabel', `${dialectName.toUpperCase()}`)
        item.sortText = `1_${dt}`
        return item
    })
    return [...keywordItems, ...dataTypeItems]
}