import * as vscode from 'vscode'
import type { AstNavigator } from './AstNavigator'

export class SqlDefinitionProvider implements vscode.DefinitionProvider {
    constructor(private navigator: AstNavigator) {}

    provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken,
    ): vscode.Definition | null {
        try {
            const config = vscode.workspace.getConfiguration('SQL-All-in-One')
            if (!config.get<boolean>('enableNavigation', true)) return null

            const range = document.getWordRangeAtPosition(position)
            if (!range) return null
            const word = document.getText(range)

            const result = this.navigator.getAST(document)
            if (!result) return null

            const { index } = result
            const loc = this.navigator.getDefinition(word, index)

            return loc || null
        } catch {
            return null
        }
    }
}
