import * as vscode from 'vscode'
import type { AstNavigator } from './AstNavigator'
import { getNavigationContext } from './guard'

export class SqlReferenceProvider implements vscode.ReferenceProvider {
    constructor(private navigator: AstNavigator) {}

    provideReferences(
        document: vscode.TextDocument,
        position: vscode.Position,
        _context: vscode.ReferenceContext,
        _token: vscode.CancellationToken,
    ): vscode.Location[] | null {
        try {
            const ctx = getNavigationContext(document, position, this.navigator)
            if (!ctx) return null

            const symbolType = this.navigator.detectSymbolType(ctx.word, ctx.index)
            if (!symbolType) return null

            const defLoc = this.navigator.getDefinition(ctx.word, ctx.index)
            const refs = this.navigator.findReferences(ctx.ast, ctx.word, document, symbolType)

            const locations: vscode.Location[] = []
            if (defLoc) {
                locations.push(defLoc)
            }
            for (const ref of refs) {
                locations.push(ref.location)
            }

            return locations.length > 0 ? locations : null
        } catch {
            return null
        }
    }
}
