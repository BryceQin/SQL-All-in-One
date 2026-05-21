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
        vscode.workspace.getConfiguration("Hive-Formatter"),
        editorFormattingOptions(editor),
        detectSqlDialect(editor),
    )

const detectSqlDialect = (editor: vscode.TextEditor) =>
    sqlDialects[editor.document.languageId] ?? "sql"

const editorFormattingOptions = (editor: vscode.TextEditor) => ({
    tabSize: editor.options.tabSize as number,
    insertSpaces: editor.options.insertSpaces as boolean,
})
