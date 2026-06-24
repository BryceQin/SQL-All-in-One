import * as vscode from 'vscode';
import type { AST } from 'node-sql-parser';
import { getParserEngine } from './SqlParserEngine';
import type { SqlDialect } from './dialectMapper';
import type { ParseError } from './ParseError';
import { LRUCache } from '../utils/lruCache';
import { getPerformanceMonitor } from '../core/performanceMonitor';
import { handleError, ErrorCategory } from '../core/errorHandler';
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

interface StatementCache {
    text: string;
    ast: AST[] | AST;
    range: { start: number; end: number };
    /** 1-based absolute line number of the statement start in the document. */
    startLine: number;
    /** 1-based absolute column number of the statement start in the document. */
    startCol: number;
}

interface CacheEntry {
    version: number;
    ast: AST[] | AST;
    timestamp: number;
    symbolIndex?: SymbolIndex;
    /** Per-statement cache for incremental re-parsing. Only set when more than 1 statement
     *  and the split count matches the AST array length. */
    statements?: StatementCache[];
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

// ---------------------------------------------------------------------------
// Statement-level incremental parsing helpers
// ---------------------------------------------------------------------------

/**
 * Try to match a PostgreSQL dollar-quote opening delimiter at position `start`.
 *
 * A dollar-quote delimiter has the form `$<tag>$` where `<tag>` is an optional
 * identifier (must start with a letter or underscore, followed by letters,
 * digits, or underscores). The empty tag (`$$`) is also valid.
 *
 * Returns the delimiter string and the index just past it, or `null` if the
 * text at `start` is not a dollar-quote opening delimiter.
 */
function matchDollarQuoteDelimiter(
    text: string,
    start: number,
    len: number,
): { delimiter: string; nextIndex: number } | null {
    if (text.charCodeAt(start) !== 36) return null; // '$'
    let j = start + 1;
    // Optional tag: must start with a letter or underscore, then identifier chars.
    if (j < len) {
        const c = text.charCodeAt(j);
        if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95) {
            j++;
            while (j < len) {
                const cc = text.charCodeAt(j);
                if ((cc >= 65 && cc <= 90) || (cc >= 97 && cc <= 122) || (cc >= 48 && cc <= 57) || cc === 95) {
                    j++;
                } else {
                    break;
                }
            }
        }
    }
    // The opening delimiter must be terminated by '$'.
    if (j < len && text.charCodeAt(j) === 36) {
        const delimiter = text.substring(start, j + 1);
        return { delimiter, nextIndex: j + 1 };
    }
    return null;
}

/**
 * Split SQL text into individual statements, respecting strings and comments.
 * Returns each statement's text and its character-offset range in the original text.
 * @internal Exported for testing only.
 */
export function splitSqlStatements(text: string): { text: string; start: number; end: number }[] {
    const statements: { text: string; start: number; end: number }[] = [];
    let statementStart = 0;
    let i = 0;
    const len = text.length;

    while (i < len) {
        const code = text.charCodeAt(i);

        // Single-line comment: --
        if (code === 45 && i + 1 < len && text.charCodeAt(i + 1) === 45) {
            i += 2;
            while (i < len && text.charCodeAt(i) !== 10) i++;
            continue;
        }

        // Multi-line comment: /* */
        if (code === 47 && i + 1 < len && text.charCodeAt(i + 1) === 42) {
            i += 2;
            while (i < len && !(text.charCodeAt(i) === 42 && i + 1 < len && text.charCodeAt(i + 1) === 47)) i++;
            i += 2; // skip */
            continue;
        }

        // Single-quoted string (with '' escape)
        if (code === 39) {
            i++;
            while (i < len) {
                if (text.charCodeAt(i) === 39) {
                    if (i + 1 < len && text.charCodeAt(i + 1) === 39) {
                        i += 2; // escaped quote
                        continue;
                    }
                    i++; // closing quote
                    break;
                }
                i++;
            }
            continue;
        }

        // Double-quoted string
        if (code === 34) {
            i++;
            while (i < len && text.charCodeAt(i) !== 34) i++;
            i++;
            continue;
        }

        // Backtick-quoted identifier
        if (code === 96) {
            i++;
            while (i < len && text.charCodeAt(i) !== 96) i++;
            i++;
            continue;
        }

        // PostgreSQL dollar-quoted string: $$...$$ or $tag$...$tag$
        if (code === 36) {
            const delimMatch = matchDollarQuoteDelimiter(text, i, len);
            if (delimMatch) {
                const closeIdx = text.indexOf(delimMatch.delimiter, delimMatch.nextIndex);
                if (closeIdx === -1) {
                    // Unterminated dollar-quoted string – consume the rest of the text.
                    i = len;
                } else {
                    i = closeIdx + delimMatch.delimiter.length;
                }
                continue;
            }
        }

        // Semicolon – end of statement
        if (code === 59) {
            const stmtText = text.substring(statementStart, i + 1);
            // Only add if there is real SQL content (not just whitespace + semicolons)
            const content = stmtText.replace(/;/g, '').trim();
            if (content.length > 0) {
                statements.push({
                    text: stmtText,
                    start: statementStart,
                    end: i + 1,
                });
            }
            statementStart = i + 1;
        }

        i++;
    }

    // Handle the last statement (without trailing semicolon)
    if (statementStart < len) {
        const lastStmt = text.substring(statementStart);
        if (lastStmt.trim().length > 0) {
            statements.push({
                text: lastStmt,
                start: statementStart,
                end: len,
            });
        }
    }

    return statements;
}

