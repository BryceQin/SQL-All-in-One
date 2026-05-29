import * as vscode from 'vscode';
import { getSchemaCache } from './SchemaCache';
import { getConnectionManager } from '../connection/ConnectionManager';
import { getParserEngine } from '../../parser/SqlParserEngine';
import type { SqlDialect } from '../../parser/dialectMapper';
import type { ColumnInfo } from '../adapters/IDatabaseAdapter';
import { isAstNode } from '../../parser/AstVisitor';
import type { AstNode } from '../../parser/astTypes';
import { handleError, ErrorCategory } from '../../core/errorHandler';
import { getContainer, Tokens } from '../../core/diContainer';

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

export class SchemaProvider {
    private schemaCache = getSchemaCache();
    private mruCache = new Map<string, number>();
    private static readonly MRU_MAX_SIZE = 50;

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
        } catch {
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
                items.push(item);
                this.touchMru(db.name);
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
                items.push(item);
                this.touchMru(tbl.name);
            }
        } catch (e) { handleError(e, 'SchemaProvider.addTableItems', ErrorCategory.FEATURE); }
    }

    private async addViewItems(items: vscode.CompletionItem[], context: CompletionContext): Promise<void> {
        try {
            const adapter = getConnectionManager().getAdapter(context.connectionId);
            if (!adapter) return;
            const views = await adapter.listViews(context.database);
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
                for (const [, tableName] of aliasMap) {
                    await this.addColumnsForTable(items, context, tableName, prefix);
                }
            } else {
                for (const tbl of tables) {
                    await this.addColumnsForTable(items, context, tbl.name, prefix);
                }
            }
        } catch (e) { handleError(e, 'SchemaProvider.addColumnItems', ErrorCategory.FEATURE); }
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
                const mruSort = this.mruCache.has(`${tableName}.${col.name}`.toLowerCase()) ? '0' : '1';
                item.sortText = `${mruSort}${pkSort}${col.name}`;
                items.push(item);
                this.touchMru(`${tableName}.${col.name}`);
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

    private touchMru(key: string): void {
        const lowerKey = key.toLowerCase();
        this.mruCache.delete(lowerKey);
        this.mruCache.set(lowerKey, Date.now());
        if (this.mruCache.size > SchemaProvider.MRU_MAX_SIZE) {
            const lruKey = this.mruCache.keys().next().value as string;
            this.mruCache.delete(lruKey);
        }
    }

    async getTableHoverInfo(tableName: string, database: string): Promise<vscode.MarkdownString | null> {
        const activeConn = getConnectionManager().getActiveConnection();
        if (!activeConn) return null;
        const adapter = getConnectionManager().getAdapter(activeConn.id);
        if (!adapter) return null;

        try {
            const structure = await adapter.describeTable(database, tableName);
            const md = new vscode.MarkdownString();
            md.isTrusted = true;
            md.appendMarkdown(`### 📋 ${tableName}\n\n`);
            md.appendMarkdown(`---\n\n`);

            const metaParts: string[] = [];
            if (structure.engine) metaParts.push(`Engine: ${structure.engine}`);
            if (structure.rowCount !== undefined) metaParts.push(`Rows: ${structure.rowCount}`);
            if (structure.charset) metaParts.push(`Charset: ${structure.charset}`);
            if (structure.comment) metaParts.push(`Comment: ${structure.comment}`);
            if (metaParts.length > 0) {
                md.appendMarkdown(metaParts.join(' | ') + '\n\n');
            }

            md.appendMarkdown('| Column | Type | Nullable | Key | Default | Comment |\n');
            md.appendMarkdown('|--------|------|----------|-----|---------|---------|\n');
            for (const col of structure.columns) {
                const key = col.isPrimaryKey ? '**PK**' : col.isUnique ? 'UQ' : '';
                const nullable = col.nullable ? '✓' : '✗';
                const defaultVal = col.defaultValue !== undefined ? String(col.defaultValue) : '';
                const comment = col.comment || '';
                md.appendMarkdown(`| ${col.name} | ${col.type} | ${nullable} | ${key} | ${defaultVal} | ${comment} |\n`);
            }

            return md;
        } catch (e) {
            handleError(e, 'SchemaProvider.getTableHoverInfo', ErrorCategory.FEATURE);
            return null;
        }
    }

    async getColumnHoverInfo(columnName: string, tableName: string, database: string): Promise<vscode.MarkdownString | null> {
        const activeConn = getConnectionManager().getActiveConnection();
        if (!activeConn) return null;

        try {
            const columns = await this.schemaCache.getColumns(activeConn.id, database, tableName);
            const col = columns.find(c => c.name.toLowerCase() === columnName.toLowerCase());
            if (!col) return null;

            const md = new vscode.MarkdownString();
            md.isTrusted = true;
            md.appendMarkdown(`### 🔹 ${col.name}\n\n`);
            md.appendMarkdown(`---\n\n`);

            const parts: string[] = [];
            parts.push(`**Type**: \`${col.type}\``);
            parts.push(`**Nullable**: ${col.nullable ? 'Yes' : 'No'}`);
            if (col.isPrimaryKey) parts.push('**Key**: PK');
            if (col.isUnique) parts.push('**Key**: UQ');
            if (col.defaultValue !== undefined) parts.push(`**Default**: \`${col.defaultValue}\``);
            if (col.isAutoIncrement) parts.push('**Auto Increment**: Yes');
            if (col.comment) parts.push(`**Comment**: ${col.comment}`);
            if (col.referencedTable) parts.push(`**References**: \`${col.referencedTable}\``);

            md.appendMarkdown(parts.join(' | ') + '\n\n');
            md.appendMarkdown(`*Table: \`${tableName}\`*`);

            return md;
        } catch (e) {
            handleError(e, 'SchemaProvider.getColumnHoverInfo', ErrorCategory.FEATURE);
            return null;
        }
    }

    dispose(): void {
        this.mruCache.clear();
    }
}

export function createSchemaProvider(): SchemaProvider {
    return new SchemaProvider();
}

export function getSchemaProvider(): SchemaProvider {
    return getContainer().get<SchemaProvider>(Tokens.SchemaProvider);
}
