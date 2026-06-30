import * as fs from 'fs';
import * as readline from 'readline';
import { IDatabaseAdapter, QueryParam } from '../adapters/IDatabaseAdapter';
import { t } from '../../i18n/index';
import { SqlTextScanner } from '../../utils/sqlTextScanner';

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
// Helper: executeBatchInsert
// ---------------------------------------------------------------------------

/**
 * Converts a JavaScript value to a QueryParam value for parameterized queries.
 * - null / undefined  -\> null
 * - number / boolean  -\> passed as-is
 * - Date              -\> ISO string
 * - string            -\> passed as-is (no quoting needed; parameterized queries handle escaping)
 */
function toQueryParamValue(value: unknown): string | number | boolean | null | undefined {
    if (value === null || value === undefined) {
        return null;
    }
    if (value instanceof Date) {
        return value.toISOString();
    }
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') {
        return value;
    }
    return String(value);
}

/**
 * Executes a batch INSERT statement using parameterized queries to prevent
 * SQL injection. If the batch fails and `onError` is `'skip'`, falls back
 * to row-by-row insertion so that individual failing rows are skipped
 * without aborting the entire import.
 */
export async function executeBatchInsert(
    adapter: IDatabaseAdapter,
    tableName: string,
    columns: string[],
    batch: Record<string, unknown>[],
    onError: 'skip' | 'abort',
    startRow: number,
): Promise<{ imported: number; skipped: number; errors: ImportError[] }> {
    const q = adapter.quoteIdentifier.bind(adapter);
    const quotedColumns = columns.map((c) => q(c)).join(', ');
    const placeholdersPerRow = `(${columns.map(() => '?').join(', ')})`;

    // Build batch SQL: INSERT INTO "table" ("col1", "col2") VALUES (?, ?), (?, ?), ...
    const valueGroups = batch.map(() => placeholdersPerRow);
    const sql = `INSERT INTO ${q(tableName)} (${quotedColumns}) VALUES ${valueGroups.join(', ')};`;

    // Flatten all row values into a single params array
    const params: QueryParam[] = [];
    for (const row of batch) {
        for (const col of columns) {
            params.push({ value: toQueryParamValue(row[col]) });
        }
    }

    let imported = 0;
    let skipped = 0;
    const errors: ImportError[] = [];

    try {
        await adapter.execute(sql, params);
        imported = batch.length;
    } catch (batchError: unknown) {
        if (onError === 'abort') {
            throw batchError;
        }
        // Fallback: insert rows one by one
        const rowSql = `INSERT INTO ${q(tableName)} (${quotedColumns}) VALUES ${placeholdersPerRow};`;
        for (let i = 0; i < batch.length; i++) {
            const row = batch[i];
            const rowParams = columns.map((col) => ({ value: toQueryParamValue(row[col]) }));
            try {
                await adapter.execute(rowSql, rowParams);
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
            throw new Error(t('database.unsupportedFileFormat', ext || ''));
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
const MAX_JSON_FILE_SIZE = 50 * 1024 * 1024;
const MAX_SQL_FILE_SIZE = 50 * 1024 * 1024;

/**
 * Streaming parser for a top-level JSON array file.
 *
 * Reads the file via `fs.createReadStream` and incrementally splits the
 * array into individual elements, each parsed with `JSON.parse`. This keeps
 * memory footprint proportional to the largest element (plus the active
 * batch) rather than to the whole file.
 *
 * The parser is a small character state machine that tracks:
 *   - `depth`: bracket nesting (`[`/`{` increase, `]`/`}` decrease); depth 1
 *     is the array element layer.
 *   - `inString`/`escape`: whether the cursor is inside a JSON string, so
 *     brackets/commas inside strings never affect depth or element bounds.
 *
 * Element boundaries are detected at depth 1 on `,` (separator) or `]`
 * (array close). Each extracted element substring is `JSON.parse`d and handed
 * to `onElement`. Elements may be objects, arrays, or scalars.
 *
 * If the first non-whitespace character is not `[`, `notArray` is reported
 * without throwing, so callers can produce a friendly error.
 */
async function streamJsonArray(
    filePath: string,
    onElement: (element: unknown, index: number) => Promise<void> | void,
): Promise<{ count: number; notArray: boolean }> {
    const stream = fs.createReadStream(filePath, 'utf-8');
    let count = 0;
    let notArray = false;

    let depth = 0;            // bracket depth; 1 == array element layer
    let arrayStarted = false; // top-level '[' seen
    let arrayClosed = false;  // top-level ']' seen
    let inString = false;     // cursor inside a JSON string
    let escape = false;       // previous char was backslash (inside string)
    let elementBuf = '';      // accumulating current element text
    let elementActive = false; // true while accumulating an element

    const flushElement = async (text: string): Promise<void> => {
        const trimmed = text.trim();
        if (trimmed === '') {
            return;
        }
        const value: unknown = JSON.parse(trimmed);
        await onElement(value, count);
        count++;
    };

    try {
        for await (const chunk of stream) {
            const s = chunk as unknown as string;
            for (const c of s) {
                if (arrayClosed) {
                    // Only trailing whitespace allowed after the top-level array.
                    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
                        continue;
                    }
                    throw new SyntaxError(`Unexpected character '${c}' after top-level array`);
                }

                if (inString) {
                    elementBuf += c;
                    if (escape) {
                        escape = false;
                    } else if (c === '\\') {
                        escape = true;
                    } else if (c === '"') {
                        inString = false;
                    }
                    continue;
                }

                if (c === '"') {
                    if (!arrayStarted) {
                        // Top-level string -> not an array.
                        notArray = true;
                        return { count, notArray };
                    }
                    inString = true;
                    elementBuf += c;
                    elementActive = true;
                    continue;
                }

                if (!arrayStarted) {
                    // Skip leading whitespace, expect '['.
                    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
                        continue;
                    }
                    if (c === '[') {
                        arrayStarted = true;
                        depth = 1;
                        continue;
                    }
                    // Top-level non-array value.
                    notArray = true;
                    return { count, notArray };
                }

                // arrayStarted, depth >= 1
                if (c === '[' || c === '{') {
                    if (depth === 1) {
                        // Start of a new object/array element.
                        elementBuf = c;
                        elementActive = true;
                    } else {
                        elementBuf += c;
                    }
                    depth++;
                    continue;
                }

                if (c === ']' || c === '}') {
                    depth--;
                    if (depth === 1) {
                        // End of an object/array element.
                        elementBuf += c;
                        await flushElement(elementBuf);
                        elementBuf = '';
                        elementActive = false;
                    } else if (depth === 0) {
                        if (c === ']') {
                            // End of top-level array; flush a trailing scalar
                            // element that was not followed by a comma.
                            if (elementActive && elementBuf.trim() !== '') {
                                await flushElement(elementBuf);
                                elementBuf = '';
                                elementActive = false;
                            }
                            arrayClosed = true;
                        } else {
                            // '}' bringing depth to 0 means top-level was an
                            // object, not an array.
                            notArray = true;
                            return { count, notArray };
                        }
                    } else {
                        elementBuf += c;
                    }
                    continue;
                }

                if (depth === 1) {
                    // Element layer, outside any object/array.
                    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
                        continue;
                    }
                    if (c === ',') {
                        if (elementActive && elementBuf.trim() !== '') {
                            await flushElement(elementBuf);
                        }
                        elementBuf = '';
                        elementActive = false;
                        continue;
                    }
                    // Scalar value character (number, true, false, null).
                    elementBuf += c;
                    elementActive = true;
                    continue;
                }

                // depth > 1, inside an element.
                elementBuf += c;
            }
        }
    } finally {
        stream.destroy();
    }

    if (!arrayStarted) {
        // Empty or whitespace-only file: treat as not an array so the caller
        // surfaces a clear error rather than a bare parse failure.
        notArray = true;
    }

    return { count, notArray };
}

export async function importFromJson(
    adapter: IDatabaseAdapter,
    tableName: string,
    filePath: string,
    options: JsonImportOptions,
): Promise<ImportResult> {
    const batchSize = options.batchSize ?? 100;

    const stat = await fs.promises.stat(filePath);
    if (stat.size > MAX_JSON_FILE_SIZE) {
        return {
            success: false,
            totalRows: 0,
            importedRows: 0,
            skippedRows: 0,
            errors: [{ row: 0, message: t('database.jsonFileTooLarge', (stat.size / 1024 / 1024).toFixed(1), String(MAX_JSON_FILE_SIZE / 1024 / 1024)), data: '' }],
        };
    }

    const errors: ImportError[] = [];
    let importedRows = 0;
    let skippedRows = 0;

    // Pass 1: stream the array to collect the union of column names. Elements
    // are parsed and immediately released, so memory stays at element-size
    // rather than file-size.
    const columnSet = new Set<string>();
    let totalRows = 0;
    let notArray = false;
    // Malformed JSON propagates as a thrown error from streamJsonArray,
    // matching the original JSON.parse behaviour for invalid files.
    const pass1 = await streamJsonArray(filePath, (element) => {
        if (element && typeof element === 'object' && !Array.isArray(element)) {
            for (const key of Object.keys(element as Record<string, unknown>)) {
                columnSet.add(key);
            }
        }
    });
    notArray = pass1.notArray;
    totalRows = pass1.count;

    if (notArray) {
        return {
            success: false,
            totalRows: 0,
            importedRows: 0,
            skippedRows: 0,
            errors: [{ row: 0, message: t('database.jsonMustBeArray'), data: '' }],
        };
    }

    const columns = Array.from(columnSet);

    if (columns.length === 0) {
        return {
            success: false,
            totalRows,
            importedRows: 0,
            skippedRows: 0,
            errors: [{ row: 0, message: t('database.noColumnsInJson'), data: '' }],
        };
    }

    // Pass 2: stream the array again, building rows and flushing batches.
    // `records` and `rows` arrays are never materialised in full, so peak
    // memory is bounded by the active batch rather than the file size.
    let batch: Record<string, unknown>[] = [];
    let batchStartRow = 1;

    const flushBatch = async (): Promise<void> => {
        if (batch.length === 0) {
            return;
        }
        try {
            const result = await executeBatchInsert(adapter, tableName, columns, batch, options.onError, batchStartRow);
            importedRows += result.imported;
            skippedRows += result.skipped;
            errors.push(...result.errors);
        } catch (err: unknown) {
            if (options.onError === 'abort') {
                throw err;
            }
            skippedRows += batch.length;
        }
        batch = [];
    };

    try {
        await streamJsonArray(filePath, async (element, index) => {
            if (batch.length === 0) {
                batchStartRow = index + 1;
            }
            if (!element || typeof element !== 'object' || Array.isArray(element)) {
                errors.push({
                    row: index + 1,
                    message: t('database.recordNotObject'),
                    data: String(element),
                });
                // Match the original behaviour: insert an empty row to keep
                // batch alignment, so subsequent rows still land correctly.
                batch.push({});
            } else {
                const obj = element as Record<string, unknown>;
                const row: Record<string, unknown> = {};
                for (const col of columns) {
                    row[col] = obj[col] ?? null;
                }
                batch.push(row);
            }

            if (batch.length >= batchSize) {
                await flushBatch();
            }
        });

        // Flush any trailing partial batch.
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
        // Skip mode + JSON syntax error: re-throw to match the original
        // behaviour where a malformed file aborts the import.
        throw err;
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
    const stat = await fs.promises.stat(filePath);
    if (stat.size > MAX_SQL_FILE_SIZE) {
        return {
            success: false,
            totalRows: 0,
            importedRows: 0,
            skippedRows: 0,
            errors: [{ row: 0, message: t('database.sqlFileTooLarge', (stat.size / 1024 / 1024).toFixed(1), String(MAX_SQL_FILE_SIZE / 1024 / 1024)), data: '' }],
        };
    }

    let totalRows = 0;
    let importedRows = 0;
    let skippedRows = 0;
    const errors: ImportError[] = [];

    const stream = fs.createReadStream(filePath, 'utf-8');
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    let currentStatement = '';

    for await (const line of rl) {
        const trimmed = line.trim();
        if (trimmed === '') {
            continue;
        }

        if (currentStatement.length > 0) {
            currentStatement += '\n' + line;
        } else {
            currentStatement = line;
        }

        while (true) {
            const semiIdx = SqlTextScanner.findStatementEnd(currentStatement, 0);
            if (semiIdx >= currentStatement.length) break;
            const segment = currentStatement.substring(0, semiIdx).trim();
            currentStatement = currentStatement.substring(semiIdx + 1);
            if (segment.length === 0) {
                continue;
            }
            totalRows++;
            try {
                await adapter.execute(segment + ';');
                importedRows++;
            } catch (err: unknown) {
                skippedRows++;
                errors.push({
                    row: totalRows,
                    message: err instanceof Error ? err.message : String(err),
                    data: segment + ';',
                });
            }
        }
    }

    if (currentStatement.trim().length > 0) {
        const sql = currentStatement.trim();
        totalRows++;
        try {
            await adapter.execute(sql.endsWith(';') ? sql : sql + ';');
            importedRows++;
        } catch (err: unknown) {
            skippedRows++;
            errors.push({
                row: totalRows,
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
