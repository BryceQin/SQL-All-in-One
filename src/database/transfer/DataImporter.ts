import * as fs from 'fs';
import * as readline from 'readline';
import { IDatabaseAdapter } from '../adapters/IDatabaseAdapter';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface ImportError {
    row: number;
    message: string;
    data: string;
}

export interface ImportResult {
    success: boolean;
    totalRows: number;
    importedRows: number;
    skippedRows: number;
    errors: ImportError[];
}

export interface CsvImportOptions {
    delimiter?: string;
    encoding?: string;
    hasHeaders?: boolean;
    batchSize?: number;
    onError: 'skip' | 'abort';
    dedupStrategy: 'ignore' | 'skip' | 'update';
    mapping?: Record<string, string>;
}

export interface JsonImportOptions {
    batchSize?: number;
    onError: 'skip' | 'abort';
    dedupStrategy: 'ignore' | 'skip' | 'update';
}

// ---------------------------------------------------------------------------
// Helper: parseCsvLine
// ---------------------------------------------------------------------------

/**
 * Parses a single CSV line, handling quoted fields and escaped quotes.
 * Fields enclosed in double quotes may contain the delimiter, newlines,
 * and escaped double quotes (represented as "").
 */
export function parseCsvLine(line: string, delimiter: string): string[] {
    const fields: string[] = [];
    let i = 0;
    const len = line.length;

    while (i <= len) {
        // Start of a new field
        if (i === len) {
            // Trailing delimiter – push empty field
            fields.push('');
            break;
        }

        if (line[i] === '"') {
            // Quoted field
            i++; // skip opening quote
            let field = '';
            while (i < len) {
                if (line[i] === '"') {
                    if (i + 1 < len && line[i + 1] === '"') {
                        // Escaped quote ""
                        field += '"';
                        i += 2;
                    } else {
                        // Closing quote
                        i++; // skip closing quote
                        break;
                    }
                } else {
                    field += line[i];
                    i++;
                }
            }
            fields.push(field);
            // Skip delimiter after quoted field
            if (i < len && line[i] === delimiter) {
                i++;
            }
        } else {
            // Unquoted field – read until delimiter or end
            let field = '';
            while (i < len && line[i] !== delimiter) {
                field += line[i];
                i++;
            }
            fields.push(field);
            if (i < len && line[i] === delimiter) {
                i++; // skip delimiter
            }
        }
    }

    return fields;
}

// ---------------------------------------------------------------------------
// Helper: formatSqlValue
// ---------------------------------------------------------------------------

/**
 * Formats a JavaScript value for inclusion in a SQL statement.
 * - null / undefined  -> NULL
 * - number            -> literal number
 * - boolean           -> 1 / 0
 * - string            -> single-quoted with escaped inner quotes
 */
export function formatSqlValue(value: unknown): string {
    if (value === null || value === undefined) {
        return 'NULL';
    }
    if (typeof value === 'number') {
        return String(value);
    }
    if (typeof value === 'boolean') {
        return value ? '1' : '0';
    }
    if (value instanceof Date) {
        return `'${value.toISOString()}'`;
    }
    return `'${String(value).replace(/'/g, "''")}'`;
}

// ---------------------------------------------------------------------------
// Helper: executeBatchInsert
// ---------------------------------------------------------------------------

/**
 * Executes a batch INSERT statement. If the batch fails and `onError` is
 * `'skip'`, falls back to row-by-row insertion so that individual failing
 * rows are skipped without aborting the entire import.
 */
export async function executeBatchInsert(
    adapter: IDatabaseAdapter,
    tableName: string,
    columns: string[],
    batch: Record<string, unknown>[],
    onError: 'skip' | 'abort',
    startRow: number,
): Promise<{ imported: number; skipped: number; errors: ImportError[] }> {
    const quotedColumns = columns.map((c) => `\`${c}\``).join(', ');
    const valueGroups = batch.map((row) => {
        const values = columns.map((col) => formatSqlValue(row[col]));
        return `(${values.join(', ')})`;
    });

    const sql = `INSERT INTO \`${tableName}\` (${quotedColumns}) VALUES ${valueGroups.join(', ')};`;

    let imported = 0;
    let skipped = 0;
    const errors: ImportError[] = [];

    try {
        await adapter.execute(sql);
        imported = batch.length;
    } catch (batchError: unknown) {
        if (onError === 'abort') {
            throw batchError;
        }
        // Fall back to row-by-row insertion
        for (let i = 0; i < batch.length; i++) {
            const row = batch[i];
            const rowValues = columns.map((col) => formatSqlValue(row[col]));
            const rowSql = `INSERT INTO \`${tableName}\` (${quotedColumns}) VALUES (${rowValues.join(', ')});`;
            try {
                await adapter.execute(rowSql);
                imported++;
            } catch (rowError: unknown) {
                skipped++;
                errors.push({
                    row: startRow + i,
                    message: rowError instanceof Error ? rowError.message : String(rowError),
                    data: JSON.stringify(row),
                });
            }
        }
    }

    return { imported, skipped, errors };
}