/**
 * Compute 1-based line and column numbers for a character offset in the given text.
 * @internal Exported for testing only.
 */
export function computeLineColumn(text: string, offset: number): { line: number; column: number } {
    let line = 1;
    let lastNewlinePos = -1;
    const limit = Math.min(offset, text.length);
    for (let i = 0; i < limit; i++) {
        if (text.charCodeAt(i) === 10) {
            line++;
            lastNewlinePos = i;
        }
    }
    const column = offset - lastNewlinePos; // 1-based
    return { line, column };
}

/**
 * Precompute the character offset of the start of each line.
 * Returns an array where index `i` is the offset of line `i+1`.
 * Line 1 always starts at offset 0.
 * @internal Exported for testing only.
 */
export function precomputeLineOffsets(text: string): number[] {
    const offsets: number[] = [0];
    for (let i = 0; i < text.length; i++) {
        if (text.charCodeAt(i) === 10) {
            offsets.push(i + 1);
        }
    }
    return offsets;
}

/**
 * Compute 1-based line and column for `offset` using a precomputed line-offsets
 * array (from {@link precomputeLineOffsets}). Uses binary search for O(log n)
 * lookup, which is significantly faster than the linear scan in
 * {@link computeLineColumn} when many lookups are needed.
 * @internal Exported for testing only.
 */
export function computeLineColumnFast(
    lineOffsets: number[],
    offset: number,
): { line: number; column: number } {
    let low = 0;
    let high = lineOffsets.length - 1;
    while (low < high) {
        const mid = (low + high + 1) >>> 1;
        if (lineOffsets[mid] <= offset) {
            low = mid;
        } else {
            high = mid - 1;
        }
    }
    const lineStart = lineOffsets[low];
    return { line: low + 1, column: offset - lineStart + 1 };
}

/**
 * Adjust all `loc` properties in an AST in-place so that locations are
 * shifted from the old absolute start position to the new absolute start position.
 *
 * For newly parsed statements (locations start at line 1, col 1):
 *   pass oldStartLine=1, oldStartCol=1, newStartLine/newStartCol = absolute position.
 *
 * For reused cached statements whose document offset changed:
 *   pass the old and new absolute start positions.
 *
 * @internal Exported for testing only.
 */
export function adjustAstLocationsInPlace(
    ast: unknown,
    oldStartLine: number,
    oldStartCol: number,
    newStartLine: number,
    newStartCol: number,
): void {
    const lineDelta = newStartLine - oldStartLine;
    const colDelta = newStartCol - oldStartCol;
    if (lineDelta === 0 && colDelta === 0) return;

    function adjust(obj: unknown): void {
        if (obj == null || typeof obj !== 'object') return;
        if (Array.isArray(obj)) {
            for (const item of obj) adjust(item);
            return;
        }
        const record = obj as Record<string, unknown>;
        const loc = record.loc;
        if (loc != null && typeof loc === 'object') {
            const l = loc as { start?: { line: number; column: number }; end?: { line: number; column: number } };
            if (l.start && l.start.line > 0) {
                if (l.start.line === oldStartLine) {
                    l.start.column += colDelta;
                }
                l.start.line += lineDelta;
            }
            if (l.end && l.end.line > 0) {
                if (l.end.line === oldStartLine) {
                    l.end.column += colDelta;
                }
                l.end.line += lineDelta;
            }
        }
        for (const key of Object.keys(record)) {
            if (key === 'loc') continue;
            adjust(record[key]);
        }
    }

    adjust(ast);
}

export class DocumentAstCache {
    private cache: LRUCache<string, CacheEntry>;
    private disposables: vscode.Disposable[] = [];
    private perfMonitor = getPerformanceMonitor();

