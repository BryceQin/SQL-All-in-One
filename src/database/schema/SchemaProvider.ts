import * as vscode from 'vscode';
import { getSchemaCache } from './SchemaCache';
import { getConnectionManager } from '../connection/ConnectionManager';
import { getParserEngine } from '../../parser/SqlParserEngine';
import type { SqlDialect } from '../../parser/dialectMapper';
import type { ColumnInfo } from '../adapters/IDatabaseAdapter';
import { isAstNode } from '../../parser/AstVisitor';
import type { AstNode } from '../../parser/astTypes';
import type { AST } from 'node-sql-parser';
import { handleError, ErrorCategory } from '../../core/errorHandler';
import { getContainer, Tokens } from '../../core/diContainer';
import { MruTracker } from './MruTracker';
import { HoverInfoProvider } from './HoverInfoProvider';

export type ClauseType =
    | 'USE'
    | 'FROM'
    | 'JOIN'
    | 'SELECT'
    | 'WHERE'
    | 'ORDER BY'
    | 'GROUP BY'
    | 'HAVING'
    | 'INSERT INTO'
    | 'UPDATE'
    | 'CALL'
    | 'OTHER';

export interface CompletionContext {
    connectionId: string;
    database: string;
    clauseType: ClauseType;
    prefix: string;
    aliasMap: Map<string, string>;
}

/**
 * Data attached to schema completion items so that `resolveCompletionItem`
 * can update the MRU cache when the user actually interacts with an item
 * (instead of updating MRU during item generation, which is a read operation
 * that should not produce side effects).
 */
export interface SchemaMruData {
    type: 'database' | 'table' | 'column';
    key: string;
}

/**
 * Attach MRU metadata to a completion item's `data` field. The `data` field
 * exists on {@link vscode.CompletionItem} at runtime but is not declared on
 * the installed `@types/vscode` (1.85) class definition, so we cast to a
 * writable shape.
 */
function setMruData(item: vscode.CompletionItem, data: SchemaMruData): void {
    (item as vscode.CompletionItem & { data?: unknown }).data = data;
}

/**
 * Read MRU metadata previously attached via {@link setMruData}. Returns
 * `undefined` for non-schema items (e.g. keywords, snippets).
 */
function getMruData(item: vscode.CompletionItem): SchemaMruData | undefined {
    const data = (item as vscode.CompletionItem & { data?: unknown }).data;
    if (data && typeof data === 'object' && 'type' in data && 'key' in data) {
        return data as SchemaMruData;
    }
    return undefined;
}

/**
 * Generates schema completion items (databases, tables, views, columns,
 * procedures, functions) and resolves them on selection.
 *
 * Responsibilities are split across collaborating classes held by
 * composition:
 * - {@link MruTracker} owns the most-recently-used cache used to bias
 *   column sorting and updated when the user selects an item.
 * - {@link HoverInfoProvider} renders hover documentation for tables and
 *   columns.
 *
 * The public surface (including {@link getTableHoverInfo} and
 * {@link getColumnHoverInfo}) is preserved so existing callers are
 * unaffected by the split.
 */
export class SchemaProvider {
    private schemaCache = getSchemaCache();
    private mruTracker = new MruTracker();
    private hoverInfoProvider = new HoverInfoProvider();

    async getCompletionItems(context: CompletionContext): Promise<vscode.CompletionItem[]> {
        const items: vscode.CompletionItem[] = [];
        const prefix = context.prefix.toLowerCase();

        switch (context.clauseType) {
            case 'USE':
                await this.addDatabaseItems(items, context.connectionId, prefix);
                break;
            case 'FROM':
            case 'JOIN':
            case 'INSERT INTO':
            case 'UPDATE':
                await this.addTableItems(items, context);
                await this.addViewItems(items, context);
                break;
            case 'SELECT':
            case 'WHERE':
            case 'ORDER BY':
            case 'GROUP BY':
            case 'HAVING':
                await this.addColumnItems(items, context);
                await this.addFunctionItems(items, context);
                break;
            case 'CALL':
                await this.addProcedureItems(items, context);
                break;
            case 'OTHER':
                await this.addFunctionItems(items, context);
                break;
        }

        return this.sortAndTruncate(items, prefix);
    }

