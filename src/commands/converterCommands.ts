import * as vscode from 'vscode'
import { SqlConverter } from '../converter/sqlConverter'
import { getAstConverter } from '../converter/AstConverter'
import type { SqlDialect } from '../parser/dialectMapper'
import { t } from '../i18n'

export async function convertMysqlToHiveCommand() {
    const editor = vscode.window.activeTextEditor
    if (!editor) {
        vscode.window.showWarningMessage(t('notification.noActiveEditor'))
        return
    }

    const document = editor.document
    const selection = editor.selection
    const text = selection.isEmpty ? document.getText() : document.getText(selection)

    try {
        const astConverter = getAstConverter()
        const result = astConverter.tryConvertCreateTable(text, 'mysql' as SqlDialect, 'hive' as SqlDialect)

        let convertedText: string
        if (result.success && result.result) {
            convertedText = result.result
        } else {
            const converter = new SqlConverter()
            convertedText = converter.mysqlToHive(text)
        }

        await replaceEditorText(editor, document, selection, convertedText)
        vscode.window.showInformationMessage(t('notification.convertMysqlSuccess'))
    } catch (e) {
        vscode.window.showErrorMessage(t('notification.formatError', String(e)))
    }
}

export async function convertHiveToMysqlCommand() {
    const editor = vscode.window.activeTextEditor
    if (!editor) {
        vscode.window.showWarningMessage(t('notification.noActiveEditor'))
        return
    }

    const document = editor.document
    const selection = editor.selection
    const text = selection.isEmpty ? document.getText() : document.getText(selection)

    try {
        const astConverter = getAstConverter()
        const result = astConverter.tryConvertCreateTable(text, 'hive' as SqlDialect, 'mysql' as SqlDialect)

        let convertedText: string
        if (result.success && result.result) {
            convertedText = result.result
        } else {
            const converter = new SqlConverter()
            convertedText = converter.hiveToMysql(text)
        }

        await replaceEditorText(editor, document, selection, convertedText)
        vscode.window.showInformationMessage(t('notification.convertHiveSuccess'))
    } catch (e) {
        vscode.window.showErrorMessage(t('notification.formatError', String(e)))
    }
}

async function replaceEditorText(
    editor: vscode.TextEditor,
    document: vscode.TextDocument,
    selection: vscode.Selection,
    newText: string
) {
    if (selection.isEmpty) {
        const fullRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(document.getText().length)
        )
        await editor.edit((editBuilder) => {
            editBuilder.replace(fullRange, newText)
        })
    } else {
        await editor.edit((editBuilder) => {
            editBuilder.replace(selection, newText)
        })
    }
}
