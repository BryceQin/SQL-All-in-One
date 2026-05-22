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
    postgresql: { keywords: allDialects.pgKeywords, dataTypes: allDialects.pgDataTypes },
    bigquery: { keywords: allDialects.bqKeywords, dataTypes: allDialects.bqDataTypes },
    snowflake: { keywords: allDialects.sfKeywords, dataTypes: allDialects.sfDataTypes },
    sqlite: { keywords: allDialects.sqliteKeywords, dataTypes: allDialects.sqliteDataTypes },
}

const functionSigMap: Record<string, FunctionSignature[]> = {
    hive:  allDialects.hiveFunctionSignatures,
    mysql: allDialects.mysqlFunctionSignatures,
    spark: allDialects.sparkFunctionSignatures,
    sql:   allDialects.sqlFunctionSignatures,
    postgresql: allDialects.pgFunctionSignatures,
    bigquery: allDialects.bqFunctionSignatures,
    snowflake: allDialects.sfFunctionSignatures,
    sqlite: allDialects.sqliteFunctionSignatures,
}

export class SqlCompletionProvider implements vscode.CompletionItemProvider {
    private dialectCache = new Map<string, Dialect>()
    private snippetItemsMap = new Map<string, vscode.CompletionItem[]>()
    private cfg: Record<string, boolean> = {}
    private configChangeListener: vscode.Disposable

    constructor(extensionPath: string) {
        this.loadSnippets(extensionPath)
        this.loadConfig()
        this.configChangeListener = vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('Hive-Formatter')) this.loadConfig()
        })
    }

    private loadSnippets(extensionPath: string): void {
        const dialectNames = new Set<string>()
        for (const dName of Object.values(sqlDialects)) {
            dialectNames.add(dName)
        }
        for (const dName of dialectNames) {
            try {
                const merged: Record<string, SnippetDef> = {}
                const usedPrefixes = new Set<string>()
                try {
                    const cp = path.join(extensionPath, 'snippets', 'common.json')
                    const cc = fs.readFileSync(cp, 'utf-8')
                    const commonSnippets = JSON.parse(cc) as Record<string, SnippetDef>
                    for (const [key, val] of Object.entries(commonSnippets)) {
                        if (!usedPrefixes.has(val.prefix)) {
                            merged[key] = val
                            usedPrefixes.add(val.prefix)
                        }
                    }
                } catch { /* common snippets not found */ }
                try {
                    const dp = path.join(extensionPath, 'snippets', `${dName}.json`)
                    const dc = fs.readFileSync(dp, 'utf-8')
                    const dialectSnippets = JSON.parse(dc) as Record<string, SnippetDef>
                    for (const [key, val] of Object.entries(dialectSnippets)) {
                        if (!usedPrefixes.has(val.prefix)) {
                            merged[key] = val
                            usedPrefixes.add(val.prefix)
                        }
                    }
                } catch { /* dialect snippets not found */ }
                this.snippetItemsMap.set(dName, getSnippetItems(merged))
            } catch {
                this.snippetItemsMap.set(dName, [])
            }
        }
    }

    public dispose(): void {
        this.configChangeListener.dispose()
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
        if (this.cfg.snippets) {
            const snippets = this.snippetItemsMap.get(dName)
            if (snippets) items.push(...snippets)
        }
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