import * as vscode from "vscode"
import { createConfig } from "../core/config"
import { sqlDialects } from "../core/sqlDialects"
import { formatEditorText } from "../utils/formatEditorText"
import type { FormatOptionsWithLanguage, SqlLanguage } from "../formatter/sqlFormatter"
import { t } from "../i18n"

export function formatSelectionCommand(): void {
    const editor = vscode.window.activeTextEditor
    if (!editor) {
        return
    }

    try {
        replaceEachSelection(editor, (text) =>
            formatEditorText(text, createConfigForEditor(editor)),
        )
    } catch (e) {
        vscode.window.showErrorMessage(t('notification.formatError', String(e)))
    }
}

function replaceEachSelection(
    editor: vscode.TextEditor,
    fn: (code: string) => string,
): void {
    editor.edit((editBuilder) => {
        editor.selections.forEach((sel) =>
            editBuilder.replace(sel, fn(editor.document.getText(sel))),
        )
    })
}

const createConfigForEditor = (editor: vscode.TextEditor): FormatOptionsWithLanguage =>
    createConfig(
        vscode.workspace.getConfiguration("SQL-All-in-One"),
        editorFormattingOptions(editor),
        detectSqlDialect(editor),
    )

const detectSqlDialect = (editor: vscode.TextEditor): SqlLanguage =>
    sqlDialects[editor.document.languageId] ?? "sql"

const editorFormattingOptions = (editor: vscode.TextEditor): vscode.FormattingOptions => ({
    tabSize: typeof editor.options.tabSize === 'number' ? editor.options.tabSize : 2,
    insertSpaces: editor.options.insertSpaces === true,
})
