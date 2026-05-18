import * as vscode from 'vscode'
import { SqlConverter } from '../converter/sqlConverter'

export async function convertMysqlToHiveCommand() {
    const editor = vscode.window.activeTextEditor
    if (!editor) {
        vscode.window.showWarningMessage('No active editor found')
        return
    }

    const document = editor.document
    const selection = editor.selection
    const text = selection.isEmpty ? document.getText() : document.getText(selection)

    const converter = new SqlConverter()
    const convertedText = converter.mysqlToHive(text)

    await replaceEditorText(editor, document, selection, convertedText)
    vscode.window.showInformationMessage('Successfully converted MySQL to HiveSQL')
}

export async function convertHiveToMysqlCommand() {
    const editor = vscode.window.activeTextEditor
    if (!editor) {
        vscode.window.showWarningMessage('No active editor found')
        return
    }

    const document = editor.document
    const selection = editor.selection
    const text = selection.isEmpty ? document.getText() : document.getText(selection)

    const converter = new SqlConverter()
    const convertedText = converter.hiveToMysql(text)

    await replaceEditorText(editor, document, selection, convertedText)
    vscode.window.showInformationMessage('Successfully converted HiveSQL to MySQL')
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
