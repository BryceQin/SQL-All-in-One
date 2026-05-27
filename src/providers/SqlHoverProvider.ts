import * as vscode from 'vscode'
import { sqlDialects } from '../core/sqlDialects'
import type { SqlLanguage } from '../formatter/sqlFormatter'
import type { HoverResolver } from '../hover/HoverResolver'
import { ParameterHoverResolver } from '../hover/ParameterHoverResolver'
import { FunctionHoverResolver } from '../hover/FunctionHoverResolver'
import { KeywordHoverResolver } from '../hover/KeywordHoverResolver'
import { extractWordAtPosition } from '../hover/hoverUtils'
import { getConfigManager } from '../core/configManager'

export class SqlHoverProvider implements vscode.HoverProvider {
    private resolvers: HoverResolver[]

    constructor() {
        this.resolvers = [
            new ParameterHoverResolver(),
            new FunctionHoverResolver(),
            new KeywordHoverResolver(),
        ]
    }

    provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
    ): vscode.Hover | null {
        if (!getConfigManager().get<boolean>('enableHover', true)) return null
        if (token.isCancellationRequested) return null

        const dialectName = sqlDialects[document.languageId as keyof typeof sqlDialects]
        if (!dialectName) return null

        const word = extractWordAtPosition(document, position)
        if (!word) return null

        for (const resolver of this.resolvers) {
            const result = resolver.resolve(word, dialectName as SqlLanguage, document, position)
            if (result) return result
        }
        return null
    }
}
