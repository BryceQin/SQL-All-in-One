import * as vscode from "vscode";

export interface MonacoCompletionItem {
    label: string;
    kind: number;
    insertText: string;
    insertTextRules?: number;
    documentation?: string;
    sortText: string;
    filterText?: string;
    detail?: string;
}

export interface MonacoDiagnostic {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
    message: string;
    severity: number;
    source?: string;
}

const COMPLETION_ITEM_KIND_MAP: Record<number, number> = {
    [vscode.CompletionItemKind.Method]: 0,
    [vscode.CompletionItemKind.Function]: 1,
    [vscode.CompletionItemKind.Constructor]: 2,
    [vscode.CompletionItemKind.Field]: 3,
    [vscode.CompletionItemKind.Variable]: 4,
    [vscode.CompletionItemKind.Class]: 5,
    [vscode.CompletionItemKind.Struct]: 6,
    [vscode.CompletionItemKind.Interface]: 7,
    [vscode.CompletionItemKind.Module]: 8,
    [vscode.CompletionItemKind.Property]: 9,
    [vscode.CompletionItemKind.Event]: 10,
    [vscode.CompletionItemKind.Operator]: 11,
    [vscode.CompletionItemKind.Unit]: 12,
    [vscode.CompletionItemKind.Value]: 13,
    [vscode.CompletionItemKind.Keyword]: 14,
    [vscode.CompletionItemKind.Text]: 18,
    [vscode.CompletionItemKind.Color]: 19,
    [vscode.CompletionItemKind.File]: 20,
    [vscode.CompletionItemKind.Reference]: 21,
    [vscode.CompletionItemKind.Folder]: 23,
    [vscode.CompletionItemKind.EnumMember]: 16,
    [vscode.CompletionItemKind.Constant]: 14,
    [vscode.CompletionItemKind.TypeParameter]: 17,
    [vscode.CompletionItemKind.Snippet]: 27,
};

const SEVERITY_MAP: Record<number, number> = {
    [vscode.DiagnosticSeverity.Error]: 8,
    [vscode.DiagnosticSeverity.Warning]: 4,
    [vscode.DiagnosticSeverity.Information]: 2,
    [vscode.DiagnosticSeverity.Hint]: 1,
};

export class MonacoDataAdapter {
    static mapCompletionItemKind(kind: vscode.CompletionItemKind): number {
        return COMPLETION_ITEM_KIND_MAP[kind] ?? 14;
    }

    static toMonacoCompletionItems(items: vscode.CompletionItem[]): MonacoCompletionItem[] {
        return items.map((item) => {
            const labelStr = typeof item.label === "string" ? item.label : item.label.label;
            const result: MonacoCompletionItem = {
                label: labelStr,
                kind: MonacoDataAdapter.mapCompletionItemKind(item.kind ?? vscode.CompletionItemKind.Text),
                insertText:
                    item.insertText instanceof vscode.SnippetString
                        ? item.insertText.value
                        : ((item.insertText as string | undefined) ?? labelStr),
                sortText: item.sortText ?? "",
            };
            if (item.insertText instanceof vscode.SnippetString) {
                result.insertTextRules = 4;
            }
            if (item.documentation) {
                result.documentation =
                    typeof item.documentation === "string" ? item.documentation : (item.documentation as vscode.MarkdownString).value;
            }
            if (item.detail) {
                result.detail = item.detail;
            }
            if (item.filterText) {
                result.filterText = item.filterText;
            }
            return result;
        });
    }

    static toMonacoDiagnostics(diagnostics: vscode.Diagnostic[]): MonacoDiagnostic[] {
        return diagnostics.map((d) => ({
            startLineNumber: d.range.start.line + 1,
            startColumn: d.range.start.character + 1,
            endLineNumber: d.range.end.line + 1,
            endColumn: d.range.end.character + 1,
            message: d.message,
            severity: SEVERITY_MAP[d.severity] ?? 2,
            source: d.source,
        }));
    }

    static toMonacoHoverContents(hover: vscode.Hover): string[] {
        return hover.contents.map((content) => {
            if (typeof content === "string") return content;
            return (content as vscode.MarkdownString).value;
        });
    }
}
