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
        token: vscode.CancellationToken,
    ): vscode.TextEdit[] {
        return getPerformanceMonitor().measure('SqlFormattingProvider.provideDocumentFormattingEdits', () => {
            try {
                if (token.isCancellationRequested) return [];
                const formatted = this.formatText(
                    document.getText(),
                    formattingOptions,
                    document.uri,
                );
                if (token.isCancellationRequested) return [];
                return [
                    vscode.TextEdit.replace(
                        this.fullDocumentRange(document),
                        formatted,
                    ),
                ];
            } catch (e) {
                handleError(e, 'format document', ErrorCategory.CRITICAL);
                return [];
            }
        });
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
