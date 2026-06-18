import * as vscode from 'vscode'
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
import { snippetData } from './generated/snippetData'

export class SqlCompletionProvider implements vscode.CompletionItemProvider {
    private dialectCache = new Map<string, Dialect>()
    private snippetItemsMap = new Map<string, vscode.CompletionItem[]>()
    private keywordItemsCache = new Map<string, vscode.CompletionItem[]>()
    private functionItemsCache = new Map<string, vscode.CompletionItem[]>()
    private schemaCompletionProvider: SchemaCompletionProvider
    private configChangeDisposable: vscode.Disposable

    constructor(_extensionPath: string) {
        this.schemaCompletionProvider = new SchemaCompletionProvider()
        this.configChangeDisposable = getConfigManager().onConfigChange(() => {
            this.keywordItemsCache.clear()
            this.functionItemsCache.clear()
        })
        this.initSnippetItems()
    }

    private initSnippetItems(): void {
        const dialectNames = new Set<string>()
        for (const dName of Object.values(sqlDialects)) {
            dialectNames.add(dName)
        }
        const commonSnippets = snippetData['common']
        for (const dName of dialectNames) {
            const merged: Record<string, import('./generated/snippetData').SnippetDef> = {}
            const usedPrefixes = new Set<string>()
            if (commonSnippets) {
                for (const [key, val] of Object.entries(commonSnippets)) {
                    if (!usedPrefixes.has(val.prefix)) {
                        merged[key] = val
                        usedPrefixes.add(val.prefix)
                    }
                }
            }
            const dialectSnippets = snippetData[dName]
            if (dialectSnippets) {
                for (const [key, val] of Object.entries(dialectSnippets)) {
                    if (!usedPrefixes.has(val.prefix)) {
                        merged[key] = val
                        usedPrefixes.add(val.prefix)
                    }
                }
            }
            this.snippetItemsMap.set(dName, getSnippetItems(merged))
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

                // Start schema fetch early (network I/O) so it overlaps with local work
                const activeConnection = getConnectionManager().getActiveConnection()
                const schemaPromise = cfg.schema && activeConnection
                    ? this.schemaCompletionProvider.provideCompletionItems(doc, pos, token, parseResult).catch(() => null)
                    : Promise.resolve(null)

                // Collect local items (synchronous, fast)
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

                // Await schema result (network I/O started earlier)
                if (token.isCancellationRequested) return []
                const schemaItems = await schemaPromise
                if (schemaItems) items.unshift(...schemaItems) // schema items first for relevance

                return items
            } catch (e) {
                handleError(e, 'completion provider', ErrorCategory.FEATURE)
                return []
            }
        })
    }
}