    async getTableColumns(database: string, table: string): Promise<ColumnInfo[]> {
        const activeConn = getConnectionManager().getActiveConnection();
        if (!activeConn) return [];
        try {
            return await this.schemaCache.getColumns(activeConn.id, database, table);
        } catch (e) {
            console.debug('[SQL All in One] SchemaProvider.getTableColumns failed:', e)
            return [];
        }
    }

    resolveAlias(alias: string, aliasMap: Map<string, string>): string | undefined {
        return aliasMap.get(alias.toLowerCase());
    }

    parseAliasMap(sql: string, dialect: SqlDialect): Map<string, string> {
        const aliasMap = new Map<string, string>();
        const result = getParserEngine().tryAstify(sql, dialect);
        if (!result.success || !result.ast) return aliasMap;

        const astList = Array.isArray(result.ast) ? result.ast : [result.ast];
        for (const ast of astList) {
            if (!isAstNode(ast)) continue;
            this.collectAliasesFromNode(ast as AstNode, aliasMap);
        }
        return aliasMap;
    }

    parseAliasMapFromAst(ast: AST[] | AST): Map<string, string> {
        const aliasMap = new Map<string, string>();
        const astList = Array.isArray(ast) ? ast : [ast];
        for (const a of astList) {
            if (!isAstNode(a)) continue;
            this.collectAliasesFromNode(a as AstNode, aliasMap);
        }
        return aliasMap;
    }

    private collectAliasesFromNode(node: AstNode, aliasMap: Map<string, string>): void {
        if (node.type === 'select') {
            const from = node.from;
            if (Array.isArray(from)) {
                for (const entry of from) {
                    if (entry == null || typeof entry !== 'object') continue;
                    const fromEntry = entry as Record<string, unknown>;
                    const table = fromEntry.table;
                    const as = fromEntry.as || fromEntry.alias;
                    if (typeof table === 'string' && typeof as === 'string') {
                        aliasMap.set(as.toLowerCase(), table);
                    }
                }
            }
        }
    }

    private async addDatabaseItems(items: vscode.CompletionItem[], connectionId: string, prefix: string): Promise<void> {
        try {
            const databases = await this.schemaCache.getDatabases(connectionId);
            for (const db of databases) {
                if (prefix && !db.name.toLowerCase().startsWith(prefix)) continue;
                const item = new vscode.CompletionItem(db.name, vscode.CompletionItemKind.Module);
                item.detail = 'Database';
                if (db.charset || db.collation) {
                    const parts: string[] = [];
                    if (db.charset) parts.push(`Charset: ${db.charset}`);
                    if (db.collation) parts.push(`Collation: ${db.collation}`);
                    item.documentation = new vscode.MarkdownString(parts.join(' | '));
                }
                item.sortText = `0${db.name}`;
                setMruData(item, { type: 'database', key: db.name.toLowerCase() });
                items.push(item);
            }
        } catch (e) { handleError(e, 'SchemaProvider.addDatabaseItems', ErrorCategory.FEATURE); }
    }

