import * as vscode from "vscode"
import { createConfig } from "./config"
import { sqlDialects } from "./sqlDialects"
import { formatEditorText } from "./formatEditorText"

/**
 * 格式化编辑器中选中的文本
 */
export function formatSelection() {
    const editor = vscode.window.activeTextEditor
    if (!editor) {
        return
    }

    try {
        replaceEachSelection(editor, (text) =>
            formatEditorText(text, createConfigForEditor(editor)),
        )
    } catch (e) {
        vscode.window.showErrorMessage("Unable to format SQL:\n" + e)
    }
}

/**
 * 替换编辑器中的每个选中内容
 */
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

/**
 * 为当前编辑器创建格式化配置
 */
const createConfigForEditor = (editor: vscode.TextEditor) =>
    createConfig(
        vscode.workspace.getConfiguration("Hive-Formatter"),
        editorFormattingOptions(editor),
        detectSqlDialect(editor),
    )

/**
 * 从编辑器语言检测SQL方言
 */
const detectSqlDialect = (editor: vscode.TextEditor) =>
    sqlDialects[editor.document.languageId] ?? "sql"

/**
 * 获取编辑器的格式化选项
 */
const editorFormattingOptions = (editor: vscode.TextEditor) => ({
    tabSize: editor.options.tabSize as number,
    insertSpaces: editor.options.insertSpaces as boolean,
})
