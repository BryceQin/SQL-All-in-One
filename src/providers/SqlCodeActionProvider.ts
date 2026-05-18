import * as vscode from 'vscode'

export class SqlCodeActionProvider implements vscode.CodeActionProvider {
    public static readonly providedCodeActionKinds = [
        vscode.CodeActionKind.QuickFix
    ]

    provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        _token: vscode.CancellationToken
    ): vscode.CodeAction[] {
        const actions: vscode.CodeAction[] = []

        for (const diagnostic of context.diagnostics) {
            const fix = this.tryCreateFix(document, diagnostic)
            if (fix) {
                actions.push(fix)
            }
        }

        return actions
    }

    private tryCreateFix(
        document: vscode.TextDocument,
        diagnostic: vscode.Diagnostic
    ): vscode.CodeAction | null {
        const message = diagnostic.message

        // Fix for "使用 = NULL 而非 IS NULL"
        if (message.includes('= NULL') || message.includes('IS NULL')) {
            return this.createNullComparisonFix(document, diagnostic)
        }

        // Fix for "HAVING 子句缺少 GROUP BY"
        if (message.includes('HAVING') && message.includes('GROUP BY')) {
            return this.createHavingFix(document, diagnostic)
        }

        // Fix for "使用了保留字作为标识符"
        if (message.includes('保留字')) {
            return this.createReservedWordFix(document, diagnostic)
        }

        // Fix for "子查询缺少别名"
        if (message.includes('子查询') && message.includes('别名')) {
            return this.createSubqueryAliasFix(document, diagnostic)
        }

        // Fix for "INSERT 语句缺少列名"
        if (message.includes('INSERT') && message.includes('列名')) {
            return this.createInsertColumnsFix(document, diagnostic)
        }

        return null
    }

    private createNullComparisonFix(
        document: vscode.TextDocument,
        diagnostic: vscode.Diagnostic
    ): vscode.CodeAction {
        const action = new vscode.CodeAction(
            '将 = NULL 改为 IS NULL',
            vscode.CodeActionKind.QuickFix
        )
        action.diagnostics = [diagnostic]
        action.isPreferred = true

        const text = document.getText(diagnostic.range)
        let newText = text
        
        if (text.includes('= NULL')) {
            newText = text.replace('= NULL', 'IS NULL')
        } else if (text.includes('= null')) {
            newText = text.replace('= null', 'IS NULL')
        } else if (text.includes('!= NULL')) {
            newText = text.replace('!= NULL', 'IS NOT NULL')
        } else if (text.includes('!= null')) {
            newText = text.replace('!= null', 'IS NOT NULL')
        } else if (text.includes('<> NULL')) {
            newText = text.replace('<> NULL', 'IS NOT NULL')
        } else if (text.includes('<> null')) {
            newText = text.replace('<> null', 'IS NOT NULL')
        }

        action.edit = new vscode.WorkspaceEdit()
        action.edit.replace(document.uri, diagnostic.range, newText)

        return action
    }

    private createHavingFix(
        document: vscode.TextDocument,
        diagnostic: vscode.Diagnostic
    ): vscode.CodeAction {
        const action = new vscode.CodeAction(
            '添加 GROUP BY 子句',
            vscode.CodeActionKind.QuickFix
        )
        action.diagnostics = [diagnostic]

        const text = document.getText()
        const havingMatch = text.match(/HAVING/i)
        
        if (havingMatch && havingMatch.index !== undefined) {
            const beforeHaving = text.substring(0, havingMatch.index)
            const fromMatch = beforeHaving.match(/FROM\s+(\w+)/i)
            
            if (fromMatch) {
                const tableName = fromMatch[1]
                const insertPos = document.positionAt(havingMatch.index)
                
                action.edit = new vscode.WorkspaceEdit()
                action.edit.insert(
                    document.uri,
                    insertPos,
                    `\nGROUP BY ${tableName}.id `
                )
            }
        }

        return action
    }

    private createReservedWordFix(
        document: vscode.TextDocument,
        diagnostic: vscode.Diagnostic
    ): vscode.CodeAction {
        const action = new vscode.CodeAction(
            '用反引号包裹标识符',
            vscode.CodeActionKind.QuickFix
        )
        action.diagnostics = [diagnostic]
        action.isPreferred = true

        const text = document.getText(diagnostic.range)
        const newText = `\`${text}\``

        action.edit = new vscode.WorkspaceEdit()
        action.edit.replace(document.uri, diagnostic.range, newText)

        return action
    }

    private createSubqueryAliasFix(
        document: vscode.TextDocument,
        diagnostic: vscode.Diagnostic
    ): vscode.CodeAction {
        const action = new vscode.CodeAction(
            '为子查询添加别名',
            vscode.CodeActionKind.QuickFix
        )
        action.diagnostics = [diagnostic]
        action.isPreferred = true

        const text = document.getText(diagnostic.range)
        const newText = `${text} AS subquery`

        action.edit = new vscode.WorkspaceEdit()
        action.edit.replace(document.uri, diagnostic.range, newText)

        return action
    }

    private createInsertColumnsFix(
        document: vscode.TextDocument,
        diagnostic: vscode.Diagnostic
    ): vscode.CodeAction {
        const action = new vscode.CodeAction(
            '添加列名占位符',
            vscode.CodeActionKind.QuickFix
        )
        action.diagnostics = [diagnostic]
        action.isPreferred = true

        // Find INSERT INTO table
        const text = document.getText(diagnostic.range)
        const insertMatch = text.match(/INSERT\s+INTO\s+(\w+)/i)
        
        if (insertMatch) {
            const insertPos = diagnostic.range.end
            
            action.edit = new vscode.WorkspaceEdit()
            action.edit.insert(
                document.uri,
                document.positionAt(insertPos.character),
                ' (col1, col2, col3)'
            )
        }

        return action
    }
}