    private async addTableItems(items: vscode.CompletionItem[], context: CompletionContext): Promise<void> {
        try {
            const tables = await this.schemaCache.getTables(context.connectionId, context.database);
            for (const tbl of tables) {
                if (tbl.type && tbl.type.toUpperCase() === 'VIEW') continue;
                if (context.prefix && !tbl.name.toLowerCase().startsWith(context.prefix.toLowerCase())) continue;
                const item = new vscode.CompletionItem(tbl.name, vscode.CompletionItemKind.Class);
                const rowCountStr = tbl.rowCount !== undefined ? ` · ${tbl.rowCount} rows` : '';
                item.detail = `Table${rowCountStr}`;
                if (tbl.comment) {
                    item.documentation = new vscode.MarkdownString(tbl.comment);
                }
                item.sortText = `0${tbl.name}`;
                setMruData(item, { type: 'table', key: tbl.name.toLowerCase() });
                items.push(item);
            }
        } catch (e) { handleError(e, 'SchemaProvider.addTableItems', ErrorCategory.FEATURE); }
    }

    private async addViewItems(items: vscode.CompletionItem[], context: CompletionContext): Promise<void> {
        try {
            const views = await this.schemaCache.getViews(context.connectionId, context.database);
            for (const view of views) {
                if (context.prefix && !view.name.toLowerCase().startsWith(context.prefix.toLowerCase())) continue;
                const item = new vscode.CompletionItem(view.name, vscode.CompletionItemKind.Struct);
                item.detail = 'View';
                const docParts: string[] = [];
                if (view.comment) docParts.push(view.comment);
                if (view.definition) {
                    const summary = view.definition.length > 100 ? view.definition.substring(0, 100) + '...' : view.definition;
                    docParts.push(summary);
                }
                if (docParts.length > 0) {
                    item.documentation = new vscode.MarkdownString(docParts.join('\n\n'));
                }
                item.sortText = `1${view.name}`;
                items.push(item);
            }
        } catch (e) { handleError(e, 'SchemaProvider.addViewItems', ErrorCategory.FEATURE); }
    }

    private async addColumnItems(items: vscode.CompletionItem[], context: CompletionContext): Promise<void> {
        try {
            const tables = await this.schemaCache.getTables(context.connectionId, context.database);
            const prefix = context.prefix.toLowerCase();

            if (prefix.includes('.')) {
                const dotIndex = prefix.indexOf('.');
                const aliasPart = prefix.substring(0, dotIndex);
                const colPrefix = prefix.substring(dotIndex + 1);
                const tableName = this.resolveAlias(aliasPart, context.aliasMap);
                if (tableName) {
                    await this.addColumnsForTable(items, context, tableName, colPrefix);
                }
                return;
            }

            const aliasMap = context.aliasMap;
            if (aliasMap.size > 0) {
                // Limit concurrency (same as the no-alias branch below) so a
                // 10-table join does not trigger 10 concurrent column-fetch
                // queries against the database.
                await this.parallelWithLimit(
                    Array.from(aliasMap.values()).map((tableName): (() => Promise<void>) => () => this.addColumnsForTable(items, context, tableName, prefix)),
                    3
                );
            } else {
                // No alias map: fall back to scanning a bounded number of
                // tables. Rank by MRU recency so we pull columns for tables
                // the user actually uses rather than arbitrary schema order,
                // then cap at 10 to bound the number of CompletionItems.
                const limitedTables = this.rankTablesByMru(tables).slice(0, 10);
                await this.parallelWithLimit(
                    limitedTables.map((tbl): (() => Promise<void>) => () => this.addColumnsForTable(items, context, tbl.name, prefix)),
                    3
                );
            }
        } catch (e) { handleError(e, 'SchemaProvider.addColumnItems', ErrorCategory.FEATURE); }
    }

