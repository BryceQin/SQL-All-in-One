import * as vscode from 'vscode'
import { t, type MessageKey } from '../i18n'
import type { FunctionSignature } from '../completion/functionSignatures'
import { getCategoryLabel } from '../completion/functionSignatures'
import type { KeywordInfo, KeywordCategory } from './HoverResolver'

const categoryLabelMap: Record<KeywordCategory, MessageKey> = {
    query: 'hover.keywordCategory.query',
    join: 'hover.keywordCategory.join',
    setop: 'hover.keywordCategory.setop',
    dml: 'hover.keywordCategory.dml',
    ddl: 'hover.keywordCategory.ddl',
    window: 'hover.keywordCategory.window',
    transaction: 'hover.keywordCategory.transaction',
    auxiliary: 'hover.keywordCategory.auxiliary',
    conditional: 'hover.keywordCategory.conditional',
    type: 'hover.keywordCategory.type',
    hint: 'hover.keywordCategory.hint',
}

export function getKeywordCategoryLabel(category: KeywordCategory): string {
    return t(categoryLabelMap[category])
}

export function extractWordAtPosition(
    document: vscode.TextDocument,
    position: vscode.Position
): string | null {
    const range = document.getWordRangeAtPosition(position)
    if (!range) return null
    return document.getText(range).toUpperCase()
}

export function extractParameterAtPosition(
    document: vscode.TextDocument,
    position: vscode.Position
): { paramName: string; range: vscode.Range } | null {
    const line = document.lineAt(position.line).text
    const paramRegex = /\$\{(\w+)\}/g
    let match: RegExpExecArray | null
    while ((match = paramRegex.exec(line)) !== null) {
        const start = match.index
        const end = start + match[0].length
        if (position.character >= start && position.character <= end) {
            const range = new vscode.Range(
                position.line, start,
                position.line, end
            )
            return { paramName: match[1], range }
        }
    }
    return null
}

export function buildFunctionMarkdown(fn: FunctionSignature): vscode.MarkdownString {
    const md = new vscode.MarkdownString()
    md.isTrusted = true
    const params = fn.params.join(', ')
    md.appendMarkdown(`### ${fn.name}(${params})\n\n`)
    md.appendMarkdown(`---\n\n`)
    md.appendMarkdown(`${getCategoryLabel(fn.category)} — ${fn.description}\n\n`)
    if (fn.returnType) {
        md.appendMarkdown(`**${t('hover.returnType')}** \`${fn.returnType}\`\n\n`)
    }
    md.appendMarkdown(`**${t('hover.syntax')}**\n`)
    md.appendCodeblock(`${fn.name}(${params})`, 'sql')
    return md
}

export function buildKeywordMarkdown(info: KeywordInfo): vscode.MarkdownString {
    const md = new vscode.MarkdownString()
    md.isTrusted = true
    md.appendMarkdown(`### ${info.keyword}\n\n`)
    md.appendMarkdown(`---\n\n`)
    md.appendMarkdown(`${getKeywordCategoryLabel(info.category)} — ${t('hover.keyword')}\n\n`)
    md.appendMarkdown(`${info.description}\n\n`)
    md.appendMarkdown(`**${t('hover.syntax')}**\n`)
    md.appendCodeblock(info.syntax, 'sql')
    if (info.example) {
        md.appendMarkdown(`\n**${t('hover.example')}**\n`)
        md.appendCodeblock(info.example, 'sql')
    }
    return md
}

export function buildParameterMarkdown(
    paramName: string,
    locations: { line: number; context: string }[]
): vscode.MarkdownString {
    const md = new vscode.MarkdownString()
    md.isTrusted = true
    md.appendMarkdown(`### ${t('hover.parameterRef')}\n\n`)
    md.appendMarkdown(`---\n\n`)
    md.appendMarkdown(`**${t('hover.parameterName')}** \`${paramName}\`\n\n`)
    const maxDisplay = 20
    const total = locations.length
    const displayLocations = locations.slice(0, maxDisplay)
    md.appendMarkdown(`${t('hover.parameterUsage', String(total))}\n\n`)
    for (const loc of displayLocations) {
        md.appendMarkdown(`* ${t('hover.parameterLine', String(loc.line))} \`${loc.context}\`\n`)
    }
    if (total > maxDisplay) {
        md.appendMarkdown(`\n... ${t('hover.parameterMore', String(total - maxDisplay))}\n`)
    }
    md.appendMarkdown(`\n---\n\n*${t('hover.parameterTip')}*`)
    return md
}
