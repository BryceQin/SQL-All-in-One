import * as vscode from "vscode"
import { SqlLanguage } from "../formatter/sqlFormatter"
import { createConfig } from "../core/config"
import { formatEditorText } from "../utils/formatEditorText"
import { handleError, ErrorCategory } from "../core/errorHandler"
import { getPerformanceMonitor } from '../core/performanceMonitor'

export class SqlFormattingProvider
    implements vscode.DocumentFormattingEditProvider
{
    constructor(private language: SqlLanguage) {}

    provideDocumentFormattingEdits(
        document: vscode.TextDocument,
        formattingOptions: vscode.FormattingOptions,
    ): vscode.TextEdit[] {
        return getPerformanceMonitor().measure('SqlFormattingProvider.provideDocumentFormattingEdits', () => {
            try {
                return [
                    vscode.TextEdit.replace(
                        this.fullDocumentRange(document),
                        this.formatText(
                            this.getAllText(document),
                            formattingOptions,
                            document.uri,
                        ),
                    ),
                ]
            } catch (e) {
                handleError(e, 'format document', ErrorCategory.CRITICAL)
                return []
            }
        })
    }

    private getAllText(document: vscode.TextDocument): string {
        return document.getText()
    }

    private fullDocumentRange(document: vscode.TextDocument): vscode.Range {
        return new vscode.Range(
            document.positionAt(0),
            document.lineAt(document.lineCount - 1).range.end,
        )
    }

    private formatText(
        text: string,
        formattingOptions: vscode.FormattingOptions,
        uri: vscode.Uri,
    ): string {
        const extensionSettings = vscode.workspace.getConfiguration(
            "SQL-All-in-One",
            uri,
        )
        const formatConfig = createConfig(
            extensionSettings,
            formattingOptions,
            this.language,
        )
        return formatEditorText(text, formatConfig)
    }
}
