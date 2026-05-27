import * as vscode from 'vscode'
import type { AstNavigator } from './AstNavigator'
import { getNavigationContext } from './guard'

export class SqlDefinitionProvider implements vscode.DefinitionProvider {
    constructor(private navigator: AstNavigator) {}

    provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken,
    ): vscode.Definition | null {
        try {
            const ctx = getNavigationContext(document, position, this.navigator)
            if (!ctx) return null

            const loc = this.navigator.getDefinition(ctx.word, ctx.index)
            return loc || null
        } catch {
            return null
        }
    }
}
