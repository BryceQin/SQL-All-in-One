import * as vscode from 'vscode'
import { t } from '../i18n'

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
                actions.push(...(Array.isArray(fix) ? fix : [fix]))
            }
        }

        return actions
    }

    private tryCreateFix(
        document: vscode.TextDocument,
        diagnostic: vscode.Diagnostic
    ): vscode.CodeAction | vscode.CodeAction[] | null {
        const code = typeof diagnostic.code === 'object' ? diagnostic.code.value : diagnostic.code
        const message = diagnostic.message

        if (code === 'missing_query_comment') {
            return this.createMissingQueryCommentFix(document, diagnostic)
        }
        if (code === 'missing_column_comment') {
            return this.createMissingColumnCommentFix(document, diagnostic)
        }
        if (code === 'commented_out_code') {
            return this.createCommentedOutCodeFixes(document, diagnostic)
        }
        if (code === 'expired_todo') {
            return this.createExpiredTodoFixes(document, diagnostic)
        }

        if (message.includes('= NULL') || message.includes('IS NULL')) {
            return this.createNullComparisonFix(document, diagnostic)
        }
        if (message.includes('HAVING') && message.includes('GROUP BY')) {
            return this.createHavingFix(document, diagnostic)
        }
        if (message.includes('保留字')) {
            return this.createReservedWordFix(document, diagnostic)
        }
        if (message.includes('子查询') && message.includes('别名')) {
            return this.createSubqueryAliasFix(document, diagnostic)
        }
        if (message.includes('INSERT') && message.includes('列名')) {
            return this.createInsertColumnsFix(document, diagnostic)
        }

        return null
    }

    private createMissingQueryCommentFix(
        document: vscode.TextDocument,
        diagnostic: vscode.Diagnostic
    ): vscode.CodeAction {
        const action = new vscode.CodeAction(
            t('codeAction.addQueryComment'),
            vscode.CodeActionKind.QuickFix
        )
        action.diagnostics = [diagnostic]
        action.isPreferred = true

        const insertPos = diagnostic.range.start
        const linePrefix = document.lineAt(insertPos.line).text.match(/^(\s*)/)?.[1] || ''
        const today = new Date().toISOString().slice(0, 10)
        const snippet = `${linePrefix}-- ============================================\n${linePrefix}-- 查询说明：\n${linePrefix}-- 涉及表：\n${linePrefix}-- 条件：\n${linePrefix}-- 输出：\n${linePrefix}-- 日期：${today}\n${linePrefix}-- ============================================\n`

        action.edit = new vscode.WorkspaceEdit()
        action.edit.insert(document.uri, insertPos, snippet)

        return action
    }

    private createMissingColumnCommentFix(
        document: vscode.TextDocument,
        diagnostic: vscode.Diagnostic
    ): vscode.CodeAction {
        const action = new vscode.CodeAction(
            t('codeAction.addCommentPlaceholder'),
            vscode.CodeActionKind.QuickFix
        )
        action.diagnostics = [diagnostic]
        action.isPreferred = true

        const line = document.lineAt(diagnostic.range.start.line).text
        const trimmed = line.trimEnd()
        const hasComma = trimmed.endsWith(',')

        if (hasComma) {
            const commaPos = line.lastIndexOf(',')
            const insertPos = new vscode.Position(diagnostic.range.start.line, commaPos)
            action.edit = new vscode.WorkspaceEdit()
            action.edit.insert(document.uri, insertPos, " COMMENT ''")
        } else {
            const insertPos = new vscode.Position(diagnostic.range.start.line, trimmed.length)
            action.edit = new vscode.WorkspaceEdit()
            action.edit.insert(document.uri, insertPos, " COMMENT ''")
        }

        return action
    }

    private createCommentedOutCodeFixes(
        document: vscode.TextDocument,
        diagnostic: vscode.Diagnostic
    ): vscode.CodeAction[] {
        const actions: vscode.CodeAction[] = []

        const uncommentAction = new vscode.CodeAction(
            t('codeAction.uncomment'),
            vscode.CodeActionKind.QuickFix
        )
        uncommentAction.diagnostics = [diagnostic]
        uncommentAction.command = {
            command: 'hive-formatter.toggleComment',
            title: t('codeAction.uncomment')
        }
        actions.push(uncommentAction)

        const deleteAction = new vscode.CodeAction(
            t('codeAction.deleteCommentedCode'),
            vscode.CodeActionKind.QuickFix
        )
        deleteAction.diagnostics = [diagnostic]
        deleteAction.edit = new vscode.WorkspaceEdit()
        deleteAction.edit.delete(document.uri, diagnostic.range)
        actions.push(deleteAction)

        return actions
    }

    private createExpiredTodoFixes(
        document: vscode.TextDocument,
        diagnostic: vscode.Diagnostic
    ): vscode.CodeAction[] {
        const actions: vscode.CodeAction[] = []
        const line = document.lineAt(diagnostic.range.start.line).text

        const doneAction = new vscode.CodeAction(
            t('codeAction.markAsCompleted'),
            vscode.CodeActionKind.QuickFix
        )
        doneAction.diagnostics = [diagnostic]
        doneAction.isPreferred = true
        const doneText = line.replace(/--\s*(TODO|FIXME)/i, '-- DONE')
        doneAction.edit = new vscode.WorkspaceEdit()
        doneAction.edit.replace(document.uri, diagnostic.range, doneText)
        actions.push(doneAction)

        const today = new Date().toISOString().slice(0, 10)
        const updateDateAction = new vscode.CodeAction(
            t('codeAction.updateDate'),
            vscode.CodeActionKind.QuickFix
        )
        updateDateAction.diagnostics = [diagnostic]
        const updatedText = line.replace(/\d{4}[-/]\d{2}[-/]\d{2}/, today)
        updateDateAction.edit = new vscode.WorkspaceEdit()
        updateDateAction.edit.replace(document.uri, diagnostic.range, updatedText)
        actions.push(updateDateAction)

        const removeAction = new vscode.CodeAction(
            t('codeAction.removeMarker'),
            vscode.CodeActionKind.QuickFix
        )
        removeAction.diagnostics = [diagnostic]
        removeAction.edit = new vscode.WorkspaceEdit()
        removeAction.edit.delete(document.uri, document.lineAt(diagnostic.range.start.line).rangeIncludingLineBreak)
        actions.push(removeAction)

        return actions
    }

    private createNullComparisonFix(
        document: vscode.TextDocument,
        diagnostic: vscode.Diagnostic
    ): vscode.CodeAction {
        const action = new vscode.CodeAction(
            t('codeAction.fixNullComparison'),
            vscode.CodeActionKind.QuickFix
        )
        action.diagnostics = [diagnostic]
        action.isPreferred = true

        const text = document.getText(diagnostic.range)
        let newText = text

        if (text.includes('!= NULL')) {
            newText = text.replace('!= NULL', 'IS NOT NULL')
        } else if (text.includes('!= null')) {
            newText = text.replace('!= null', 'IS NOT NULL')
        } else if (text.includes('<> NULL')) {
            newText = text.replace('<> NULL', 'IS NOT NULL')
        } else if (text.includes('<> null')) {
            newText = text.replace('<> null', 'IS NOT NULL')
        } else if (text.includes('= NULL')) {
            newText = text.replace('= NULL', 'IS NULL')
        } else if (text.includes('= null')) {
            newText = text.replace('= null', 'IS NULL')
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
            t('codeAction.addGroupBy'),
            vscode.CodeActionKind.QuickFix
        )
        action.diagnostics = [diagnostic]

        const text = document.getText()
        const lineStart = document.offsetAt(new vscode.Position(diagnostic.range.start.line, 0))
        const lineEnd = document.offsetAt(new vscode.Position(diagnostic.range.end.line + 1, 0))
        const lineText = text.substring(lineStart, lineEnd)
        const havingMatch = /\bHAVING\b/i.exec(lineText)

        if (havingMatch && havingMatch.index !== undefined) {
            const havingAbsIndex = lineStart + havingMatch.index
            const beforeHaving = text.substring(0, havingAbsIndex)
            const fromMatch = beforeHaving.match(/FROM\s+(\w+)/i)

            if (fromMatch) {
                const tableName = fromMatch[1]
                const insertPos = document.positionAt(havingAbsIndex)

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
            t('codeAction.wrapWithBacktick'),
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
            t('codeAction.addSubqueryAlias'),
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
            t('codeAction.addColumnPlaceholder'),
            vscode.CodeActionKind.QuickFix
        )
        action.diagnostics = [diagnostic]
        action.isPreferred = true

        const text = document.getText(diagnostic.range)
        const insertMatch = text.match(/INSERT\s+INTO\s+(\w+)/i)

        if (insertMatch) {
            const insertPos = diagnostic.range.end

            action.edit = new vscode.WorkspaceEdit()
            action.edit.insert(
                document.uri,
                insertPos,
                ' (col1, col2, col3)'
            )
        }

        return action
    }
}
