import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { sqlDialects, toSqlDialect } from '../core/sqlDialects'
import { createDialect, type Dialect, type DialectOptions } from '../languages/dialect'
import { keywordMap, functionSigMap } from '../languages/dialectData'
import * as allDialects from '../languages/allDialects'
import { getKeywordItems } from './keywordCompletion'
import { getFunctionItems } from './functionCompletion'
import { getSnippetItems } from './snippetCompletion'
import { getCTEItemsFromAst } from './cteCompletion'
import { getIdentifierItems } from './identifierCompletion'
import { getCommentCompletionItems } from './commentCompletion'
import { handleError, ErrorCategory } from '../core/errorHandler'
import { getConfigManager } from '../core/configManager'
import { getPerformanceMonitor } from '../core/performanceMonitor'
import { SchemaCompletionProvider } from './SchemaCompletionProvider'
import { getConnectionManager } from '../database/connection/ConnectionManager'
import { getDocumentAstCache } from '../parser/DocumentAstCache'
import type { SqlDialect } from '../parser/dialectMapper'

interface SnippetDef { prefix: string; body: string[]; description: string }

export class SqlCompletionProvider implements vscode.CompletionItemProvider {
    private extensionPath: string
    private dialectCache = new Map<string, Dialect>()
    private snippetItemsMap = new Map<string, vscode.CompletionItem[]>()
    private keywordItemsCache = new Map<string, vscode.CompletionItem[]>()
    private functionItemsCache = new Map<string, vscode.CompletionItem[]>()
    private schemaCompletionProvider: SchemaCompletionProvider
    private configChangeDisposable: vscode.Disposable
    private snippetsLoaded = false
    private snippetsLoading: Promise<void> | null = null

    constructor(extensionPath: string) {
        this.extensionPath = extensionPath
        this.schemaCompletionProvider = new SchemaCompletionProvider()
        this.configChangeDisposable = getConfigManager().onConfigChange(() => {
            this.keywordItemsCache.clear()
            this.functionItemsCache.clear()
        })
    }

    private async ensureSnippetsLoaded(): Promise<void> {
        if (this.snippetsLoaded) return
        if (!this.snippetsLoading) {
            this.snippetsLoading = this.loadSnippets(this.extensionPath).then(() => {
                this.snippetsLoaded = true
            })
        }
        await this.snippetsLoading
    }

    private async loadSnippets(extensionPath: string): Promise<void> {
        const dialectNames = new Set<string>()
        for (const dName of Object.values(sqlDialects)) {
            dialectNames.add(dName)
        }
        let commonSnippets: Record<string, SnippetDef> | undefined
        try {
            const cp = path.join(extensionPath, 'snippets', 'common.json')
            const cc = await fs.promises.readFile(cp, 'utf-8')
            commonSnippets = JSON.parse(cc) as Record<string, SnippetDef>
        } catch { /* common snippets not found */ }
        for (const dName of dialectNames) {
            try {
                const merged: Record<string, SnippetDef> = {}
                const usedPrefixes = new Set<string>()
                if (commonSnippets) {
                    for (const [key, val] of Object.entries(commonSnippets)) {
                        if (!usedPrefixes.has(val.prefix)) {
                            merged[key] = val
                            usedPrefixes.add(val.prefix)
                        }
                    }
                }
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
        this.dialectCache.clear()
        this.snippetItemsMap.clear()
        this.keywordItemsCache.clear()
        this.functionItemsCache.clear()
    }

    private getDialect(langId: string): { dialect: Dialect; dName: string } {
        const cached = this.dialectCache.get(langId)
        const dName = sqlDialects[langId as keyof typeof sqlDialects] || 'hive'
        if (cached) return { dialect: cached, dName }
        const dc = allDialects[dName as keyof typeof allDialects]
        const dialectOpts = (dc ? dc.get() : allDialects.hive.get()) as DialectOptions
        const dialect = createDialect(dialectOpts)
        this.dialectCache.set(langId, dialect)
        return { dialect, dName }
    }

    private tryCollect(items: vscode.CompletionItem[], fn: () => vscode.CompletionItem[], context: string): void {
        try {
            items.push(...fn())
        } catch (e) { handleError(e, context, ErrorCategory.SUB_ITEM) }
    }

    async provideCompletionItems(
        doc: vscode.TextDocument,
        pos: vscode.Position,
        token: vscode.CancellationToken,
    ): Promise<vscode.CompletionItem[] | null | undefined> {
        return getPerformanceMonitor().measureAsync('SqlCompletionProvider.provideCompletionItems', async () => {
            try {
                if (doc.lineCount === 0) return []

                await this.ensureSnippetsLoaded()
                const cfgMgr = getConfigManager()
                if (!cfgMgr.get('enableCompletion', true)) return []
                if (token.isCancellationRequested) return []
                const cfg = cfgMgr.getSectionKeys('completion', ['keywords', 'functions', 'snippets', 'cteNames', 'identifiers', 'commentSnippets', 'schema'], {
                    keywords: true,
                    functions: true,
                    snippets: true,
                    cteNames: true,
                    identifiers: true,
                    commentSnippets: true,
                    schema: true,
                })
                const { dName, dialect } = this.getDialect(doc.languageId)
                const items: vscode.CompletionItem[] = []

                const sqlDialect = toSqlDialect(doc.languageId) as SqlDialect
                const parseResult = getDocumentAstCache().getOrParse(doc, sqlDialect)

                if (cfg.schema && getConnectionManager().getActiveConnection()) {
                    try {
                        const schemaItems = await this.schemaCompletionProvider.provideCompletionItems(doc, pos, token, parseResult)
                        if (schemaItems) items.push(...schemaItems)
                    } catch (e) { handleError(e, 'schema completion', ErrorCategory.SUB_ITEM) }
                }
                if (token.isCancellationRequested) return []

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
                if (token.isCancellationRequested) return []

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
                if (token.isCancellationRequested) return []

                this.tryCollect(items, () => {
                    if (!cfg.snippets) return []
                    const snippets = this.snippetItemsMap.get(dName)
                    return snippets || []
                }, 'snippet completion')
                if (token.isCancellationRequested) return []

                const textContent = doc.getText().trim()
                this.tryCollect(items, () => {
                    if (!cfg.cteNames || !textContent) return []
                    if (parseResult.success && parseResult.ast) {
                        return getCTEItemsFromAst(parseResult.ast)
                    }
                    return []
                }, 'CTE completion')
                if (token.isCancellationRequested) return []

                this.tryCollect(items, () => {
                    if (!cfg.identifiers || !textContent) return []
                    return getIdentifierItems(doc, pos, dialect.tokenizer)
                }, 'identifier completion')
                if (token.isCancellationRequested) return []

                this.tryCollect(items, () => {
                    if (!cfg.commentSnippets) return []
                    return getCommentCompletionItems(doc, pos)
                }, 'comment snippet completion')

                return items
            } catch (e) {
                handleError(e, 'completion provider', ErrorCategory.FEATURE)
                return []
            }
        })
    }
}