// ---------------------------------------------------------------------------
// detectCsvDelimiter
// ---------------------------------------------------------------------------

/**
 * Auto-detects the CSV delimiter by counting occurrences of common delimiters
 * (comma, tab, semicolon) in the first line and returning the one with the
 * highest count.
 */
export function detectCsvDelimiter(firstLine: string): string {
    const candidates = [',', '\t', ';'];
    let best = ',';
    let bestCount = 0;

    for (const candidate of candidates) {
        const count = firstLine.split(candidate).length - 1;
        if (count > bestCount) {
            bestCount = count;
            best = candidate;
        }
    }

    return best;
}

// ---------------------------------------------------------------------------
// detectFileFormat
// ---------------------------------------------------------------------------

/**
 * Detects the file format from its extension. Returns `'csv'`, `'json'`, or
 * `'sql'`. Throws if the extension is not recognised.
 */
export function detectFileFormat(filePath: string): 'csv' | 'json' | 'sql' {
    const ext = filePath.split('.').pop()?.toLowerCase();
    switch (ext) {
        case 'csv':
        case 'tsv':
            return 'csv';
        case 'json':
        case 'jsonl':
            return 'json';
        case 'sql':
            return 'sql';
        default:
            throw new Error(`Unsupported file format: .${ext}`);
    }
}

// ---------------------------------------------------------------------------
// importFromCsv
// ---------------------------------------------------------------------------

/**
 * Reads a CSV file line by line, parses rows with the configured delimiter,
 * applies optional field mapping, and inserts data in batches.
 */
export async function importFromCsv(
    adapter: IDatabaseAdapter,
    tableName: string,
    filePath: string,
    options: CsvImportOptions,
): Promise<ImportResult> {
    const delimiter = options.delimiter ?? ',';
    const hasHeaders = options.hasHeaders ?? true;
    const batchSize = options.batchSize ?? 100;
    const encoding = options.encoding ?? 'utf-8';

    const errors: ImportError[] = [];
    let totalRows = 0;
    let importedRows = 0;
    let skippedRows = 0;

    const stream = fs.createReadStream(filePath, { encoding: encoding as BufferEncoding });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    let headers: string[] = [];
    let lineIndex = 0;
    let batch: Record<string, unknown>[] = [];
    let batchStartRow = 0;

    const flushBatch = async (): Promise<void> => {
        if (batch.length === 0) {
            return;
        }
        const result = await executeBatchInsert(adapter, tableName, headers, batch, options.onError, batchStartRow);
        importedRows += result.imported;
        skippedRows += result.skipped;
        errors.push(...result.errors);
        batch = [];
    };

    for await (const line of rl) {
        // Skip empty lines
        if (line.trim() === '') {
            lineIndex++;
            continue;
        }

        if (lineIndex === 0 && hasHeaders) {
            headers = parseCsvLine(line, delimiter);
            // Apply mapping: rename header keys
            if (options.mapping) {
                headers = headers.map((h) => options.mapping?.[h] ?? h);
            }
            lineIndex++;
            continue;
        }

        totalRows++;
        const rawFields = parseCsvLine(line, delimiter);

        if (lineIndex === 0 && !hasHeaders) {
            // No headers – generate column names col_0, col_1, …
            if (headers.length === 0) {
                headers = rawFields.map((_, idx) => `col_${idx}`);
            }
        }

        const row: Record<string, unknown> = {};
        for (let i = 0; i < headers.length; i++) {
            const value = i < rawFields.length ? rawFields[i] : null;
            row[headers[i]] = value === '' ? null : value;
        }

        if (batch.length === 0) {
            batchStartRow = totalRows;
        }
        batch.push(row);

        if (batch.length >= batchSize) {
            try {
                await flushBatch();
            } catch (err: unknown) {
                if (options.onError === 'abort') {
                    rl.close();
                    stream.destroy();
                    return {
                        success: false,
                        totalRows,
                        importedRows,
                        skippedRows,
                        errors: [
                            ...errors,
                            {
                                row: batchStartRow,
                                message: err instanceof Error ? err.message : String(err),
                                data: '',
                            },
                        ],
                    };
                }
            }
        }

        lineIndex++;
    }

    // Flush remaining batch
    try {
        await flushBatch();
    } catch (err: unknown) {
        if (options.onError === 'abort') {
            return {
                success: false,
                totalRows,
                importedRows,
                skippedRows,
                errors: [
                    ...errors,
                    {
                        row: batchStartRow,
                        message: err instanceof Error ? err.message : String(err),
                        data: '',
                    },
                ],
            };
        }
    }

    return {
        success: errors.length === 0,
        totalRows,
        importedRows,
        skippedRows,
        errors,
    };
}

