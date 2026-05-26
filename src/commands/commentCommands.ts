import * as vscode from 'vscode'
import { StatusBarProvider } from '../providers/StatusBarProvider'
import { t } from '../i18n'

export function toggleComment(): void {
    const editor = vscode.window.activeTextEditor
    if (!editor) return
    const config = vscode.workspace.getConfiguration('SQL-All-in-One')
    if (!config.get<boolean>('enableSmartCommentToggle', true)) {
        vscode.commands.executeCommand('editor.action.commentLine')
        return
    }
    const selections = editor.selections
    const hasMultiLineSelection = selections.some(s => !s.isSingleLine || s.start.line !== s.end.line)
    if (hasMultiLineSelection) {
        toggleBlockComment(editor)
    } else {
        vscode.commands.executeCommand('editor.action.commentLine')
    }
}

export function toggleAdvancedComment(): void {
    const editor = vscode.window.activeTextEditor
    if (!editor) return
    const config = vscode.workspace.getConfiguration('SQL-All-in-One')
    if (!config.get<boolean>('enableSmartCommentToggle', true)) {
        vscode.commands.executeCommand('editor.action.blockComment')
        return
    }
    const selection = editor.selection
    const text = editor.document.getText(selection)
    if (!selection.isEmpty && isCompleteSqlStatement(text)) {
        wrapWithFormatterDisable(editor)
    } else if (selection.isEmpty && isDdlColumnLine(editor)) {
        addColumnComment(editor)
    } else {
        toggleBlockComment(editor)
    }
}

function toggleBlockComment(editor: vscode.TextEditor): void {
    const selection = editor.selection
    if (selection.isEmpty) {
        vscode.commands.executeCommand('editor.action.blockComment')
        return
    }
    const text = editor.document.getText(selection)
    const trimmed = text.trim()
    if (trimmed.startsWith('/*') && trimmed.endsWith('*/')) {
        removeBlockComment(editor, selection, text)
    } else {
        addBlockComment(editor, selection)
    }
}

function addBlockComment(editor: vscode.TextEditor, selection: vscode.Selection): void {
    const edit = new vscode.WorkspaceEdit()
    const startPos = editor.document.offsetAt(selection.start)
    const endPos = editor.document.offsetAt(selection.end)
    const fullText = editor.document.getText()
    const selectedText = fullText.substring(startPos, endPos)
    const newText = `/* ${selectedText.replace(/\n/g, `\n   `)} */`
    edit.replace(editor.document.uri, selection, newText)
    vscode.workspace.applyEdit(edit).then(success => {
        if (success) StatusBarProvider.showTemporaryMessage(t('notification.commentAdded'))
    })
}

function removeBlockComment(editor: vscode.TextEditor, selection: vscode.Selection, text: string): void {
    const edit = new vscode.WorkspaceEdit()
    let cleaned = text.trim()
    if (cleaned.startsWith('/*')) cleaned = cleaned.substring(2)
    if (cleaned.endsWith('*/')) cleaned = cleaned.substring(0, cleaned.length - 2)
    cleaned = cleaned.replace(/^\s{0,3}/gm, '')
    cleaned = cleaned.trim()
    edit.replace(editor.document.uri, selection, cleaned)
    vscode.workspace.applyEdit(edit).then(success => {
        if (success) StatusBarProvider.showTemporaryMessage(t('notification.commentRemoved'))
    })
}

function isCompleteSqlStatement(text: string): boolean {
    const trimmed = text.trim()
    return /^\b(SELECT|INSERT|UPDATE|DELETE|CREATE|WITH)\b/i.test(trimmed)
}

function isDdlColumnLine(editor: vscode.TextEditor): boolean {
    const line = editor.document.lineAt(editor.selection.active.line).text
    return /^\s*\w+\s+\w+.*(?:,|$)/.test(line) && isInsideCreateTable(editor)
}

function isInsideCreateTable(editor: vscode.TextEditor): boolean {
    const currentLine = editor.selection.active.line
    let depth = 0
    for (let i = currentLine; i >= 0; i--) {
        const lineText = editor.document.lineAt(i).text
        const upperLine = lineText.toUpperCase()

        for (let j = lineText.length - 1; j >= 0; j--) {
            if (lineText[j] === ')') depth++
            else if (lineText[j] === '(') depth--
        }

        if (upperLine.includes('CREATE') && upperLine.includes('TABLE')) {
            return depth <= 0
        }
        if (depth < 0) return false
    }
    return false
}

function addColumnComment(editor: vscode.TextEditor): void {
    const line = editor.document.lineAt(editor.selection.active.line)
    const lineText = line.text
    if (/COMMENT\s+'/.test(lineText)) {
        const commentMatch = lineText.match(/COMMENT\s+'([^']*)'/)
        if (commentMatch && commentMatch.index !== undefined) {
            const quoteStart = lineText.indexOf("'", commentMatch.index)
            const quoteEnd = lineText.indexOf("'", quoteStart + 1)
            if (quoteStart !== -1 && quoteEnd !== -1) {
                editor.selection = new vscode.Selection(
                    line.range.start.translate(0, quoteStart + 1),
                    line.range.start.translate(0, quoteEnd)
                )
            }
        }
        return
    }
    const edit = new vscode.WorkspaceEdit()
    const hasComma = lineText.trimEnd().endsWith(',')
    const insertPos = hasComma
        ? line.range.end.translate(0, -1)
        : line.range.end
    edit.insert(editor.document.uri, insertPos, " COMMENT ''")
    vscode.workspace.applyEdit(edit).then(success => {
        if (success) {
            const newLine = editor.document.lineAt(editor.selection.active.line).text
            const quoteStart = newLine.indexOf("COMMENT '") + 9
            const quoteEnd = newLine.indexOf("'", quoteStart)
            if (quoteStart > 8 && quoteEnd !== -1) {
                editor.selection = new vscode.Selection(
                    editor.selection.active.line,
                    quoteStart,
                    editor.selection.active.line,
                    quoteEnd
                )
            }
            StatusBarProvider.showTemporaryMessage(t('notification.ddlCommentAdded'))
        }
    })
}

function wrapWithFormatterDisable(editor: vscode.TextEditor): void {
    const selection = editor.selection
    const edit = new vscode.WorkspaceEdit()
    const linePrefix = editor.document.lineAt(selection.start.line).text.match(/^(\s*)/)?.[1] || ''
    edit.insert(editor.document.uri, selection.start, `/* sql-formatter-disable */\n${linePrefix}`)
    edit.insert(editor.document.uri, selection.end, `\n${linePrefix}/* sql-formatter-enable */`)
    vscode.workspace.applyEdit(edit).then(success => {
        if (success) StatusBarProvider.showTemporaryMessage(t('notification.formatDisabledMarkAdded'))
    })
}
