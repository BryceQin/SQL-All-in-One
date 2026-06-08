import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { sqlDialects } from '../core/sqlDialects'
import { createDialect, type Dialect, type DialectOptions } from '../languages/dialect'
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
import { getPerformanceMonitor } from '../core/performanceMonitor'
import { SchemaCompletionProvider } from './SchemaCompletionProvider'
import { getConnectionManager } from '../database/connection/ConnectionManager'

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
    // No longer used
    // private _snippetsLoaded: Promise<void>
    private keywordItemsCache = new Map<string, vscode.CompletionItem[]>()
    private functionItemsCache = new Map<string, vscode.CompletionItem[]>()
    private schemaCompletionProvider: SchemaCompletionProvider
    private configChangeDisposable: vscode.Disposable
    private schemaDebounceTimer: ReturnType<typeof setTimeout> | null = null
    private readonly SCHEMA_DEBOUNCE_MS = 200

    constructor(extensionPath: string) {
        this.loadSnippets(extensionPath)
        this.schemaCompletionProvider = new SchemaCompletionProvider()
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
        const dialect = createDialect((dc ?? allDialects.hive) as DialectOptions)
        this.dialectCache.set(langId, dialect)
        return { dialect, dName }
    }

    private tryCollect(items: vscode.CompletionItem[], fn: () => vscode.CompletionItem[], context: string): void {
        try {
            items.push(...fn())
        } catch (e) { handleError(e, context, ErrorCategory.SUB_ITEM) }
    }

    private provideSchemaItems(
        doc: vscode.TextDocument,
        pos: vscode.Position,
        token: vscode.CancellationToken,
    ): Promise<vscode.CompletionItem[]> {
        return new Promise<vscode.CompletionItem[]>((resolve) => {
            if (this.schemaDebounceTimer) {
                clearTimeout(this.schemaDebounceTimer)
            }
            let settled = false
            const finish = (items: vscode.CompletionItem[]): void => {
                if (settled) return
                settled = true
                resolve(items)
            }
            const disposable = token.onCancellationRequested(() => {
                if (this.schemaDebounceTimer) {
                    clearTimeout(this.schemaDebounceTimer)
                    this.schemaDebounceTimer = null
                }
                finish([])
            })
            this.schemaDebounceTimer = setTimeout(async () => {
                this.schemaDebounceTimer = null
                disposable.dispose()
                try {
                    const items = await this.schemaCompletionProvider.provideCompletionItems(doc, pos, token)
                    finish(items)
                } catch {
                    finish([])
                }
            }, this.SCHEMA_DEBOUNCE_MS)
        })
    }

    async provideCompletionItems(
        doc: vscode.TextDocument,
        pos: vscode.Position,
        token: vscode.CancellationToken,
    ): Promise<vscode.CompletionItem[] | null | undefined> {
        return getPerformanceMonitor().measureAsync('SqlCompletionProvider.provideCompletionItems', async () => {
            try {
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

                if (cfg.schema && getConnectionManager().getActiveConnection()) {
                    try {
                        const schemaItems = await this.provideSchemaItems(doc, pos, token)
                        items.push(...schemaItems)
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
                if (token.isCancellationRequested) return []
                this.tryCollect(items, () => {
                    if (!cfg.identifiers || !doc.getText().trim()) return []
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