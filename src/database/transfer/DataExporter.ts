import * as vscode from 'vscode';
import * as fs from 'fs';
import { ColumnMeta, IDatabaseAdapter, QueryRow } from '../adapters/IDatabaseAdapter';

export interface CsvExportOptions {
    delimiter?: string;
    encoding?: string;
    includeHeaders?: boolean;
}

export interface JsonExportOptions {
    prettyPrint?: boolean;
}

export interface InsertExportOptions {
    batchSize?: number;
}

export class DataExporter {
    async exportToCsv(rows: QueryRow[], columns: ColumnMeta[], options?: CsvExportOptions): Promise<void> {
        const config = vscode.workspace.getConfiguration('SQL-All-in-One');
        const delimiter = options?.delimiter ?? config.get<string>('export.csvDelimiter', ',');
        const encoding = options?.encoding ?? config.get<string>('export.csvEncoding', 'utf-8');
        const includeHeaders = options?.includeHeaders ?? config.get<boolean>('export.includeHeaders', true);

        const uri = await vscode.window.showSaveDialog({
            filters: { 'CSV Files': ['csv'] },
            defaultUri: vscode.Uri.file('export.csv'),
        });

        if (!uri) {
            return;
        }

        const lines: string[] = [];

        if (includeHeaders) {
            lines.push(columns.map((col) => this.escapeCsvField(col.name, delimiter)).join(delimiter));
        }

        for (const row of rows) {
            const values = columns.map((col) => {
                const value = row[col.name];
                if (value === null || value === undefined) {
                    return '';
                }
                return this.escapeCsvField(String(value), delimiter);
            });
            lines.push(values.join(delimiter));
        }

        const content = lines.join('\n');
        await fs.promises.writeFile(uri.fsPath, content, { encoding: encoding as BufferEncoding });
        vscode.window.setStatusBarMessage('Export completed', 3000);
    }

    async exportToJson(rows: QueryRow[], columns: ColumnMeta[], options?: JsonExportOptions): Promise<void> {
        const config = vscode.workspace.getConfiguration('SQL-All-in-One');
        const prettyPrint = options?.prettyPrint ?? config.get<boolean>('export.jsonPrettyPrint', true);

        const uri = await vscode.window.showSaveDialog({
            filters: { 'JSON Files': ['json'] },
            defaultUri: vscode.Uri.file('export.json'),
        });

        if (!uri) {
            return;
        }

        const result = rows.map((row) => {
            const obj: Record<string, unknown> = {};
            for (const col of columns) {
                const value = row[col.name];
                obj[col.name] = this.convertJsonValue(value);
            }
            return obj;
        });

        const content = JSON.stringify(result, null, prettyPrint ? 2 : undefined);
        await fs.promises.writeFile(uri.fsPath, content, 'utf-8');
        vscode.window.setStatusBarMessage('Export completed', 3000);
    }

    async exportToInsert(rows: QueryRow[], columns: ColumnMeta[], tableName: string, options?: InsertExportOptions): Promise<void> {
        const batchSize = options?.batchSize ?? 1;

        const uri = await vscode.window.showSaveDialog({
            filters: { 'SQL Files': ['sql'] },
            defaultUri: vscode.Uri.file('export.sql'),
        });

        if (!uri) {
            return;
        }

        const columnNames = columns.map((col) => `\`${col.name}\``).join(', ');
        const lines: string[] = [];

        for (let i = 0; i < rows.length; i += batchSize) {
            const batch = rows.slice(i, i + batchSize);
            const valueGroups = batch.map((row) => {
                const values = columns.map((col) => this.formatSqlValue(row[col.name]));
                return `(${values.join(', ')})`;
            });
            lines.push(`INSERT INTO \`${tableName}\` (${columnNames}) VALUES ${valueGroups.join(', ')};`);
        }

        const content = lines.join('\n');
        await fs.promises.writeFile(uri.fsPath, content, 'utf-8');
        vscode.window.setStatusBarMessage('Export completed', 3000);
    }

    async exportToDdl(adapter: IDatabaseAdapter, database: string, table: string): Promise<void> {
        const uri = await vscode.window.showSaveDialog({
            filters: { 'SQL Files': ['sql'] },
            defaultUri: vscode.Uri.file(`${table}.sql`),
        });

        if (!uri) {
            return;
        }

        const ddl = await adapter.getTableDDL(database, table);
        await fs.promises.writeFile(uri.fsPath, ddl, 'utf-8');
        vscode.window.setStatusBarMessage('Export completed', 3000);
    }

    async exportToExcel(): Promise<void> {
        throw new Error('Excel export will be available in a future update');
    }

    private escapeCsvField(value: string, delimiter: string): string {
        if (value.includes(delimiter) || value.includes('\n') || value.includes('"')) {
            return '"' + value.replace(/"/g, '""') + '"';
        }
        return value;
    }

    private convertJsonValue(value: unknown): unknown {
        if (value === null || value === undefined) {
            return null;
        }
        if (value instanceof Date) {
            return value.toISOString();
        }
        if (Buffer.isBuffer(value)) {
            return value.toString('base64');
        }
        if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
            return Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('base64');
        }
        return value;
    }

    private formatSqlValue(value: unknown): string {
        if (value === null || value === undefined) {
            return 'NULL';
        }
        if (typeof value === 'number') {
            return String(value);
        }
        if (typeof value === 'boolean') {
            return String(value);
        }
        if (value instanceof Date) {
            return `'${value.toISOString()}'`;
        }
        return `'${String(value).replace(/'/g, "''")}'`;
    }
}
