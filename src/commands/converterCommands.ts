import * as vscode from "vscode";
import { getDialectConverter } from "../converter/DialectConverter";
import type { SqlDialect } from "../parser/dialectMapper";
import { t, tAny } from "../i18n";

export async function convertMysqlToHiveCommand(): Promise<void> {
    await runConversion("mysql", "hive");
}

export async function convertHiveToMysqlCommand(): Promise<void> {
    await runConversion("hive", "mysql");
}

async function runConversion(from: SqlDialect, to: SqlDialect): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage(t("notification.noActiveEditor"));
        return;
    }

    const document = editor.document;
    const selection = editor.selection;
    const text = selection.isEmpty ? document.getText() : document.getText(selection);

    if (!text.trim()) {
        return;
    }

    const converter = getDialectConverter();
    const result = converter.convert(text, from, to, { allowRegexFallback: false });

    let convertedText: string;

    if (result.success && result.result !== null) {
        convertedText = result.result;
        await replaceEditorText(editor, document, selection, convertedText);
        notifyResult(result, from, to, text);
        return;
    }

    const choice = await vscode.window.showWarningMessage(
        tAny("notification.convertAstFailed"),
        tAny("notification.convertFallbackRegex"),
        tAny("notification.convertShowError"),
        tAny("notification.convertCancel"),
    );

    if (choice === tAny("notification.convertFallbackRegex")) {
        const fallbackResult = converter.convert(text, from, to, { allowRegexFallback: true });
        if (fallbackResult.success && fallbackResult.result !== null) {
            convertedText = fallbackResult.result;
            await replaceEditorText(editor, document, selection, convertedText);
            vscode.window.showInformationMessage(tAny("notification.convertFallbackSuccess"));
        } else if (fallbackResult.error) {
            vscode.window.showErrorMessage(t("notification.formatError", String(fallbackResult.error)));
        }
    } else if (choice === tAny("notification.convertShowError")) {
        const errorDetail = result.error ? String(result.error) : "Unknown error";
        vscode.window.showErrorMessage(t("notification.formatError", errorDetail));
    }
}

function notifyResult(result: { usedFallback: boolean; warnings: string[] }, from: SqlDialect, to: SqlDialect, _text: string): void {
    if (result.warnings.length > 0) {
        const warningMsg = tAny("notification.convertWarnings", String(result.warnings.length));
        const detail = result.warnings.join("\n");
        vscode.window.showWarningMessage(`${warningMsg}\n${detail}`);
        return;
    }

    if (from === "mysql" && to === "hive") {
        vscode.window.showInformationMessage(t("notification.convertMysqlSuccess"));
    } else if (from === "hive" && to === "mysql") {
        vscode.window.showInformationMessage(t("notification.convertHiveSuccess"));
    }
}

async function replaceEditorText(
    editor: vscode.TextEditor,
    document: vscode.TextDocument,
    selection: vscode.Selection,
    newText: string,
): Promise<void> {
    if (selection.isEmpty) {
        const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
        await editor.edit((editBuilder) => {
            editBuilder.replace(fullRange, newText);
        });
    } else {
        await editor.edit((editBuilder) => {
            editBuilder.replace(selection, newText);
        });
    }
}
