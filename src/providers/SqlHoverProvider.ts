import * as vscode from 'vscode'
import { sqlDialects } from '../core/sqlDialects'
import type { SqlLanguage } from '../formatter/sqlFormatter'
import type { HoverResolver } from '../hover/HoverResolver'
import { ParameterHoverResolver } from '../hover/ParameterHoverResolver'
import { FunctionHoverResolver } from '../hover/FunctionHoverResolver'
import { KeywordHoverResolver } from '../hover/KeywordHoverResolver'
import { SchemaHoverResolver } from '../hover/SchemaHoverResolver'
import { extractWordAtPosition } from '../hover/hoverUtils'
import { getConfigManager } from '../core/configManager'
import { getConnectionManager } from '../database/connection/ConnectionManager'
import { getPerformanceMonitor } from '../core/performanceMonitor'

export class SqlHoverProvider implements vscode.HoverProvider {
    private docResolvers: HoverResolver[]
    private schemaResolver: SchemaHoverResolver
    private staticResolvers: HoverResolver[]

    constructor() {
        this.docResolvers = [
            new ParameterHoverResolver(),
            new FunctionHoverResolver(),
        ]
        this.schemaResolver = new SchemaHoverResolver()
        this.staticResolvers = [
            new KeywordHoverResolver(),
        ]
    }

    async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
    ): Promise<vscode.Hover | null> {
        return getPerformanceMonitor().measureAsync('SqlHoverProvider.provideHover', async () => {
            if (!getConfigManager().get<boolean>('enableHover', true)) return null
            if (token.isCancellationRequested) return null

            const dialectName = sqlDialects[document.languageId as keyof typeof sqlDialects]
            if (!dialectName) return null

            const word = extractWordAtPosition(document, position)
            if (!word) return null

            for (const resolver of this.docResolvers) {
                const result = resolver.resolve(word, dialectName as SqlLanguage, document, position)
                if (result) return result
            }

            const activeConn = getConnectionManager().getActiveConnection()
            if (activeConn) {
                try {
                    const schemaResult = await this.schemaResolver.resolve(word, dialectName as SqlLanguage, document, position)
                    if (schemaResult) return schemaResult
                } catch (e) { /* schema hover failed, fallback */ console.debug('[SQL All in One] SqlHoverProvider schema hover failed:', e) }
            }

            for (const resolver of this.staticResolvers) {
                const result = resolver.resolve(word, dialectName as SqlLanguage, document, position)
                if (result) return result
            }
            return null
        })
    }
}