    /**
     * Order tables so that recently-used ones come first, while preserving
     * the original schema order for tables not present in the MRU cache.
     * Tables that appear in the MRU are sorted by recency (most recent
     * first); the remaining tables keep their original relative order and
     * are appended after the MRU tables. The result is intended to be
     * sliced to a small bound by the caller.
     */
    private rankTablesByMru(tables: { name: string }[]): { name: string }[] {
        const recentTables = this.mruTracker.getRecentTables();
        if (recentTables.length === 0) {
            return tables;
        }

        // Build a recency index: lower rank = more recent.
        const recencyRank = new Map<string, number>();
        recentTables.forEach((tbl, idx) => recencyRank.set(tbl.toLowerCase(), idx));

        const indexed = tables.map((tbl) => ({
            tbl,
            rank: recencyRank.has(tbl.name.toLowerCase())
                ? recencyRank.get(tbl.name.toLowerCase())!
                : Number.MAX_SAFE_INTEGER,
        }));

        // MRU tables sorted by recency (ascending rank); stable for ties.
        const mruTables = indexed
            .filter((entry) => entry.rank !== Number.MAX_SAFE_INTEGER)
            .sort((a, b) => a.rank - b.rank)
            .map((entry) => entry.tbl);

        // Non-MRU tables preserve original schema order.
        const nonMruTables = indexed
            .filter((entry) => entry.rank === Number.MAX_SAFE_INTEGER)
            .map((entry) => entry.tbl);

        return [...mruTables, ...nonMruTables];
    }

    private async addColumnsForTable(
        items: vscode.CompletionItem[],
        context: CompletionContext,
        tableName: string,
        prefix: string
    ): Promise<void> {
        try {
            const columns = await this.schemaCache.getColumns(context.connectionId, context.database, tableName);
            for (const col of columns) {
                if (prefix && !col.name.toLowerCase().startsWith(prefix)) continue;
                const item = new vscode.CompletionItem(col.name, vscode.CompletionItemKind.Field);
                const pkStr = col.isPrimaryKey ? ' · PK' : '';
                item.detail = `${col.type}${pkStr}`;
                const docParts: string[] = [];
                if (col.nullable) docParts.push('Nullable');
                if (col.defaultValue !== undefined) docParts.push(`Default: ${col.defaultValue}`);
                if (col.comment) docParts.push(col.comment);
                if (docParts.length > 0) {
                    item.documentation = new vscode.MarkdownString(docParts.join(' | '));
                }
                const pkSort = col.isPrimaryKey ? '0' : '1';
                const mruSort = this.mruTracker.isInMru(`${tableName}.${col.name}`.toLowerCase()) ? '0' : '1';
                item.sortText = `${mruSort}${pkSort}${col.name}`;
                setMruData(item, { type: 'column', key: `${tableName}.${col.name}`.toLowerCase() });
                items.push(item);
            }
        } catch (e) { handleError(e, 'SchemaProvider.addColumnsForTable', ErrorCategory.FEATURE); }
    }

    private async addProcedureItems(items: vscode.CompletionItem[], context: CompletionContext): Promise<void> {
        try {
            const procedures = await this.schemaCache.getProcedures(context.connectionId, context.database);
            for (const proc of procedures) {
                if (context.prefix && !proc.name.toLowerCase().startsWith(context.prefix.toLowerCase())) continue;
                const item = new vscode.CompletionItem(proc.name, vscode.CompletionItemKind.Method);
                item.detail = 'PROCEDURE';
                if (proc.definition) {
                    const summary = proc.definition.length > 100 ? proc.definition.substring(0, 100) + '...' : proc.definition;
                    item.documentation = new vscode.MarkdownString(summary);
                }
                item.sortText = `0${proc.name}`;
                items.push(item);
            }
        } catch (e) { handleError(e, 'SchemaProvider.addProcedureItems', ErrorCategory.FEATURE); }
    }

    private async addFunctionItems(items: vscode.CompletionItem[], context: CompletionContext): Promise<void> {
        try {
            const functions = await this.schemaCache.getFunctions(context.connectionId, context.database);
            for (const fn of functions) {
                if (context.prefix && !fn.name.toLowerCase().startsWith(context.prefix.toLowerCase())) continue;
                const item = new vscode.CompletionItem(fn.name, vscode.CompletionItemKind.Function);
                const returnStr = fn.returns ? ` → ${fn.returns}` : '';
                item.detail = `FUNCTION${returnStr}`;
                if (fn.definition) {
                    const summary = fn.definition.length > 100 ? fn.definition.substring(0, 100) + '...' : fn.definition;
                    item.documentation = new vscode.MarkdownString(summary);
                }
                item.sortText = `2${fn.name}`;
                items.push(item);
            }
        } catch (e) { handleError(e, 'SchemaProvider.addFunctionItems', ErrorCategory.FEATURE); }
    }

