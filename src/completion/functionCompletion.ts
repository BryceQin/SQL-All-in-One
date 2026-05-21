import * as vscode from 'vscode'
import type { FunctionSignature } from './functionSignatures'
import { signatureToString, getCategoryLabel } from './functionSignatures'
import { t } from '../i18n'

export function getFunctionItems(functions: FunctionSignature[]): vscode.CompletionItem[] {
    return functions.map((fn) => {
        const item = new vscode.CompletionItem(fn.name, vscode.CompletionItemKind.Function)
        item.insertText = new vscode.SnippetString(
            `${fn.name}(${fn.params.map((_, i) => `$\{${i + 1}:${fn.params[i]}}`).join(', ')})`
        )
        item.detail = `${getCategoryLabel(fn.category)} | ${signatureToString(fn)}`
        const md = new vscode.MarkdownString()
        md.appendMarkdown(`### ${fn.name}\n\n${fn.description}\n\n`)
        md.appendCodeblock(signatureToString(fn), 'sql')
        if (fn.returnType) {
            md.appendMarkdown(`\n\n${t('completion.returnType', `\`${fn.returnType}\``)}`)
        }
        item.documentation = md
        item.sortText = `2_${fn.name}`
        return item
    })
}