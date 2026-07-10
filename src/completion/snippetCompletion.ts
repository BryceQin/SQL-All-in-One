import * as vscode from "vscode";

interface SnippetDefinition {
    prefix: string;
    body: string[];
    description: string;
}

export function getSnippetItems(snippets: Record<string, SnippetDefinition>): vscode.CompletionItem[] {
    return Object.values(snippets).map((s) => {
        const item = new vscode.CompletionItem(s.prefix, vscode.CompletionItemKind.Snippet);
        item.insertText = new vscode.SnippetString(s.body.join("\n"));
        item.detail = s.description;
        item.documentation = new vscode.MarkdownString(`\`${s.prefix}\` — ${s.description}`);
        item.sortText = `0_${s.prefix}`;
        return item;
    });
}
