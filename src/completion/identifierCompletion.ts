import * as vscode from 'vscode'
import Tokenizer from '../lexer/Tokenizer'
import { TokenType } from '../lexer/token'
import { t } from '../i18n'

type ClauseContext = 'from' | 'select' | 'where' | 'unknown'

const RESERVED_COLS = new Set([
    'AS', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'IS', 'NULL', 'CASE',
    'WHEN', 'THEN', 'ELSE', 'END', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER',
    'CROSS', 'ON', 'LIMIT', 'ORDER', 'GROUP', 'BY', 'HAVING', 'UNION', 'ALL',
    'DISTINCT', 'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP',
    'ALTER', 'TABLE', 'INTO', 'SET', 'VALUES'
])

export function getIdentifierItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    tokenizer: Tokenizer
): vscode.CompletionItem[] {
    const text = document.getText()
    if (!text.trim()) return []

    const offset = document.offsetAt(position)
    const line = document.lineAt(position.line).text
    const beforeCursor = line.substring(0, position.character)

    const dotMatch = beforeCursor.match(/(\w+)\.$/)
    if (dotMatch) {
        return getColumnCompletionForAlias(dotMatch[1].toLowerCase(), text)
    }

    const ctx = getClauseContext(text, offset, tokenizer)
    return getCompletionForContext(ctx, text)
}

function getClauseContext(text: string, offset: number, tokenizer: Tokenizer): ClauseContext {
    try {
        const tokens = tokenizer.tokenize(text, {})
        for (let i = tokens.length - 1; i >= 0; i--) {
            const t = tokens[i]
            if (t.start > offset) continue
            const relatedTypes: TokenType[] = [TokenType.RESERVED_CLAUSE, TokenType.RESERVED_SELECT, TokenType.RESERVED_KEYWORD]
            if (relatedTypes.indexOf(t.type) === -1) continue
            const kw = t.text.toUpperCase()
            if (kw === 'FROM' || kw === 'JOIN') return 'from'
            if (kw === 'SELECT') return 'select'
            if (kw === 'WHERE') return 'where'
        }
    } catch {
        return 'unknown'
    }
    return 'unknown'
}

function getColumnCompletionForAlias(alias: string, text: string): vscode.CompletionItem[] {
    const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const fromMatch = text.match(new RegExp(`\\bFROM\\s+(\\w+)\\s+(?:AS\\s+)?${escapedAlias}\\b`, 'i'))
    const joinMatch = text.match(new RegExp(`\\bJOIN\\s+(\\w+)\\s+(?:AS\\s+)?${escapedAlias}\\b`, 'i'))
    if (!fromMatch && !joinMatch) return []

    const columns = findColumns(text)
    return columns.map((col) => {
        const item = new vscode.CompletionItem(col, vscode.CompletionItemKind.Field)
        item.detail = `${alias}.${col}`
        item.sortText = `4_${col}`
        return item
    })
}

function findColumns(text: string): string[] {
    const selectMatch = /\bSELECT\b/i.exec(text)
    const fromMatch = /\bFROM\b/i.exec(text)
    if (!selectMatch || !fromMatch) return []

    const between = text.substring(selectMatch.index + 6, fromMatch.index)
    const cols = new Set<string>()
    const colRegex = /(\w+)(?:\s*,|\s+FROM|\s*$)/gi
    let m: RegExpExecArray | null
    while ((m = colRegex.exec(between)) !== null) {
        const c = m[1].toUpperCase()
        if (!RESERVED_COLS.has(c)) cols.add(m[1].toLowerCase())
    }
    return [...cols]
}

function getCompletionForContext(ctx: ClauseContext, text: string): vscode.CompletionItem[] {
    if (ctx === 'from') {
        return extractTableNames(text).map((tbl) => {
            const item = new vscode.CompletionItem(tbl, vscode.CompletionItemKind.Class)
            item.detail = t('completion.tableName')
            item.sortText = `4_${tbl}`
            return item
        })
    }
    if (ctx === 'select' || ctx === 'where') {
        return findColumns(text).map((col) => {
            const item = new vscode.CompletionItem(col, vscode.CompletionItemKind.Field)
            item.detail = t('completion.columnName')
            item.sortText = `4_${col}`
            return item
        })
    }
    return []
}

function extractTableNames(text: string): string[] {
    const names = new Set<string>()
    const regex = /\b(?:FROM|JOIN)\s+(\w+)/gi
    let m: RegExpExecArray | null
    while ((m = regex.exec(text)) !== null) {
        names.add(m[1].toLowerCase())
    }
    return [...names]
}