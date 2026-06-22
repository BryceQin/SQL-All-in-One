import * as vscode from 'vscode';
import { getSchemaCache } from './SchemaCache';
import { getConnectionManager } from '../connection/ConnectionManager';
import { handleError, ErrorCategory } from '../../core/errorHandler';

/**
 * Builds MarkdownString hover documentation for schema objects (tables and
 * columns). This class encapsulates all hover-related rendering so that
 * {@link SchemaProvider} can stay focused on completion item generation.
 *
 * Instances are created and owned by {@link SchemaProvider}; the public
 * methods mirror the previous `SchemaProvider` hover API so callers
 * (e.g. `SchemaHoverResolver`) are unaffected by the split.
 */
export class HoverInfoProvider {
    private schemaCache = getSchemaCache();

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
            handleError(e, 'HoverInfoProvider.getTableHoverInfo', ErrorCategory.FEATURE);
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
            handleError(e, 'HoverInfoProvider.getColumnHoverInfo', ErrorCategory.FEATURE);
            return null;
        }
    }
}
