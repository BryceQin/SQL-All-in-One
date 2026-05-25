import * as vscode from 'vscode'
import type { SqlLanguage } from '../formatter/sqlFormatter'
import type { HoverResolver } from './HoverResolver'
import { extractParameterAtPosition, buildParameterMarkdown } from './hoverUtils'

interface ParamScanResult {
    paramName: string
    locations: { line: number; context: string }[]
}

const scanCache = new Map<string, { version: number; result: Map<string, ParamScanResult> }>()

function scanDocumentParameters(document: vscode.TextDocument): Map<string, ParamScanResult> {
    const cacheKey = document.uri.toString()
    const cached = scanCache.get(cacheKey)
    if (cached && cached.version === document.version) {
        return cached.result
    }

    const paramMap = new Map<string, ParamScanResult>()
    const paramRegex = /\$\{(\w+)\}/g
    const lineCount = document.lineCount

    for (let i = 0; i < lineCount; i++) {
        const line = document.lineAt(i).text
        let match: RegExpExecArray | null
        paramRegex.lastIndex = 0
        while ((match = paramRegex.exec(line)) !== null) {
            const name = match[1]
            const existing = paramMap.get(name)
            const location = { line: i + 1, context: line.trim() }
            if (existing) {
                existing.locations.push(location)
            } else {
                paramMap.set(name, { paramName: name, locations: [location] })
            }
        }
    }

    scanCache.set(cacheKey, { version: document.version, result: paramMap })
    return paramMap
}

export class ParameterHoverResolver implements HoverResolver {
    resolve(_word: string, _dialect: SqlLanguage, document: vscode.TextDocument, position: vscode.Position): vscode.Hover | null {
        const paramInfo = extractParameterAtPosition(document, position)
        if (!paramInfo) return null

        const paramMap = scanDocumentParameters(document)
        const scanResult = paramMap.get(paramInfo.paramName)
        if (!scanResult) return null

        const md = buildParameterMarkdown(scanResult.paramName, scanResult.locations)
        return new vscode.Hover(md, paramInfo.range)
    }
}
