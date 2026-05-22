import * as vscode from 'vscode'
import { t } from '../i18n'
import { extractCteNames } from './AstCompletionProvider'
import { toSqlDialect } from '../core/sqlDialects'

export function getCTEItems(
    document: vscode.TextDocument,
    position: vscode.Position
): vscode.CompletionItem[] {
    const textBeforeCursor = document.getText(
        new vscode.Range(new vscode.Position(0, 0), position)
    )
    if (!textBeforeCursor.trim()) return []

    const cteNames = extractCteNamesAstFirst(textBeforeCursor, document.languageId)
    if (cteNames.length === 0) return []

    return cteNames.map((name) => {
        const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Variable)
        item.detail = t('completion.cteLabel')
        item.sortText = `3_${name}`
        return item
    })
}

function extractCteNamesAstFirst(text: string, langId: string): string[] {
    try {
        const dialect = toSqlDialect(langId)
        const astNames = extractCteNames(text, dialect)
        if (astNames.length > 0) {
            return astNames
        }
    } catch {
        // AST extraction failed, fall back to regex
    }

    return extractCteNamesRegex(text)
}

function extractCteNamesRegex(text: string): string[] {
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
