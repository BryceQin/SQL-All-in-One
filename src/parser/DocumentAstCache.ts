import * as vscode from 'vscode';
import type { AST } from 'node-sql-parser';
import { getParserEngine } from './SqlParserEngine';
import type { SqlDialect } from './dialectMapper';
import type { ParseError } from './ParseError';
import { LRUCache } from '../utils/lruCache';
import { getPerformanceMonitor } from '../core/performanceMonitor';
import { getContainer, Tokens } from '../core/diContainer';
import { isAstNode } from './AstVisitor';
import { extractName, toVscodeLocationFromLoc } from './astUtils';
import type { AstNode, AstLocation } from './astTypes';

export interface SymbolIndex {
    cteDefinitions: Map<string, vscode.Location>;
    tableAliasDefinitions: Map<string, vscode.Location>;
    columnAliasDefinitions: Map<string, vscode.Location>;
    aliasMap: Map<string, string>;
}

interface CacheEntry {
    version: number;
    ast: AST[] | AST;
    timestamp: number;
    symbolIndex?: SymbolIndex;
}

function buildIndex(ast: unknown[] | unknown, document: vscode.TextDocument): SymbolIndex {
    const index: SymbolIndex = {
        cteDefinitions: new Map(),
        tableAliasDefinitions: new Map(),
        columnAliasDefinitions: new Map(),
        aliasMap: new Map(),
    };

    const astList = Array.isArray(ast) ? ast : [ast];

    for (const stmt of astList) {
        if (!isAstNode(stmt)) continue;
        const node = stmt as AstNode;

        if (node.type === 'select') {
            processSelectForIndex(node, document, index);
        }

        if (node.type === 'with' || (node.type === 'select' && node.with)) {
            const withClause = node.type === 'with' ? node : node.with;
            processWithForIndex(withClause, document, index);
        }
    }

    return index;
}

function processWithForIndex(withClause: unknown, document: vscode.TextDocument, index: SymbolIndex): void {
    let cteItems: unknown[] = [];

    if (isAstNode(withClause) && (withClause as AstNode).type === 'with') {
        const withNode = withClause as AstNode;
        const value = withNode.value;
        if (Array.isArray(value)) {
            cteItems = value;
        }
    } else if (Array.isArray(withClause)) {
        cteItems = withClause;
    }

    for (const item of cteItems) {
        if (item == null || typeof item !== 'object') continue;
        const itemNode = item as Record<string, unknown>;
        const cteName = extractName(itemNode.name);
        if (cteName) {
            const loc = (item as Record<string, unknown>).loc as { start?: AstLocation; end?: AstLocation } | undefined;
            const location = loc
                ? toVscodeLocationFromLoc(loc, document)
                : null;
            if (location) {
                index.cteDefinitions.set(cteName.toLowerCase(), location);
            }
        }
    }
}

function processSelectForIndex(node: AstNode, document: vscode.TextDocument, index: SymbolIndex): void {
    const from = node.from;
    if (Array.isArray(from)) {
        for (const item of from) {
            if (item == null || typeof item !== 'object') continue;
            const fromEntry = item as Record<string, unknown>;

            const aliasSource = fromEntry.as || fromEntry.alias;
            if (aliasSource) {
                const aliasName = extractName(aliasSource);
                if (aliasName) {
                    const tableName = extractName(fromEntry.table);
                    if (tableName) {
                        index.aliasMap.set(aliasName.toLowerCase(), tableName);
                    }
                    const loc = fromEntry.loc as { start?: AstLocation; end?: AstLocation } | undefined;
                    const location = loc
                        ? toVscodeLocationFromLoc(loc, document)
                        : null;
                    if (location) {
                        index.tableAliasDefinitions.set(aliasName.toLowerCase(), location);
                    }
                }
            }
        }
    }

    const columns = node.columns;
    if (Array.isArray(columns)) {
        for (const col of columns) {
            if (col == null || typeof col !== 'object') continue;
            const colEntry = col as Record<string, unknown>;
            if (colEntry.as) {
                const aliasName = extractName(colEntry.as);
                if (aliasName) {
                    const loc = colEntry.loc as { start?: AstLocation; end?: AstLocation } | undefined;
                    const location = loc
                        ? toVscodeLocationFromLoc(loc, document)
                        : null;
                    if (location) {
                        index.columnAliasDefinitions.set(aliasName.toLowerCase(), location);
                    }
                }
            }
        }
    }
}

export class DocumentAstCache {
    private cache: LRUCache<string, CacheEntry>;
    private disposables: vscode.Disposable[] = [];
    private perfMonitor = getPerformanceMonitor();

    constructor() {
        this.cache = new LRUCache<string, CacheEntry>({
            maxSize: 50,
            maxAge: 30000,
        });

        this.disposables.push(
            vscode.workspace.onDidCloseTextDocument((doc) => {
                this.cache.deleteByPrefix(doc.uri.toString());
            })
        );
    }

    private getOrParseInternal(document: vscode.TextDocument, dialect: SqlDialect): {
        success: boolean;
        ast: AST[] | AST | null;
        error: ParseError | null;
    } {
        const key = `${document.uri.toString()}::${dialect}`;
        const version = document.version;
        const cached = this.cache.peek(key);

        if (cached && cached.version === version) {
            return { success: true, ast: cached.ast, error: null };
        }

        const engine = getParserEngine();
        const result = engine.tryAstify(document.getText(), dialect);

        if (result.success && result.ast) {
            this.cache.set(key, {
                version,
                ast: result.ast,
                timestamp: Date.now(),
            });
        }

        return result;
    }

    getOrParse(document: vscode.TextDocument, dialect: SqlDialect): {
        success: boolean;
        ast: AST[] | AST | null;
        error: ParseError | null;
    } {
        return this.perfMonitor.measure('DocumentAstCache.getOrParse', () => {
            return this.getOrParseInternal(document, dialect);
        });
    }

    getOrBuildSymbolIndex(document: vscode.TextDocument, dialect: SqlDialect): SymbolIndex | null {
        const key = `${document.uri.toString()}::${dialect}`;
        const version = document.version;

        const cached = this.cache.peek(key);
        if (cached && cached.version === version) {
            if (cached.symbolIndex) {
                return cached.symbolIndex;
            }
            const symbolIndex = buildIndex(cached.ast, document);
            cached.symbolIndex = symbolIndex;
            return symbolIndex;
        }

        const result = this.getOrParseInternal(document, dialect);

        if (!result.success || !result.ast) {
            return null;
        }

        const symbolIndex = buildIndex(result.ast, document);

        const updatedCached = this.cache.peek(key);
        if (updatedCached && updatedCached.version === version) {
            updatedCached.symbolIndex = symbolIndex;
        }

        return symbolIndex;
    }

    getOrBuildAliasMap(document: vscode.TextDocument, dialect: SqlDialect): Map<string, string> {
        const index = this.getOrBuildSymbolIndex(document, dialect);
        return index ? index.aliasMap : new Map<string, string>();
    }

    invalidate(uri: vscode.Uri): void {
        // Cache keys are formatted as `${uri}::${dialect}`, so delete by prefix
        this.cache.deleteByPrefix(uri.toString());
    }

    dispose(): void {
        this.cache.clear();
        this.disposables.forEach((d) => { d.dispose(); });
    }
}

export function createDocumentAstCache(): DocumentAstCache {
    return new DocumentAstCache();
}

export function getDocumentAstCache(): DocumentAstCache {
    return getContainer().get<DocumentAstCache>(Tokens.DocumentAstCache);
}