    constructor() {
        this.cache = new LRUCache<string, CacheEntry>({
            // Increased from 50 to 100 to reduce cache thrashing when frequently
            // switching between many open SQL files.
            maxSize: 100,
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

        // Cache hit – same document version
        if (cached && cached.version === version) {
            return { success: true, ast: cached.ast, error: null };
        }

        const fullText = document.getText();
        const engine = getParserEngine();
        const allStmts = splitSqlStatements(fullText);

        // ----- Incremental re-parse (statement-level caching) -----
        // Only attempt when we have a previous statement cache with >1 statement.
        if (cached?.statements && cached.statements.length > 1) {
            const newStmts = allStmts;
            const oldStmts = cached.statements;

            // Same statement count → compare texts and only re-parse changed ones
            if (newStmts.length === oldStmts.length) {
                const changedIndices = new Set<number>();
                for (let i = 0; i < newStmts.length; i++) {
                    if (newStmts[i].text !== oldStmts[i].text) {
                        changedIndices.add(i);
                    }
                }

                // Incremental is worthwhile only when some (not all) statements changed
                if (changedIndices.size > 0 && changedIndices.size < newStmts.length) {
                    try {
                        const mergedAst: AST[] = [];
                        let incrementalOk = true;

                        const lineOffsets = precomputeLineOffsets(fullText);

                        for (let i = 0; i < newStmts.length; i++) {
                            const newAbsPos = computeLineColumnFast(lineOffsets, newStmts[i].start);

                            if (changedIndices.has(i)) {
                                // Re-parse this statement individually
                                const result = engine.tryAstify(newStmts[i].text, dialect);
                                if (!result.success || !result.ast) {
                                    incrementalOk = false;
                                    break;
                                }
                                // Normalise to a flat array of AST nodes
                                const stmtAstList = Array.isArray(result.ast) ? result.ast : [result.ast];
                                // Adjust locations from relative (line 1, col 1) to absolute
                                for (const node of stmtAstList) {
                                    adjustAstLocationsInPlace(node, 1, 1, newAbsPos.line, newAbsPos.column);
                                }
                                mergedAst.push(...stmtAstList);
                            } else {
                                // Reuse cached AST – adjust locations if offset shifted
                                const oldStmt = oldStmts[i];
                                const cachedAstList = Array.isArray(oldStmt.ast) ? oldStmt.ast : [oldStmt.ast];
                                for (const node of cachedAstList) {
                                    const clonedNode: AST = JSON.parse(JSON.stringify(node)) as AST;
                                    adjustAstLocationsInPlace(
                                        clonedNode,
                                        oldStmt.startLine,
                                        oldStmt.startCol,
                                        newAbsPos.line,
                                        newAbsPos.column,
                                    );
                                    mergedAst.push(clonedNode);
                                }
                            }
                        }

                        if (incrementalOk) {
                            const finalAst: AST[] | AST = mergedAst.length === 1 ? mergedAst[0] : mergedAst;

                            // Build updated per-statement caches
                            const newStatementCaches: StatementCache[] = newStmts.map((stmt, idx) => {
                                const absPos = computeLineColumnFast(lineOffsets, stmt.start);
                                // The merged AST may have more elements than statements if a
                                // single statement parse returned multiple AST nodes, but for
                                // the common case (1:1) we map by index.
                                const stmtAst = idx < mergedAst.length ? mergedAst[idx] : mergedAst[0];
                                return {
                                    text: stmt.text,
                                    ast: stmtAst,
                                    range: { start: stmt.start, end: stmt.end },
                                    startLine: absPos.line,
                                    startCol: absPos.column,
                                };
                            });

                            this.cache.set(key, {
                                version,
                                ast: finalAst,
                                timestamp: Date.now(),
                                statements: newStatementCaches,
                            });

                            return { success: true, ast: finalAst, error: null };
                        }
                    } catch (e) {
                        // Fall through to full parse on any unexpected error
                        handleError(e, 'DocumentAstCache.incrementalParse', ErrorCategory.PARSE)
                    }
                }
            }
        }

        // ----- Full parse (original behaviour) -----
        const result = engine.tryAstify(fullText, dialect);

        if (result.success && result.ast) {
            // Build per-statement cache for future incremental parsing
            const stmts = allStmts;
            const astList = Array.isArray(result.ast) ? result.ast : [result.ast];

            // Only cache statements when the count matches (ensures 1:1 mapping)
            let statementCaches: StatementCache[] | undefined;
            if (stmts.length === astList.length && stmts.length > 1) {
                const lineOffsets = precomputeLineOffsets(fullText);
                statementCaches = stmts.map((stmt, i) => {
                    const absPos = computeLineColumnFast(lineOffsets, stmt.start);
                    return {
                        text: stmt.text,
                        ast: astList[i] as AST,
                        range: { start: stmt.start, end: stmt.end },
                        startLine: absPos.line,
                        startCol: absPos.column,
                    };
                });
            }

            this.cache.set(key, {
                version,
                ast: result.ast,
                timestamp: Date.now(),
                statements: statementCaches,
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
