import * as vscode from 'vscode'

interface SnippetDefinition {
    prefix: string
    body: string[]
    description: string
}

export function getSnippetItems(
    snippets: Record<string, SnippetDefinition>
): vscode.CompletionItem[] {
    return Object.values(snippets).map((s) => {
        const item = new vscode.CompletionItem(s.description, vscode.CompletionItemKind.Snippet)
        item.insertText = new vscode.SnippetString(s.body.join('\n'))
        item.filterText = s.prefix
        item.detail = `代码片段 (${s.prefix})`
        item.sortText = `0_${s.prefix}`
        return item
    })
}