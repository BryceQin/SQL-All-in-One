import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { sqlDialects } from '../core/sqlDialects'
import { createDialect, type Dialect } from '../languages/dialect'
import * as allDialects from '../languages/allDialects'
import { getKeywordItems } from './keywordCompletion'
import { getFunctionItems } from './functionCompletion'
import type { FunctionSignature } from './functionSignatures'
import { getSnippetItems } from './snippetCompletion'
import { getCTEItems } from './cteCompletion'
import { getIdentifierItems } from './identifierCompletion'
import { getCommentCompletionItems } from './commentCompletion'

interface SnippetDef { prefix: string; body: string[]; description: string }

const keywordMap: Record<string, { keywords: string[]; dataTypes: string[] }> = {
    hive: { keywords: allDialects.hiveKeywords, dataTypes: allDialects.hiveDataTypes },
    mysql: { keywords: allDialects.mysqlKeywords, dataTypes: allDialects.mysqlDataTypes },
    spark: { keywords: allDialects.sparkKeywords, dataTypes: allDialects.sparkDataTypes },
    sql:   { keywords: allDialects.sqlKeywords,   dataTypes: allDialects.sqlDataTypes },
}

const functionSigMap: Record<string, FunctionSignature[]> = {
    hive:  allDialects.hiveFunctionSignatures,
    mysql: allDialects.mysqlFunctionSignatures,
    spark: allDialects.sparkFunctionSignatures,
    sql:   allDialects.sqlFunctionSignatures,
}

export class SqlCompletionProvider implements vscode.CompletionItemProvider {
    private dialectCache = new Map<string, Dialect>()
    private snippetItems: vscode.CompletionItem[] = []
    private cfg: Record<string, boolean> = {}

    constructor(extensionPath: string) {
        try {
            const p = path.join(extensionPath, 'snippets', 'sql.json')
            const c = fs.readFileSync(p, 'utf-8')
            this.snippetItems = getSnippetItems(JSON.parse(c) as Record<string, SnippetDef>)
        } catch { this.snippetItems = [] }
        this.loadConfig()
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('Hive-Formatter')) this.loadConfig()
        })
    }

    private loadConfig(): void {
        const c = vscode.workspace.getConfiguration('Hive-Formatter')
        this.cfg = {
            enableCompletion: c.get('enableCompletion', true),
            keywords: c.get('completion.keywords', true),
            functions: c.get('completion.functions', true),
            snippets: c.get('completion.snippets', true),
            cteNames: c.get('completion.cteNames', true),
            identifiers: c.get('completion.identifiers', true),
            commentSnippets: c.get('completion.commentSnippets', true),
        }
    }

    private getDialect(langId: string): { dialect: Dialect; dName: string } {
        const cached = this.dialectCache.get(langId)
        const dName = sqlDialects[langId as keyof typeof sqlDialects] || 'hive'
        if (cached) return { dialect: cached, dName }
        const dc = allDialects[dName as keyof typeof allDialects]
        const dialect = createDialect(dc as any)
        this.dialectCache.set(langId, dialect)
        return { dialect, dName }
    }

    provideCompletionItems(
        doc: vscode.TextDocument,
        pos: vscode.Position,
    ): vscode.ProviderResult<vscode.CompletionItem[]> {
        if (!this.cfg.enableCompletion) return []
        const { dialect, dName } = this.getDialect(doc.languageId)
        const items: vscode.CompletionItem[] = []

        if (this.cfg.keywords) {
            const kd = keywordMap[dName]
            if (kd) items.push(...getKeywordItems(kd.keywords, kd.dataTypes, dName))
        }
        if (this.cfg.functions) {
            const sigs = functionSigMap[dName]
            if (sigs) items.push(...getFunctionItems(sigs))
        }
        if (this.cfg.snippets) items.push(...this.snippetItems)
        if (this.cfg.cteNames && doc.getText().trim()) items.push(...getCTEItems(doc, pos))
        if (this.cfg.identifiers && doc.getText().trim()) items.push(...getIdentifierItems(doc, pos, dialect.tokenizer))
        if (this.cfg.commentSnippets) {
            try {
                items.push(...getCommentCompletionItems(doc, pos))
            } catch {
                // dynamic comment completion failed
            }
        }

        return items
    }
}