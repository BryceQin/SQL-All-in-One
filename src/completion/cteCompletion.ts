import * as vscode from 'vscode'

export function getCTEItems(
    document: vscode.TextDocument,
    position: vscode.Position
): vscode.CompletionItem[] {
    const textBeforeCursor = document.getText(
        new vscode.Range(new vscode.Position(0, 0), position)
    )
    if (!textBeforeCursor.trim()) return []

    const cteNames = extractCTENames(textBeforeCursor)
    if (cteNames.length === 0) return []

    return cteNames.map((name) => {
        const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Variable)
        item.detail = 'CTE (公共表表达式)'
        item.sortText = `3_${name}`
        return item
    })
}

function extractCTENames(text: string): string[] {
    const names = new Set<string>()
    const cteRegex = /(\w+)\s+AS\s*\(/gi
    let match: RegExpExecArray | null
    while ((match = cteRegex.exec(text)) !== null) {
        const n = match[1].toLowerCase()
        const reserved = ['select', 'with', 'from', 'where', 'join', 'on', 'and', 'or']
        if (!reserved.includes(n)) names.add(n)
    }
    return [...names]
}