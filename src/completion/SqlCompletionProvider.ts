import * as vscode from "vscode";
import { sqlDialects, toSqlDialect } from "../core/sqlDialects";
import { createDialect, type Dialect, type DialectOptions } from "../dialects/dialect";
import { keywordMap, functionSigMap } from "../dialects/dialectData";
import * as allDialects from "../dialects/allDialects";
import { getKeywordItems } from "./keywordCompletion";
import { getFunctionItems } from "./functionCompletion";
import { getSnippetItems } from "./snippetCompletion";
import { getCTEItemsFromAst } from "./cteCompletion";
import { getIdentifierItems } from "./identifierCompletion";
import { getCommentCompletionItems } from "./commentCompletion";
import { handleError, ErrorCategory } from "../core/errorHandler";
import { getConfigManager } from "../core/configManager";
import { getPerformanceMonitor } from "../core/performanceMonitor";
import { SchemaCompletionProvider } from "./SchemaCompletionProvider";
import { getSchemaProvider } from "../database/schema/SchemaProvider";
import { getConnectionManager } from "../database/connection/ConnectionManager";
import { getDocumentAstCache } from "../parser/DocumentAstCache";
import type { SqlDialect } from "../parser/dialectMapper";
import { snippetData } from "./generated/snippetData";

/**
 * Module-level lazy caches for static completion items (keywords, functions,
 * snippets). These depend only on the SQL dialect (and i18n locale), not on
 * document content or cursor position, so they are built once per dialect and
 * reused across every `provideCompletionItems` call.
 *
 * They are populated lazily (not at module load) because i18n is only
 * initialized during extension activation, and cleared on config change
 * (e.g. displayLanguage switch) via {@link SqlCompletionProvider}'s config
 * change subscription.
 */
const staticKeywordItemsCache = new Map<string, vscode.CompletionItem[]>();
const staticFunctionItemsCache = new Map<string, vscode.CompletionItem[]>();
const staticSnippetItemsCache = new Map<string, vscode.CompletionItem[]>();

/**
 * Build (once) and return the cached static keyword/dataType completion items
 * for a dialect.
 */
function getStaticKeywordItems(dName: string): vscode.CompletionItem[] {
    let items = staticKeywordItemsCache.get(dName);
    if (!items) {
        const kd = keywordMap[dName];
        if (kd) {
            items = getKeywordItems(kd.keywords, kd.dataTypes, dName);
        } else {
            items = [];
        }
        staticKeywordItemsCache.set(dName, items);
    }
    return items;
}

/**
 * Build (once) and return the cached static function completion items for a
 * dialect.
 */
function getStaticFunctionItems(dName: string): vscode.CompletionItem[] {
    let items = staticFunctionItemsCache.get(dName);
    if (!items) {
        const sigs = functionSigMap[dName];
        if (sigs) {
            items = getFunctionItems(sigs);
        } else {
            items = [];
        }
        staticFunctionItemsCache.set(dName, items);
    }
    return items;
}

/**
 * Build (once) and return the cached static snippet completion items for a
 * dialect, merging common + dialect-specific snippets (common first).
 */
function getStaticSnippetItems(dName: string): vscode.CompletionItem[] {
    let items = staticSnippetItemsCache.get(dName);
    if (!items) {
        const merged: Record<string, import("./generated/snippetData").SnippetDef> = {};
        const usedPrefixes = new Set<string>();
        const commonSnippets = snippetData["common"];
        if (commonSnippets) {
            for (const [key, val] of Object.entries(commonSnippets)) {
                if (!usedPrefixes.has(val.prefix)) {
                    merged[key] = val;
                    usedPrefixes.add(val.prefix);
                }
            }
        }
        const dialectSnippets = snippetData[dName];
        if (dialectSnippets) {
            for (const [key, val] of Object.entries(dialectSnippets)) {
                if (!usedPrefixes.has(val.prefix)) {
                    merged[key] = val;
                    usedPrefixes.add(val.prefix);
                }
            }
        }
        items = getSnippetItems(merged);
        staticSnippetItemsCache.set(dName, items);
    }
    return items;
}

/**
 * Clear all module-level static completion item caches. Called when the
 * configuration changes (e.g. displayLanguage) so items are rebuilt with the
 * new locale on next use.
 */
function clearStaticCompletionCaches(): void {
    staticKeywordItemsCache.clear();
    staticFunctionItemsCache.clear();
    staticSnippetItemsCache.clear();
}

