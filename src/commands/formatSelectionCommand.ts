import * as vscode from "vscode"
import { createConfig } from "../core/config"
import { sqlDialects } from "../core/sqlDialects"
import { formatEditorText } from "../utils/formatEditorText"
import { t } from "../i18n"

export function formatSelectionCommand() {
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
) {
    editor.edit((editBuilder) => {
        editor.selections.forEach((sel) =>
            editBuilder.replace(sel, fn(editor.document.getText(sel))),
        )
    })
}

const createConfigForEditor = (editor: vscode.TextEditor) =>
    createConfig(
        vscode.workspace.getConfiguration("SQL-All-in-One"),
        editorFormattingOptions(editor),
        detectSqlDialect(editor),
    )

const detectSqlDialect = (editor: vscode.TextEditor) =>
    sqlDialects[editor.document.languageId] ?? "sql"

const editorFormattingOptions = (editor: vscode.TextEditor) => ({
    tabSize: typeof editor.options.tabSize === 'number' ? editor.options.tabSize : 2,
    insertSpaces: editor.options.insertSpaces === true,
})