// ---------------------------------------------------------------------------
// importFromJson
// ---------------------------------------------------------------------------

/**
 * Reads a JSON file containing an array of objects, maps keys to columns,
 * and inserts data in batches.
 */
export async function importFromJson(
    adapter: IDatabaseAdapter,
    tableName: string,
    filePath: string,
    options: JsonImportOptions,
): Promise<ImportResult> {
    const batchSize = options.batchSize ?? 100;

    const errors: ImportError[] = [];
    let importedRows = 0;
    let skippedRows = 0;

    const raw = await fs.promises.readFile(filePath, 'utf-8');
    const records: unknown[] = JSON.parse(raw);

    if (!Array.isArray(records)) {
        return {
            success: false,
            totalRows: 0,
            importedRows: 0,
            skippedRows: 0,
            errors: [{ row: 0, message: 'JSON file must contain an array', data: '' }],
        };
    }

    const totalRows = records.length;

    // Derive columns from all record keys (preserving first-seen order)
    const columnSet = new Set<string>();
    for (const record of records) {
        if (record && typeof record === 'object') {
            for (const key of Object.keys(record as Record<string, unknown>)) {
                columnSet.add(key);
            }
        }
    }
    const columns = Array.from(columnSet);

    if (columns.length === 0) {
        return {
            success: false,
            totalRows,
            importedRows: 0,
            skippedRows: 0,
            errors: [{ row: 0, message: 'No columns found in JSON data', data: '' }],
        };
    }

    // Build rows
    const rows: Record<string, unknown>[] = records.map((record, idx) => {
        if (!record || typeof record !== 'object') {
            errors.push({
                row: idx + 1,
                message: 'Record is not an object',
                data: String(record),
            });
            return {};
        }
        const obj = record as Record<string, unknown>;
        const row: Record<string, unknown> = {};
        for (const col of columns) {
            row[col] = obj[col] ?? null;
        }
        return row;
    });

    // Insert in batches
    for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        try {
            const result = await executeBatchInsert(adapter, tableName, columns, batch, options.onError, i + 1);
            importedRows += result.imported;
            skippedRows += result.skipped;
            errors.push(...result.errors);
        } catch (err: unknown) {
            if (options.onError === 'abort') {
                return {
                    success: false,
                    totalRows,
                    importedRows,
                    skippedRows,
                    errors: [
                        ...errors,
                        {
                            row: i + 1,
                            message: err instanceof Error ? err.message : String(err),
                            data: '',
                        },
                    ],
                };
            }
            skippedRows += batch.length;
        }
    }

    return {
        success: errors.length === 0,
        totalRows,
        importedRows,
        skippedRows,
        errors,
    };
}

// ---------------------------------------------------------------------------
// importFromSql
// ---------------------------------------------------------------------------

/**
 * Reads a SQL file, splits by semicolons, and executes each non-empty
 * statement sequentially.
 */
export async function importFromSql(
    adapter: IDatabaseAdapter,
    filePath: string,
): Promise<ImportResult> {
    const raw = await fs.promises.readFile(filePath, 'utf-8');

    // Split by semicolons, filter out empty / whitespace-only statements
    const statements = raw
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

    const totalRows = statements.length;
    let importedRows = 0;
    let skippedRows = 0;
    const errors: ImportError[] = [];

    for (let i = 0; i < statements.length; i++) {
        const sql = statements[i] + ';';
        try {
            await adapter.execute(sql);
            importedRows++;
        } catch (err: unknown) {
            skippedRows++;
            errors.push({
                row: i + 1,
                message: err instanceof Error ? err.message : String(err),
                data: sql,
            });
        }
    }

    return {
        success: errors.length === 0,
        totalRows,
        importedRows,
        skippedRows,
        errors,
    };
}