/**
 * Create a shallow copy of a cached static {@link vscode.CompletionItem}.
 *
 * VSCode (and the completion list machinery) may mutate returned items (e.g.
 * resolving documentation, setting `preselect`, adjusting `sortText`). To keep
 * the module-level caches immutable we hand out fresh item objects that reuse
 * the immutable configuration (label, kind, detail, documentation,
 * insertText, sortText) of the cached template.
 *
 * `insertText` (SnippetString) and `documentation` (MarkdownString) are
 * reused by reference: they are treated as read-only by VSCode after item
 * construction and copying them would defeat the memory-saving purpose of the
 * cache.
 */
function cloneStaticItem(template: vscode.CompletionItem): vscode.CompletionItem {
    const copy = new vscode.CompletionItem(template.label, template.kind);
    copy.insertText = template.insertText;
    copy.detail = template.detail;
    copy.documentation = template.documentation;
    copy.sortText = template.sortText;
    return copy;
}

/**
 * Append shallow copies of cached static items to `target`. Avoids allocating a
 * new intermediate array for the static slice on every keystroke.
 */
function appendClonedStaticItems(target: vscode.CompletionItem[], templates: vscode.CompletionItem[]): void {
    for (const template of templates) {
        target.push(cloneStaticItem(template));
    }
}

export class SqlCompletionProvider implements vscode.CompletionItemProvider {
    private dialectCache = new Map<string, Dialect>();
    private schemaCompletionProvider: SchemaCompletionProvider;
    private configChangeDisposable: vscode.Disposable;
    /**
     * Handle of the pending debounce timer for {@link provideCompletionItems}.
     * Kept on the instance so that rapid keystrokes reset the same timer
     * instead of stacking multiple deferred executions.
     */
    private debounceTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(_extensionPath: string) {
        this.schemaCompletionProvider = new SchemaCompletionProvider(getSchemaProvider());
        this.configChangeDisposable = getConfigManager().onConfigChange(() => {
            // Static items embed i18n labels; rebuild them when config (e.g.
            // displayLanguage) changes.
            clearStaticCompletionCaches();
        });
    }

    public dispose(): void {
        this.configChangeDisposable.dispose();
        this.dialectCache.clear();
        if (this.debounceTimer !== null) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        clearStaticCompletionCaches();
    }

    private getDialect(langId: string): { dialect: Dialect; dName: string } {
        const cached = this.dialectCache.get(langId);
        const dName = sqlDialects[langId as keyof typeof sqlDialects] || "hive";
        if (cached) return { dialect: cached, dName };
        const dialectOpts = (allDialects[dName as keyof typeof allDialects] ?? allDialects.hive) as DialectOptions;
        const dialect = createDialect(dialectOpts);
        this.dialectCache.set(langId, dialect);
        return { dialect, dName };
    }

    private tryCollect(items: vscode.CompletionItem[], fn: () => vscode.CompletionItem[], context: string): void {
        try {
            items.push(...fn());
        } catch (e) {
            handleError(e, context, ErrorCategory.SUB_ITEM);
        }
    }

    async provideCompletionItems(
        doc: vscode.TextDocument,
        pos: vscode.Position,
        token: vscode.CancellationToken,
    ): Promise<vscode.CompletionItem[] | null | undefined> {
        // Debounce the (potentially expensive) completion computation by 50ms.
        // Rapid keystrokes reset the same timer so we only build the completion
        // list once the user pauses. Cancellation cancels the pending timer
        // and resolves immediately with `[]`.
        const DEBOUNCE_MS = 50;

        return new Promise<vscode.CompletionItem[] | null | undefined>((resolve) => {
            // Fast-path early cancellation: avoid scheduling a timer at all.
            if (token.isCancellationRequested) {
                resolve([]);
                return;
            }

            // Reset any pending timer so only the latest invocation wins.
            if (this.debounceTimer !== null) {
                clearTimeout(this.debounceTimer);
                this.debounceTimer = null;
            }

            let settled = false;
            // Subscribe to cancellation so we can abort the pending timer
            // immediately when VSCode signals it. The subscription is disposed
            // once we settle (either via cancellation or completion).
            const cancellationSub = token.onCancellationRequested(() => {
                settle([]);
            });

            const settle = (value: vscode.CompletionItem[] | null | undefined): void => {
                if (settled) return;
                settled = true;
                if (this.debounceTimer !== null) {
                    clearTimeout(this.debounceTimer);
                    this.debounceTimer = null;
                }
                cancellationSub.dispose();
                resolve(value);
            };

            this.debounceTimer = setTimeout(() => {
                this.debounceTimer = null;
                if (token.isCancellationRequested) {
                    settle([]);
                    return;
                }
                this.provideCompletionItemsInternal(doc, pos, token).then(settle, (e) => {
                    handleError(e, "completion provider", ErrorCategory.FEATURE);
                    settle([]);
                });
            }, DEBOUNCE_MS);
        });
    }