    private sortAndTruncate(items: vscode.CompletionItem[], prefix: string): vscode.CompletionItem[] {
        const lowerPrefix = prefix.toLowerCase();
        items.sort((a, b) => {
            const aLabel = typeof a.label === 'string' ? a.label : a.label.label;
            const bLabel = typeof b.label === 'string' ? b.label : b.label.label;
            const aLower = aLabel.toLowerCase();
            const bLower = bLabel.toLowerCase();

            const aExact = aLower === lowerPrefix ? 0 : 1;
            const bExact = bLower === lowerPrefix ? 0 : 1;
            if (aExact !== bExact) return aExact - bExact;

            const aPrefix = aLower.startsWith(lowerPrefix) ? 0 : 1;
            const bPrefix = bLower.startsWith(lowerPrefix) ? 0 : 1;
            if (aPrefix !== bPrefix) return aPrefix - bPrefix;

            const aContains = aLower.includes(lowerPrefix) ? 0 : 1;
            const bContains = bLower.includes(lowerPrefix) ? 0 : 1;
            if (aContains !== bContains) return aContains - bContains;

            return (a.sortText || aLabel).localeCompare(b.sortText || bLabel);
        });

        const MAX_ITEMS = 200;
        if (items.length > MAX_ITEMS) {
            const remaining = items.length - MAX_ITEMS;
            items.length = MAX_ITEMS;
            const hintItem = new vscode.CompletionItem(`... ${remaining} more matches, type more to narrow`, vscode.CompletionItemKind.Text);
            hintItem.sortText = 'zzz';
            hintItem.detail = '';
            items.push(hintItem);
        }
        return items;
    }

    private async parallelWithLimit<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
        const results: T[] = new Array<T>(tasks.length);
        let nextIndex = 0;
        const safeLimit = Math.max(1, limit);

        const worker = async (): Promise<void> => {
            while (nextIndex < tasks.length) {
                const index = nextIndex++;
                results[index] = await tasks[index]();
            }
        };

        const workers: Promise<void>[] = [];
        for (let i = 0; i < Math.min(safeLimit, tasks.length); i++) {
            workers.push(worker());
        }
        await Promise.all(workers);
        return results;
    }

    /**
     * Called when the user actually selects a completion item.
     * Updates the MRU cache based on the item's data, avoiding side effects
     * during item generation.
     *
     * Table selections are also recorded in the table-level MRU queue so
     * that {@link addColumnItems} can rank tables by recency when no
     * alias map is available.
     */
    resolveCompletionItem(item: vscode.CompletionItem): vscode.CompletionItem {
        const data = getMruData(item);
        if (data && data.key) {
            this.mruTracker.addToMru(data.key);
            if (data.type === 'table') {
                this.mruTracker.addTableToMru(data.key);
            }
        }
        return item;
    }

    async getTableHoverInfo(tableName: string, database: string): Promise<vscode.MarkdownString | null> {
        return this.hoverInfoProvider.getTableHoverInfo(tableName, database);
    }

    async getColumnHoverInfo(columnName: string, tableName: string, database: string): Promise<vscode.MarkdownString | null> {
        return this.hoverInfoProvider.getColumnHoverInfo(columnName, tableName, database);
    }

    dispose(): void {
        this.mruTracker.dispose();
    }
}

export function createSchemaProvider(): SchemaProvider {
    return new SchemaProvider();
}

export function getSchemaProvider(): SchemaProvider {
    return getContainer().get<SchemaProvider>(Tokens.SchemaProvider);
}
