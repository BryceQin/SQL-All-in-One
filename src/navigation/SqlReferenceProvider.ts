import * as vscode from 'vscode'
import type { AstNavigator } from './AstNavigator'

export class SqlReferenceProvider implements vscode.ReferenceProvider {
    constructor(private navigator: AstNavigator) {}

    provideReferences(
        document: vscode.TextDocument,
        position: vscode.Position,
        _context: vscode.ReferenceContext,
        _token: vscode.CancellationToken,
    ): vscode.Location[] | null {
        try {
            const config = vscode.workspace.getConfiguration('SQL-All-in-One')
            if (!config.get<boolean>('enableNavigation', true)) return null

            const range = document.getWordRangeAtPosition(position)
            if (!range) return null
            const word = document.getText(range)

            const result = this.navigator.getAST(document)
            if (!result) return null

            const { ast, index } = result

            const symbolType = this.navigator.detectSymbolType(word, index)
            if (!symbolType) return null

            const defLoc = this.navigator.getDefinition(word, index)
            const refs = this.navigator.findReferences(ast, word, document, symbolType)

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