    private async provideCompletionItemsInternal(
        doc: vscode.TextDocument,
        pos: vscode.Position,
        token: vscode.CancellationToken,
    ): Promise<vscode.CompletionItem[] | null | undefined> {
        return getPerformanceMonitor().measureAsync("SqlCompletionProvider.provideCompletionItems", async () => {
            try {
                if (doc.lineCount === 0) return [];

                const cfgMgr = getConfigManager();
                if (!cfgMgr.get("enableCompletion", true)) return [];
                if (token.isCancellationRequested) return [];
                const cfg = cfgMgr.getSectionKeys(
                    "completion",
                    ["keywords", "functions", "snippets", "cteNames", "identifiers", "commentSnippets", "schema"],
                    {
                        keywords: true,
                        functions: true,
                        snippets: true,
                        cteNames: true,
                        identifiers: true,
                        commentSnippets: true,
                        schema: true,
                    },
                );
                const { dName, dialect } = this.getDialect(doc.languageId);
                const items: vscode.CompletionItem[] = [];

                const sqlDialect = toSqlDialect(doc.languageId) as SqlDialect;
                const parseResult = getDocumentAstCache().getOrParse(doc, sqlDialect);

                // Start schema fetch early (network I/O) so it overlaps with local work
                const activeConnection = getConnectionManager().getActiveConnection();
                const schemaPromise =
                    cfg.schema && activeConnection
                        ? this.schemaCompletionProvider.provideCompletionItems(doc, pos, token, parseResult).catch(() => null)
                        : Promise.resolve(null);

                // Collect static items (cached at module level, cloned to avoid
                // mutation by VSCode). These depend only on the dialect.
                if (cfg.keywords) {
                    try {
                        appendClonedStaticItems(items, getStaticKeywordItems(dName));
                    } catch (e) {
                        handleError(e, "keyword completion", ErrorCategory.SUB_ITEM);
                    }
                }
                if (token.isCancellationRequested) return [];

                if (cfg.functions) {
                    try {
                        appendClonedStaticItems(items, getStaticFunctionItems(dName));
                    } catch (e) {
                        handleError(e, "function completion", ErrorCategory.SUB_ITEM);
                    }
                }
                if (token.isCancellationRequested) return [];

                if (cfg.snippets) {
                    try {
                        appendClonedStaticItems(items, getStaticSnippetItems(dName));
                    } catch (e) {
                        handleError(e, "snippet completion", ErrorCategory.SUB_ITEM);
                    }
                }
                if (token.isCancellationRequested) return [];

                // Collect dynamic items (depend on document content / position).
                const textContent = doc.getText().trim();
                this.tryCollect(
                    items,
                    () => {
                        if (!cfg.cteNames || !textContent) return [];
                        if (parseResult.success && parseResult.ast) {
                            return getCTEItemsFromAst(parseResult.ast);
                        }
                        return [];
                    },
                    "CTE completion",
                );
                if (token.isCancellationRequested) return [];

                this.tryCollect(
                    items,
                    () => {
                        if (!cfg.identifiers || !textContent) return [];
                        return getIdentifierItems(doc, pos, dialect.tokenizer);
                    },
                    "identifier completion",
                );
                if (token.isCancellationRequested) return [];

                this.tryCollect(
                    items,
                    () => {
                        if (!cfg.commentSnippets) return [];
                        return getCommentCompletionItems(doc, pos);
                    },
                    "comment snippet completion",
                );

                // Await schema result (network I/O started earlier)
                if (token.isCancellationRequested) return [];
                const schemaItems = await schemaPromise;
                if (schemaItems) items.unshift(...schemaItems); // schema items first for relevance

                return items;
            } catch (e) {
                handleError(e, "completion provider", ErrorCategory.FEATURE);
                return [];
            }
        });
    }

    /**
     * Delegates schema completion item resolution to
     * {@link SchemaCompletionProvider.resolveCompletionItem}, which updates the
     * MRU cache when the user actually interacts with a schema item. Only items
     * carrying schema MRU data are affected; non-schema items pass through
     * unchanged.
     */
    resolveCompletionItem(item: vscode.CompletionItem, token: vscode.CancellationToken): vscode.ProviderResult<vscode.CompletionItem> {
        return this.schemaCompletionProvider.resolveCompletionItem(item, token);
    }
}
