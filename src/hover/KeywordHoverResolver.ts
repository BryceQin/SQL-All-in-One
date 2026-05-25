import * as vscode from 'vscode'
import type { SqlLanguage } from '../formatter/sqlFormatter'
import type { HoverResolver, KeywordInfo } from './HoverResolver'
import { buildKeywordMarkdown } from './hoverUtils'
import { getKeywordsForDialect } from '../languages/keywords'

function matchMultiWordKeyword(
    document: vscode.TextDocument,
    position: vscode.Position,
    singleWord: string,
    keywords: KeywordInfo[]
): { info: KeywordInfo; range: vscode.Range } | null {
    const line = document.lineAt(position.line).text
    const upperLine = line.toUpperCase()
    const char = position.character

    const candidates = keywords.filter(k =>
        k.keyword.toUpperCase() !== singleWord.toUpperCase() &&
        k.keyword.toUpperCase().includes(singleWord.toUpperCase())
    )
    if (candidates.length === 0) return null

    let bestMatch: KeywordInfo | null = null
    let bestRange: vscode.Range | null = null

    for (const kw of candidates) {
        const upperKw = kw.keyword.toUpperCase()
        const kwWords = upperKw.split(/\s+/)
        const firstWord = kwWords[0]

        let searchStart = 0
        while (searchStart < upperLine.length) {
            const idx = upperLine.indexOf(firstWord, searchStart)
            if (idx === -1) break

            const endIdx = idx + upperKw.length
            if (endIdx <= upperLine.length) {
                const textSegment = upperLine.substring(idx, endIdx)
                const normalizedSegment = textSegment.replace(/\s+/g, ' ')
                if (normalizedSegment === upperKw && char >= idx && char <= endIdx) {
                    if (!bestMatch || kw.keyword.length > bestMatch.keyword.length) {
                        bestMatch = kw
                        bestRange = new vscode.Range(position.line, idx, position.line, endIdx)
                    }
                }
            }
            searchStart = idx + 1
        }
    }

    if (bestMatch && bestRange) {
        return { info: bestMatch, range: bestRange }
    }
    return null
}

export class KeywordHoverResolver implements HoverResolver {
    resolve(word: string, dialect: SqlLanguage, document: vscode.TextDocument, position: vscode.Position): vscode.Hover | null {
        const keywords = getKeywordsForDialect(dialect)
        const upperWord = word.toUpperCase()

        const exactMatch = keywords.find(k => k.keyword.toUpperCase() === upperWord)
        if (exactMatch) {
            const md = buildKeywordMarkdown(exactMatch)
            return new vscode.Hover(md)
        }

        const multiMatch = matchMultiWordKeyword(document, position, word, keywords)
        if (multiMatch) {
            const md = buildKeywordMarkdown(multiMatch.info)
            return new vscode.Hover(md, multiMatch.range)
        }

        return null
    }
}
