import * as vscode from 'vscode'
import Tokenizer from '../lexer/Tokenizer'
import { t } from '../i18n'

type ClauseContext = 'from' | 'select' | 'where' | 'unknown'

const RESERVED_COLS = new Set([
    'AS', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'IS', 'NULL', 'CASE',
    'WHEN', 'THEN', 'ELSE', 'END', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER',
    'CROSS', 'ON', 'LIMIT', 'ORDER', 'GROUP', 'BY', 'HAVING', 'UNION', 'ALL',
    'DISTINCT', 'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP',
    'ALTER', 'TABLE', 'INTO', 'SET', 'VALUES'
])

interface IdentifierCache {
    version: number;
    uri: string;
    tableNames: string[];
    columnNames: string[];
    tableItems: vscode.CompletionItem[] | null;
    columnItems: vscode.CompletionItem[] | null;
}

let _identifierCache: IdentifierCache | null = null;

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
    const uri = document.uri.toString()
    const version = document.version

    if (_identifierCache && _identifierCache.uri === uri && _identifierCache.version === version) {
        if (ctx === 'from') return _identifierCache.tableItems ?? []
        if (ctx === 'select' || ctx === 'where') return _identifierCache.columnItems ?? []
        return []
    }

    const tableNames = extractTableNames(text)
    const columnNames = findColumns(text)
    const tableItems = tableNames.map((tbl) => {
        const item = new vscode.CompletionItem(tbl, vscode.CompletionItemKind.Class)
        item.detail = t('completion.tableName')
        item.sortText = `4_${tbl}`
        return item
    })
    const columnItems = columnNames.map((col) => {
        const item = new vscode.CompletionItem(col, vscode.CompletionItemKind.Field)
        item.detail = t('completion.columnName')
        item.sortText = `4_${col}`
        return item
    })

    _identifierCache = {
        version,
        uri,
        tableNames,
        columnNames,
        tableItems,
        columnItems,
    }

    if (ctx === 'from') return tableItems
    if (ctx === 'select' || ctx === 'where') return columnItems
    return []
}

function getClauseContext(text: string, offset: number, _tokenizer: Tokenizer): ClauseContext {
    try {
        const textBeforeCursor = text.substring(0, offset)
        const keywordPattern = /\b(FROM|JOIN|SELECT|WHERE|GROUP\s+BY|ORDER\s+BY|HAVING|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/gi
        let lastMatch = ''
        let m: RegExpExecArray | null
        while ((m = keywordPattern.exec(textBeforeCursor)) !== null) {
            lastMatch = m[1].toUpperCase().replace(/\s+/g, ' ')
        }

        if (lastMatch === 'FROM' || lastMatch === 'JOIN') return 'from'
        if (lastMatch === 'SELECT') return 'select'
        if (lastMatch === 'WHERE' || lastMatch === 'HAVING') return 'where'
        if (lastMatch === 'GROUP BY' || lastMatch === 'ORDER BY') return 'select'
        if (lastMatch === 'INSERT' || lastMatch === 'UPDATE' || lastMatch === 'DELETE' ||
            lastMatch === 'CREATE' || lastMatch === 'ALTER' || lastMatch === 'DROP') return 'unknown'
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

    const columns = _identifierCache?.columnNames ?? findColumns(text)
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

export function clearIdentifierCache(): void {
    _identifierCache = null
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