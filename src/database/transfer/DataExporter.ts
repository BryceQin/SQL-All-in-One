import * as vscode from 'vscode';
import * as fs from 'fs';
import { ColumnMeta, QueryRow } from '../adapters/IDatabaseAdapter';
import type { DatabaseAdapter } from '../adapters/AdapterFactory';
import { t } from '../../i18n/index';
import { formatSqlValue } from './sqlFormatUtils';

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

        const stream = fs.createWriteStream(uri.fsPath, { encoding: encoding as BufferEncoding });

        try {
            if (includeHeaders) {
                stream.write(columns.map((col) => this.escapeCsvField(col.name, delimiter)).join(delimiter) + '\n');
            }

            for (const row of rows) {
                const values = columns.map((col) => {
                    const value = row[col.name];
                    if (value === null || value === undefined) {
                        return '';
                    }
                    return this.escapeCsvField(String(value), delimiter);
                });
                stream.write(values.join(delimiter) + '\n');
            }

            await this.finishStream(stream);
            vscode.window.setStatusBarMessage(t('database.exportCompleted'), 3000);
        } catch (error) {
            stream.destroy();
            throw error;
        }
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

        const stream = fs.createWriteStream(uri.fsPath, 'utf-8');
        const indent = prettyPrint ? 2 : 0;

        try {
            stream.write('[\n');

            for (let i = 0; i < rows.length; i++) {
                const obj: Record<string, unknown> = {};
                for (const col of columns) {
                    const value = rows[i][col.name];
                    obj[col.name] = this.convertJsonValue(value);
                }
                const jsonStr = JSON.stringify(obj, null, indent > 0 ? indent : undefined);
                const suffix = i < rows.length - 1 ? ',' : '';
                stream.write((i > 0 ? '\n' : '') + jsonStr + suffix);
            }

            stream.write('\n]');

            await this.finishStream(stream);
            vscode.window.setStatusBarMessage(t('database.exportCompleted'), 3000);
        } catch (error) {
            stream.destroy();
            throw error;
        }
    }

    async exportToInsert(rows: QueryRow[], columns: ColumnMeta[], tableName: string, options?: InsertExportOptions, adapter?: DatabaseAdapter): Promise<void> {
        const batchSize = options?.batchSize ?? 1;

        const uri = await vscode.window.showSaveDialog({
            filters: { 'SQL Files': ['sql'] },
            defaultUri: vscode.Uri.file('export.sql'),
        });

        if (!uri) {
            return;
        }

        const q = adapter ? adapter.schemaAdapter.quoteIdentifier.bind(adapter.schemaAdapter) : ((id: string): string => '`' + id.replace(/`/g, '``') + '`');
        const columnNames = columns.map((col) => q(col.name)).join(', ');
        const stream = fs.createWriteStream(uri.fsPath, 'utf-8');

        try {
            for (let i = 0; i < rows.length; i += batchSize) {
                const batch = rows.slice(i, i + batchSize);
                const valueGroups = batch.map((row) => {
                    const values = columns.map((col) => formatSqlValue(row[col.name]));
                    return `(${values.join(', ')})`;
                });
                stream.write(`INSERT INTO ${q(tableName)} (${columnNames}) VALUES ${valueGroups.join(', ')};\n`);
            }

            await this.finishStream(stream);
            vscode.window.setStatusBarMessage(t('database.exportCompleted'), 3000);
        } catch (error) {
            stream.destroy();
            throw error;
        }
    }

    async exportToDdl(adapter: DatabaseAdapter, database: string, table: string): Promise<void> {
        const uri = await vscode.window.showSaveDialog({
            filters: { 'SQL Files': ['sql'] },
            defaultUri: vscode.Uri.file(`${table}.sql`),
        });

        if (!uri) {
            return;
        }

        const ddl = await adapter.schemaAdapter.getTableDDL(database, table);
        await fs.promises.writeFile(uri.fsPath, ddl, 'utf-8');
        vscode.window.setStatusBarMessage(t('database.exportCompleted'), 3000);
    }

    async exportToExcel(): Promise<void> {
        throw new Error(t('database.excelNotAvailable'));
    }

    /**
     * 结束写入流并等待其完全关闭。
     *
     * 必须先注册 `error` listener 再调用 `end()`：若在 `end()` 之后才注册
     * error listener，则 end 过程中（或此前未消费的错误）触发的 error 事件
     * 可能被错过，导致 Promise 永远不 resolve/reject（Node.js 流处理常见 bug）。
     */
    private finishStream(stream: fs.WriteStream): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            stream.on('error', reject);
            stream.end(() => resolve());
        });
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

}
