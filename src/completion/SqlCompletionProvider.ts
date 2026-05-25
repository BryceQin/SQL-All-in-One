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
import { handleError, ErrorCategory } from '../core/errorHandler'
import { getConfigManager } from '../core/configManager'

interface SnippetDef { prefix: string; body: string[]; description: string }

const keywordMap: Record<string, { keywords: string[]; dataTypes: string[] }> = {
    hive: { keywords: allDialects.hiveKeywords, dataTypes: allDialects.hiveDataTypes },
    mysql: { keywords: allDialects.mysqlKeywords, dataTypes: allDialects.mysqlDataTypes },
    spark: { keywords: allDialects.sparkKeywords, dataTypes: allDialects.sparkDataTypes },
    flinksql: { keywords: allDialects.flinksqlKeywords, dataTypes: allDialects.flinksqlDataTypes },
    sql:   { keywords: allDialects.sqlKeywords,   dataTypes: allDialects.sqlDataTypes },
    postgresql: { keywords: allDialects.pgKeywords, dataTypes: allDialects.pgDataTypes },
    bigquery: { keywords: allDialects.bqKeywords, dataTypes: allDialects.bqDataTypes },
    sqlite: { keywords: allDialects.sqliteKeywords, dataTypes: allDialects.sqliteDataTypes },
}

const functionSigMap: Record<string, FunctionSignature[]> = {
    hive:  allDialects.hiveFunctionSignatures,
    mysql: allDialects.mysqlFunctionSignatures,
    spark: allDialects.sparkFunctionSignatures,
    flinksql: allDialects.flinksqlFunctionSignatures,
    sql:   allDialects.sqlFunctionSignatures,
    postgresql: allDialects.pgFunctionSignatures,
    bigquery: allDialects.bqFunctionSignatures,
    sqlite: allDialects.sqliteFunctionSignatures,
}

export class SqlCompletionProvider implements vscode.CompletionItemProvider {
    private dialectCache = new Map<string, Dialect>()
    private snippetItemsMap = new Map<string, vscode.CompletionItem[]>()
    private snippetsLoaded: Promise<void>
    private keywordItemsCache = new Map<string, vscode.CompletionItem[]>()
    private functionItemsCache = new Map<string, vscode.CompletionItem[]>()
    private configChangeDisposable: vscode.Disposable

    constructor(extensionPath: string) {
        this.snippetsLoaded = this.loadSnippets(extensionPath)
        this.configChangeDisposable = getConfigManager().onConfigChange(() => {
            this.keywordItemsCache.clear()
            this.functionItemsCache.clear()
        })
    }

    private async loadSnippets(extensionPath: string): Promise<void> {
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
                    const cc = await fs.promises.readFile(cp, 'utf-8')
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
                    const dc = await fs.promises.readFile(dp, 'utf-8')
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
        this.configChangeDisposable.dispose()
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

    private tryCollect(items: vscode.CompletionItem[], fn: () => vscode.CompletionItem[], context: string): void {
        try {
            items.push(...fn())
        } catch (e) { handleError(e, context, ErrorCategory.SUB_ITEM) }
    }

    provideCompletionItems(
        doc: vscode.TextDocument,
        pos: vscode.Position,
    ): vscode.ProviderResult<vscode.CompletionItem[]> {
        try {
            const cfgMgr = getConfigManager()
            if (!cfgMgr.get('enableCompletion', true)) return []
            const cfg = cfgMgr.getSectionKeys('completion', ['keywords', 'functions', 'snippets', 'cteNames', 'identifiers', 'commentSnippets'], {
                keywords: true,
                functions: true,
                snippets: true,
                cteNames: true,
                identifiers: true,
                commentSnippets: true,
            })
            const { dName } = this.getDialect(doc.languageId)
            const items: vscode.CompletionItem[] = []

            this.tryCollect(items, () => {
                if (!cfg.keywords) return []
                let kwItems = this.keywordItemsCache.get(dName)
                if (!kwItems) {
                    const kd = keywordMap[dName]
                    if (kd) {
                        kwItems = getKeywordItems(kd.keywords, kd.dataTypes, dName)
                        this.keywordItemsCache.set(dName, kwItems)
                    }
                }
                return kwItems || []
            }, 'keyword completion')
            this.tryCollect(items, () => {
                if (!cfg.functions) return []
                let fnItems = this.functionItemsCache.get(dName)
                if (!fnItems) {
                    const sigs = functionSigMap[dName]
                    if (sigs) {
                        fnItems = getFunctionItems(sigs)
                        this.functionItemsCache.set(dName, fnItems)
                    }
                }
                return fnItems || []
            }, 'function completion')
            this.tryCollect(items, () => {
                if (!cfg.snippets) return []
                const snippets = this.snippetItemsMap.get(dName)
                return snippets || []
            }, 'snippet completion')
            this.tryCollect(items, () => {
                if (!cfg.cteNames || !doc.getText().trim()) return []
                return getCTEItems(doc, pos)
            }, 'CTE completion')
            this.tryCollect(items, () => {
                if (!cfg.identifiers || !doc.getText().trim()) return []
                return getIdentifierItems(doc, pos, this.getDialect(doc.languageId).dialect.tokenizer)
            }, 'identifier completion')
            this.tryCollect(items, () => {
                if (!cfg.commentSnippets) return []
                return getCommentCompletionItems(doc, pos)
            }, 'comment snippet completion')

            return items
        } catch (e) {
            handleError(e, 'completion provider', ErrorCategory.FEATURE)
            return []
        }
    }
}