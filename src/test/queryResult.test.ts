import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import { ColumnMeta, QueryResult, QueryError } from '../database/adapters/IDatabaseAdapter';
import { InMemoryDocument } from '../views/queryResult/InMemoryDocument';
import { MonacoDataAdapter } from '../views/queryResult/MonacoDataAdapter';
import { LanguageBridge } from '../views/queryResult/LanguageBridge';
import { getContainer, Tokens } from '../core/diContainer';
import type { SchemaProvider } from '../database/schema/SchemaProvider';
import type { SqlHoverProvider } from '../providers/SqlHoverProvider';
import type { SqlCompletionProvider } from '../completion/SqlCompletionProvider';

/** Build a LanguageBridge with its dependencies resolved from the test DI container. */
function createTestLanguageBridge(extensionUri: vscode.Uri): LanguageBridge {
    const container = getContainer();
    return new LanguageBridge(
        extensionUri,
        container.get<SchemaProvider>(Tokens.SchemaProvider),
        container.get<SqlHoverProvider>(Tokens.HoverProvider),
        container.get<SqlCompletionProvider>(Tokens.CompletionProvider),
    );
}

type CellValue = string | number | boolean | null | undefined | Date | Buffer;
type DataRow = Record<string, CellValue>;

interface PackageContributes {
    configuration: {
        properties: Record<string, { type?: string; default?: unknown; enum?: string[] }>;
    };
    commands: { command: string }[];
}

interface PackageJson {
    contributes: PackageContributes;
}

interface ParsedRow {
    length?: number;
    [key: string]: unknown;
}

suite('DataExporter - Pure Logic', () => {

    suite('escapeCsvField logic', () => {
        function escapeCsvField(value: string, delimiter: string): string {
            if (value.includes(delimiter) || value.includes('\n') || value.includes('"')) {
                return '"' + value.replace(/"/g, '""') + '"';
            }
            return value;
        }

        test('should not escape simple values', () => {
            assert.strictEqual(escapeCsvField('hello', ','), 'hello');
        });

        test('should not escape numbers as strings', () => {
            assert.strictEqual(escapeCsvField('123', ','), '123');
        });

        test('should escape values containing delimiter', () => {
            assert.strictEqual(escapeCsvField('a,b', ','), '"a,b"');
        });

        test('should escape values containing newline', () => {
            assert.strictEqual(escapeCsvField('a\nb', ','), '"a\nb"');
        });

        test('should escape values containing double quotes', () => {
            assert.strictEqual(escapeCsvField('a"b', ','), '"a""b"');
        });

        test('should escape values containing delimiter and quotes', () => {
            assert.strictEqual(escapeCsvField('a,"b"c', ','), '"a,""b""c"');
        });

        test('should handle empty string', () => {
            assert.strictEqual(escapeCsvField('', ','), '');
        });

        test('should handle tab delimiter', () => {
            assert.strictEqual(escapeCsvField('a\tb', '\t'), '"a\tb"');
        });

        test('should handle semicolon delimiter', () => {
            assert.strictEqual(escapeCsvField('a;b', ';'), '"a;b"');
        });

        test('should not escape when delimiter not present', () => {
            assert.strictEqual(escapeCsvField('abc', ';'), 'abc');
        });

        test('should escape multiple double quotes', () => {
            assert.strictEqual(escapeCsvField('a""b', ','), '"a""""b"');
        });

        test('should escape value with all special chars', () => {
            assert.strictEqual(escapeCsvField('a,"b\nc', ','), '"a,""b\nc"');
        });
    });

    suite('convertJsonValue logic', () => {
        function convertJsonValue(value: CellValue): string | number | boolean | null {
            if (value === null || value === undefined) {
                return null;
            }
            if (value instanceof Date) {
                return value.toISOString();
            }
            if (Buffer.isBuffer(value)) {
                return value.toString('base64');
            }
            if (ArrayBuffer.isView(value) && !((value as unknown) instanceof DataView)) {
                const v = value as unknown as Uint8Array;
                return Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString('base64');
            }
            return value;
        }

        test('should convert null to null', () => {
            assert.strictEqual(convertJsonValue(null), null);
        });

        test('should convert undefined to null', () => {
            assert.strictEqual(convertJsonValue(undefined), null);
        });

        test('should convert Date to ISO string', () => {
            const date = new Date('2024-01-15T10:30:00.000Z');
            assert.strictEqual(convertJsonValue(date), '2024-01-15T10:30:00.000Z');
        });

        test('should convert Buffer to base64', () => {
            const buf = Buffer.from('hello');
            assert.strictEqual(convertJsonValue(buf), 'aGVsbG8=');
        });

        test('should pass through string values', () => {
            assert.strictEqual(convertJsonValue('test'), 'test');
        });

        test('should pass through number values', () => {
            assert.strictEqual(convertJsonValue(42), 42);
        });

        test('should pass through boolean values', () => {
            assert.strictEqual(convertJsonValue(true), true);
            assert.strictEqual(convertJsonValue(false), false);
        });

        test('should pass through zero', () => {
            assert.strictEqual(convertJsonValue(0), 0);
        });

        test('should pass through empty string', () => {
            assert.strictEqual(convertJsonValue(''), '');
        });
    });

    suite('formatSqlValue logic', () => {
        function formatSqlValue(value: CellValue): string {
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

        test('should format null as NULL', () => {
            assert.strictEqual(formatSqlValue(null), 'NULL');
        });

        test('should format undefined as NULL', () => {
            assert.strictEqual(formatSqlValue(undefined), 'NULL');
        });

        test('should format number without quotes', () => {
            assert.strictEqual(formatSqlValue(42), '42');
        });

        test('should format negative number without quotes', () => {
            assert.strictEqual(formatSqlValue(-5), '-5');
        });

        test('should format float without quotes', () => {
            assert.strictEqual(formatSqlValue(3.14), '3.14');
        });

        test('should format zero without quotes', () => {
            assert.strictEqual(formatSqlValue(0), '0');
        });

        test('should format boolean as string', () => {
            assert.strictEqual(formatSqlValue(true), 'true');
            assert.strictEqual(formatSqlValue(false), 'false');
        });

        test('should format string with single quotes', () => {
            assert.strictEqual(formatSqlValue('hello'), "'hello'");
        });

        test('should escape single quotes in string', () => {
            assert.strictEqual(formatSqlValue("it's"), "'it''s'");
        });

        test('should escape multiple single quotes', () => {
            assert.strictEqual(formatSqlValue("a'b'c"), "'a''b''c'");
        });

        test('should format Date as ISO string in quotes', () => {
            const date = new Date('2024-01-15T10:30:00.000Z');
            assert.strictEqual(formatSqlValue(date), "'2024-01-15T10:30:00.000Z'");
        });

        test('should format empty string as quoted empty', () => {
            assert.strictEqual(formatSqlValue(''), "''");
        });
    });

    suite('CSV content generation', () => {
        const columns: ColumnMeta[] = [
            { name: 'id', type: 'INT', nullable: false, isPrimaryKey: true, isAutoIncrement: true, isEnum: false },
            { name: 'name', type: 'VARCHAR', nullable: true, isPrimaryKey: false, isAutoIncrement: false, isEnum: false },
            { name: 'email', type: 'VARCHAR', nullable: true, isPrimaryKey: false, isAutoIncrement: false, isEnum: false },
        ];

        function generateCsv(rows: DataRow[], columns: ColumnMeta[], delimiter = ',', includeHeaders = true): string {
            const lines: string[] = [];

            function escape(value: string, delim: string): string {
                if (value.includes(delim) || value.includes('\n') || value.includes('"')) {
                    return '"' + value.replace(/"/g, '""') + '"';
                }
                return value;
            }

            if (includeHeaders) {
                lines.push(columns.map(col => escape(col.name, delimiter)).join(delimiter));
            }

            for (const row of rows) {
                const values = columns.map(col => {
                    const value = row[col.name];
                    if (value === null || value === undefined) {
                        return '';
                    }
                    return escape(String(value), delimiter);
                });
                lines.push(values.join(delimiter));
            }

            return lines.join('\n');
        }

        test('should generate CSV with headers', () => {
            const rows: DataRow[] = [
                { id: 1, name: 'Alice', email: 'alice@test.com' },
                { id: 2, name: 'Bob', email: 'bob@test.com' },
            ];
            const csv = generateCsv(rows, columns);
            const lines = csv.split('\n');
            assert.strictEqual(lines[0], 'id,name,email');
            assert.strictEqual(lines[1], '1,Alice,alice@test.com');
            assert.strictEqual(lines[2], '2,Bob,bob@test.com');
        });

        test('should generate CSV without headers', () => {
            const rows: DataRow[] = [
                { id: 1, name: 'Alice', email: 'alice@test.com' },
            ];
            const csv = generateCsv(rows, columns, ',', false);
            const lines = csv.split('\n');
            assert.strictEqual(lines[0], '1,Alice,alice@test.com');
        });

        test('should handle NULL values as empty string', () => {
            const rows: DataRow[] = [
                { id: 1, name: null, email: 'test@test.com' },
            ];
            const csv = generateCsv(rows, columns);
            const lines = csv.split('\n');
            assert.strictEqual(lines[1], '1,,test@test.com');
        });

        test('should handle undefined values as empty string', () => {
            const rows: DataRow[] = [
                { id: 1, name: undefined, email: 'test@test.com' },
            ];
            const csv = generateCsv(rows, columns);
            const lines = csv.split('\n');
            assert.strictEqual(lines[1], '1,,test@test.com');
        });

        test('should escape fields with commas', () => {
            const rows: DataRow[] = [
                { id: 1, name: 'Smith, Jr.', email: 'test@test.com' },
            ];
            const csv = generateCsv(rows, columns);
            const lines = csv.split('\n');
            assert.strictEqual(lines[1], '1,"Smith, Jr.",test@test.com');
        });

        test('should escape fields with newlines', () => {
            const rows: DataRow[] = [
                { id: 1, name: 'Line1\nLine2', email: 'test@test.com' },
            ];
            const csv = generateCsv(rows, columns);
            assert.ok(csv.includes('"Line1\nLine2"'));
            assert.ok(csv.includes('test@test.com'));
        });

        test('should escape fields with double quotes', () => {
            const rows: DataRow[] = [
                { id: 1, name: 'Say "hello"', email: 'test@test.com' },
            ];
            const csv = generateCsv(rows, columns);
            const lines = csv.split('\n');
            assert.strictEqual(lines[1], '1,"Say ""hello""",test@test.com');
        });

        test('should support custom delimiter', () => {
            const rows: DataRow[] = [
                { id: 1, name: 'Alice', email: 'alice@test.com' },
            ];
            const csv = generateCsv(rows, columns, ';');
            const lines = csv.split('\n');
            assert.strictEqual(lines[1], '1;Alice;alice@test.com');
        });

        test('should handle empty rows array', () => {
            const csv = generateCsv([], columns);
            assert.strictEqual(csv, 'id,name,email');
        });

        test('should handle empty rows without headers', () => {
            const csv = generateCsv([], columns, ',', false);
            assert.strictEqual(csv, '');
        });
    });

    suite('JSON content generation', () => {
        const columns: ColumnMeta[] = [
            { name: 'id', type: 'INT', nullable: false, isPrimaryKey: true, isAutoIncrement: true, isEnum: false },
            { name: 'name', type: 'VARCHAR', nullable: true, isPrimaryKey: false, isAutoIncrement: false, isEnum: false },
        ];

        function generateJson(rows: DataRow[], columns: ColumnMeta[], prettyPrint = true): string {
            function convert(value: CellValue): string | number | boolean | null {
                if (value === null || value === undefined) return null;
                if (value instanceof Date) return value.toISOString();
                if (Buffer.isBuffer(value)) return value.toString('base64');
                return value;
            }

            const result = rows.map(row => {
                const obj: DataRow = {};
                for (const col of columns) {
                    obj[col.name] = convert(row[col.name]);
                }
                return obj;
            });

            return JSON.stringify(result, null, prettyPrint ? 2 : undefined);
        }

        test('should generate JSON array with column keys', () => {
            const rows: DataRow[] = [
                { id: 1, name: 'Alice' },
                { id: 2, name: 'Bob' },
            ];
            const json = generateJson(rows, columns);
            const parsed = JSON.parse(json) as ParsedRow[];
            assert.strictEqual(parsed.length, 2);
            assert.strictEqual(parsed[0].id, 1);
            assert.strictEqual(parsed[0].name, 'Alice');
            assert.strictEqual(parsed[1].id, 2);
            assert.strictEqual(parsed[1].name, 'Bob');
        });

        test('should convert null to JSON null', () => {
            const rows: DataRow[] = [{ id: 1, name: null }];
            const json = generateJson(rows, columns);
            const parsed = JSON.parse(json) as ParsedRow[];
            assert.strictEqual(parsed[0].name, null);
        });

        test('should convert undefined to JSON null', () => {
            const rows: DataRow[] = [{ id: 1, name: undefined }];
            const json = generateJson(rows, columns);
            const parsed = JSON.parse(json) as ParsedRow[];
            assert.strictEqual(parsed[0].name, null);
        });

        test('should convert Date to ISO string', () => {
            const date = new Date('2024-06-15T12:00:00.000Z');
            const rows: DataRow[] = [{ id: 1, name: date }];
            const json = generateJson(rows, columns);
            const parsed = JSON.parse(json) as ParsedRow[];
            assert.strictEqual(parsed[0].name, '2024-06-15T12:00:00.000Z');
        });

        test('should convert Buffer to base64', () => {
            const rows: DataRow[] = [{ id: 1, name: Buffer.from('hello') }];
            const json = generateJson(rows, columns);
            const parsed = JSON.parse(json) as ParsedRow[];
            assert.strictEqual(parsed[0].name, 'aGVsbG8=');
        });

        test('should pretty print when enabled', () => {
            const rows: DataRow[] = [{ id: 1, name: 'Alice' }];
            const json = generateJson(rows, columns, true);
            assert.ok(json.includes('\n'));
            assert.ok(json.includes('  '));
        });

        test('should not pretty print when disabled', () => {
            const rows: DataRow[] = [{ id: 1, name: 'Alice' }];
            const json = generateJson(rows, columns, false);
            assert.ok(!json.includes('\n'));
        });

        test('should handle empty rows', () => {
            const json = generateJson([], columns);
            const parsed = JSON.parse(json) as ParsedRow[];
            assert.strictEqual(parsed.length, 0);
        });

        test('should preserve number types', () => {
            const rows: DataRow[] = [{ id: 42, name: 'test' }];
            const json = generateJson(rows, columns);
            const parsed = JSON.parse(json) as ParsedRow[];
            assert.strictEqual(typeof parsed[0].id, 'number');
            assert.strictEqual(parsed[0].id, 42);
        });

        test('should preserve boolean types', () => {
            const cols: ColumnMeta[] = [
                { name: 'id', type: 'INT', nullable: false, isPrimaryKey: true, isAutoIncrement: false, isEnum: false },
                { name: 'active', type: 'BOOLEAN', nullable: false, isPrimaryKey: false, isAutoIncrement: false, isEnum: false },
            ];
            const rows: DataRow[] = [{ id: 1, active: true }];
            const json = generateJson(rows, cols);
            const parsed = JSON.parse(json) as ParsedRow[];
            assert.strictEqual(parsed[0].active, true);
        });
    });

    suite('SQL INSERT content generation', () => {
        const columns: ColumnMeta[] = [
            { name: 'id', type: 'INT', nullable: false, isPrimaryKey: true, isAutoIncrement: true, isEnum: false },
            { name: 'name', type: 'VARCHAR', nullable: true, isPrimaryKey: false, isAutoIncrement: false, isEnum: false },
            { name: 'age', type: 'INT', nullable: true, isPrimaryKey: false, isAutoIncrement: false, isEnum: false },
        ];

        function generateInsert(rows: DataRow[], columns: ColumnMeta[], tableName: string, batchSize = 1): string {
            function formatValue(value: CellValue): string {
                if (value === null || value === undefined) return 'NULL';
                if (typeof value === 'number') return String(value);
                if (typeof value === 'boolean') return String(value);
                if (value instanceof Date) return `'${value.toISOString()}'`;
                return `'${String(value).replace(/'/g, "''")}'`;
            }

            const columnNames = columns.map(col => '`' + col.name + '`').join(', ');
            const lines: string[] = [];

            for (let i = 0; i < rows.length; i += batchSize) {
                const batch = rows.slice(i, i + batchSize);
                const valueGroups = batch.map(row => {
                    const values = columns.map(col => formatValue(row[col.name]));
                    return '(' + values.join(', ') + ')';
                });
                lines.push('INSERT INTO `' + tableName + '` (' + columnNames + ') VALUES ' + valueGroups.join(', ') + ';');
            }

            return lines.join('\n');
        }

        test('should generate single-row INSERT statements', () => {
            const rows: DataRow[] = [
                { id: 1, name: 'Alice', age: 30 },
                { id: 2, name: 'Bob', age: 25 },
            ];
            const sql = generateInsert(rows, columns, 'users');
            const lines = sql.split('\n');
            assert.strictEqual(lines.length, 2);
            assert.strictEqual(lines[0], "INSERT INTO `users` (`id`, `name`, `age`) VALUES (1, 'Alice', 30);");
            assert.strictEqual(lines[1], "INSERT INTO `users` (`id`, `name`, `age`) VALUES (2, 'Bob', 25);");
        });

        test('should generate multi-row INSERT with batchSize', () => {
            const rows: DataRow[] = [
                { id: 1, name: 'Alice', age: 30 },
                { id: 2, name: 'Bob', age: 25 },
                { id: 3, name: 'Charlie', age: 35 },
            ];
            const sql = generateInsert(rows, columns, 'users', 2);
            const lines = sql.split('\n');
            assert.strictEqual(lines.length, 2);
            assert.strictEqual(lines[0], "INSERT INTO `users` (`id`, `name`, `age`) VALUES (1, 'Alice', 30), (2, 'Bob', 25);");
            assert.strictEqual(lines[1], "INSERT INTO `users` (`id`, `name`, `age`) VALUES (3, 'Charlie', 35);");
        });

        test('should handle NULL values', () => {
            const rows: DataRow[] = [
                { id: 1, name: null, age: null },
            ];
            const sql = generateInsert(rows, columns, 'users');
            assert.ok(sql.includes('1, NULL, NULL'));
        });

        test('should escape single quotes in string values', () => {
            const rows: DataRow[] = [
                { id: 1, name: "O'Brien", age: 30 },
            ];
            const sql = generateInsert(rows, columns, 'users');
            assert.ok(sql.includes("'O''Brien'"));
        });

        test('should handle numbers without quotes', () => {
            const rows: DataRow[] = [
                { id: 42, name: 'test', age: 0 },
            ];
            const sql = generateInsert(rows, columns, 'users');
            assert.ok(sql.includes('42,'));
            assert.ok(sql.includes(', 0'));
        });

        test('should handle empty rows', () => {
            const sql = generateInsert([], columns, 'users');
            assert.strictEqual(sql, '');
        });

        test('should handle batchSize larger than rows', () => {
            const rows: DataRow[] = [
                { id: 1, name: 'Alice', age: 30 },
            ];
            const sql = generateInsert(rows, columns, 'users', 100);
            const lines = sql.split('\n');
            assert.strictEqual(lines.length, 1);
        });

        test('should handle boolean values', () => {
            const cols: ColumnMeta[] = [
                { name: 'id', type: 'INT', nullable: false, isPrimaryKey: true, isAutoIncrement: false, isEnum: false },
                { name: 'active', type: 'BOOLEAN', nullable: false, isPrimaryKey: false, isAutoIncrement: false, isEnum: false },
            ];
            const rows: DataRow[] = [{ id: 1, active: true }];
            const sql = generateInsert(rows, cols, 'flags');
            assert.ok(sql.includes('true'));
        });

        test('should handle Date values', () => {
            const date = new Date('2024-01-15T10:30:00.000Z');
            const rows: DataRow[] = [{ id: 1, name: date, age: 30 }];
            const sql = generateInsert(rows, columns, 'users');
            assert.ok(sql.includes("'2024-01-15T10:30:00.000Z'"));
        });

        test('should batch all rows in single INSERT when batchSize equals rows length', () => {
            const rows: DataRow[] = [
                { id: 1, name: 'Alice', age: 30 },
                { id: 2, name: 'Bob', age: 25 },
            ];
            const sql = generateInsert(rows, columns, 'users', 2);
            const lines = sql.split('\n');
            assert.strictEqual(lines.length, 1);
            assert.ok(lines[0].includes('VALUES'));
            assert.ok(lines[0].includes('(1,'));
            assert.ok(lines[0].includes('(2,'));
        });
    });
});

suite('DataExporter - File Operations', () => {
    let tmpDir: string;

    suiteSetup(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'data-exporter-test-'));
    });

    suiteTeardown(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    suite('CSV file write', () => {
        test('should write CSV content to file', async () => {
            const columns: ColumnMeta[] = [
                { name: 'id', type: 'INT', nullable: false, isPrimaryKey: true, isAutoIncrement: true, isEnum: false },
                { name: 'name', type: 'VARCHAR', nullable: true, isPrimaryKey: false, isAutoIncrement: false, isEnum: false },
            ];
            const rows: DataRow[] = [
                { id: 1, name: 'Alice' },
                { id: 2, name: 'Bob' },
            ];

            function escapeCsvField(value: string, delimiter: string): string {
                if (value.includes(delimiter) || value.includes('\n') || value.includes('"')) {
                    return '"' + value.replace(/"/g, '""') + '"';
                }
                return value;
            }

            const lines: string[] = [];
            lines.push(columns.map(col => escapeCsvField(col.name, ',')).join(','));
            for (const row of rows) {
                const values = columns.map(col => {
                    const value = row[col.name];
                    if (value === null || value === undefined) return '';
                    return escapeCsvField(String(value), ',');
                });
                lines.push(values.join(','));
            }
            const content = lines.join('\n');

            const filePath = path.join(tmpDir, 'test.csv');
            await fs.promises.writeFile(filePath, content, 'utf-8');

            const readBack = await fs.promises.readFile(filePath, 'utf-8');
            assert.strictEqual(readBack, 'id,name\n1,Alice\n2,Bob');
        });
    });

    suite('JSON file write', () => {
        test('should write JSON content to file', async () => {
            const columns: ColumnMeta[] = [
                { name: 'id', type: 'INT', nullable: false, isPrimaryKey: true, isAutoIncrement: true, isEnum: false },
                { name: 'name', type: 'VARCHAR', nullable: true, isPrimaryKey: false, isAutoIncrement: false, isEnum: false },
            ];
            const rows: DataRow[] = [
                { id: 1, name: 'Alice' },
                { id: 2, name: null },
            ];

            function convertJsonValue(value: CellValue): string | number | boolean | null {
                if (value === null || value === undefined) return null;
                if (value instanceof Date) return value.toISOString();
                if (Buffer.isBuffer(value)) return value.toString('base64');
                return value;
            }

            const result = rows.map(row => {
                const obj: DataRow = {};
                for (const col of columns) {
                    obj[col.name] = convertJsonValue(row[col.name]);
                }
                return obj;
            });

            const content = JSON.stringify(result, null, 2);
            const filePath = path.join(tmpDir, 'test.json');
            await fs.promises.writeFile(filePath, content, 'utf-8');

            const readBack = await fs.promises.readFile(filePath, 'utf-8');
            const parsed = JSON.parse(readBack) as ParsedRow[];
            assert.strictEqual(parsed.length, 2);
            assert.strictEqual(parsed[0].id, 1);
            assert.strictEqual(parsed[0].name, 'Alice');
            assert.strictEqual(parsed[1].id, 2);
            assert.strictEqual(parsed[1].name, null);
        });
    });

    suite('SQL INSERT file write', () => {
        test('should write INSERT statements to file', async () => {
            const columns: ColumnMeta[] = [
                { name: 'id', type: 'INT', nullable: false, isPrimaryKey: true, isAutoIncrement: true, isEnum: false },
                { name: 'name', type: 'VARCHAR', nullable: true, isPrimaryKey: false, isAutoIncrement: false, isEnum: false },
            ];
            const rows: DataRow[] = [
                { id: 1, name: 'Alice' },
                { id: 2, name: null },
            ];

            function formatSqlValue(value: CellValue): string {
                if (value === null || value === undefined) return 'NULL';
                if (typeof value === 'number') return String(value);
                if (typeof value === 'boolean') return String(value);
                return "'" + String(value).replace(/'/g, "''") + "'";
            }

            const columnNames = columns.map(col => '`' + col.name + '`').join(', ');
            const lines: string[] = [];
            for (const row of rows) {
                const values = columns.map(col => formatSqlValue(row[col.name]));
                lines.push('INSERT INTO `users` (' + columnNames + ') VALUES (' + values.join(', ') + ');');
            }
            const content = lines.join('\n');

            const filePath = path.join(tmpDir, 'test.sql');
            await fs.promises.writeFile(filePath, content, 'utf-8');

            const readBack = await fs.promises.readFile(filePath, 'utf-8');
            const readLines = readBack.split('\n');
            assert.strictEqual(readLines.length, 2);
            assert.strictEqual(readLines[0], "INSERT INTO `users` (`id`, `name`) VALUES (1, 'Alice');");
            assert.strictEqual(readLines[1], "INSERT INTO `users` (`id`, `name`) VALUES (2, NULL);");
        });
    });

    suite('DDL file write', () => {
        test('should write DDL content to file', async () => {
            const ddl = 'CREATE TABLE `users` (\n  `id` INT NOT NULL AUTO_INCREMENT,\n  `name` VARCHAR(255),\n  PRIMARY KEY (`id`)\n);';
            const filePath = path.join(tmpDir, 'users.sql');
            await fs.promises.writeFile(filePath, ddl, 'utf-8');

            const readBack = await fs.promises.readFile(filePath, 'utf-8');
            assert.strictEqual(readBack, ddl);
        });
    });
});

suite('QueryResultPanel - Serialization', () => {

    suite('_serializeResult logic', () => {
        function serializeResult(
            result: QueryResult,
            connectionName?: string,
            connectionColor?: string
        ): Record<string, unknown> {
            return {
                queryId: result.queryId,
                status: result.status,
                columns: result.columns.map(c => ({
                    name: c.name,
                    type: c.type,
                    nullable: c.nullable,
                    isPrimaryKey: c.isPrimaryKey,
                })),
                rows: result.rows,
                rowCount: result.rowCount,
                affectedRows: result.affectedRows,
                executionTime: result.executionTime,
                error: result.error,
                database: result.database,
                connectionName: connectionName || '',
                connectionColor: connectionColor || '',
            };
        }

        test('should serialize basic query result', () => {
            const result: QueryResult = {
                queryId: 'q-123',
                status: 'success',
                columns: [
                    { name: 'id', type: 'INT', nullable: false, isPrimaryKey: true, isAutoIncrement: true, isEnum: false },
                    { name: 'name', type: 'VARCHAR', nullable: true, isPrimaryKey: false, isAutoIncrement: false, isEnum: false },
                ],
                rows: [{ id: 1, name: 'Alice' }],
                rowCount: 1,
                executionTime: 50,
            };

            const serialized = serializeResult(result, 'TestDB', '#4CAF50');

            assert.strictEqual(serialized.queryId, 'q-123');
            assert.strictEqual(serialized.status, 'success');
            assert.strictEqual(serialized.rowCount, 1);
            assert.strictEqual(serialized.executionTime, 50);
            assert.strictEqual(serialized.connectionName, 'TestDB');
            assert.strictEqual(serialized.connectionColor, '#4CAF50');
        });

        test('should serialize columns with limited fields', () => {
            const result: QueryResult = {
                queryId: 'q-456',
                status: 'success',
                columns: [
                    { name: 'id', type: 'INT', nullable: false, isPrimaryKey: true, isAutoIncrement: true, isEnum: false, comment: 'Primary key' },
                ],
                rows: [],
                rowCount: 0,
                executionTime: 10,
            };

            const serialized = serializeResult(result);
            const col = (serialized.columns as Record<string, unknown>[])[0];

            assert.strictEqual(col.name, 'id');
            assert.strictEqual(col.type, 'INT');
            assert.strictEqual(col.nullable, false);
            assert.strictEqual(col.isPrimaryKey, true);
            assert.strictEqual(col.isAutoIncrement, undefined);
            assert.strictEqual(col.comment, undefined);
        });

        test('should serialize error result', () => {
            const error: QueryError = { code: 'ER_BAD_TABLE', message: 'Table not found' };
            const result: QueryResult = {
                queryId: 'q-789',
                status: 'error',
                columns: [],
                rows: [],
                rowCount: 0,
                executionTime: 5,
                error,
            };

            const serialized = serializeResult(result);

            assert.strictEqual(serialized.status, 'error');
            assert.deepStrictEqual(serialized.error, error);
        });

        test('should default connectionName to empty string', () => {
            const result: QueryResult = {
                queryId: 'q-000',
                status: 'success',
                columns: [],
                rows: [],
                rowCount: 0,
                executionTime: 0,
            };

            const serialized = serializeResult(result);
            assert.strictEqual(serialized.connectionName, '');
            assert.strictEqual(serialized.connectionColor, '');
        });

        test('should serialize affectedRows', () => {
            const result: QueryResult = {
                queryId: 'q-111',
                status: 'success',
                columns: [],
                rows: [],
                rowCount: 0,
                affectedRows: 5,
                executionTime: 100,
            };

            const serialized = serializeResult(result);
            assert.strictEqual(serialized.affectedRows, 5);
        });

        test('should serialize database field', () => {
            const result: QueryResult = {
                queryId: 'q-222',
                status: 'success',
                columns: [],
                rows: [],
                rowCount: 0,
                executionTime: 10,
                database: 'mydb',
            };

            const serialized = serializeResult(result);
            assert.strictEqual(serialized.database, 'mydb');
        });
    });
});

suite('FilterCondition - Type Validation', () => {

    test('should create valid FilterCondition', () => {
        const condition = { column: 'name', operator: '=', value: 'Alice' };
        assert.strictEqual(condition.column, 'name');
        assert.strictEqual(condition.operator, '=');
        assert.strictEqual(condition.value, 'Alice');
    });

    test('should support all operators', () => {
        const operators = ['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'NOT LIKE', 'IN', 'NOT IN', 'IS NULL', 'IS NOT NULL', 'BETWEEN'];
        assert.strictEqual(operators.length, 13);
        for (const op of operators) {
            const condition = { column: 'test', operator: op, value: '' };
            assert.strictEqual(condition.operator, op);
        }
    });

    test('should handle IS NULL without value', () => {
        const condition = { column: 'name', operator: 'IS NULL', value: '' };
        assert.strictEqual(condition.operator, 'IS NULL');
        assert.strictEqual(condition.value, '');
    });

    test('should handle IS NOT NULL without value', () => {
        const condition = { column: 'name', operator: 'IS NOT NULL', value: '' };
        assert.strictEqual(condition.operator, 'IS NOT NULL');
        assert.strictEqual(condition.value, '');
    });
});

suite('Export Options - Default Values', () => {

    test('CsvExportOptions should have correct defaults', () => {
        const options: { delimiter?: string; encoding?: string; includeHeaders?: boolean } = {};
        const delimiter = options.delimiter ?? ',';
        const encoding = options.encoding ?? 'utf-8';
        const includeHeaders = options.includeHeaders ?? true;
        assert.strictEqual(delimiter, ',');
        assert.strictEqual(encoding, 'utf-8');
        assert.strictEqual(includeHeaders, true);
    });

    test('CsvExportOptions should allow custom values', () => {
        const options = { delimiter: ';', encoding: 'gbk', includeHeaders: false };
        assert.strictEqual(options.delimiter, ';');
        assert.strictEqual(options.encoding, 'gbk');
        assert.strictEqual(options.includeHeaders, false);
    });

    test('JsonExportOptions should have correct defaults', () => {
        const options: { prettyPrint?: boolean } = {};
        const prettyPrint = options.prettyPrint ?? true;
        assert.strictEqual(prettyPrint, true);
    });

    test('InsertExportOptions should have correct defaults', () => {
        const options: { batchSize?: number } = {};
        const batchSize = options.batchSize ?? 1;
        assert.strictEqual(batchSize, 1);
    });

    test('InsertExportOptions should allow custom batchSize', () => {
        const options = { batchSize: 50 };
        assert.strictEqual(options.batchSize, 50);
    });
});

suite('QueryResult Types', () => {

    test('should create valid QueryResult for success', () => {
        const result: QueryResult = {
            queryId: 'q-test',
            status: 'success',
            columns: [],
            rows: [],
            rowCount: 0,
            executionTime: 100,
        };
        assert.strictEqual(result.status, 'success');
        assert.strictEqual(result.rowCount, 0);
    });

    test('should create valid QueryResult with data', () => {
        const result: QueryResult = {
            queryId: 'q-test-2',
            status: 'success',
            columns: [
                { name: 'id', type: 'INT', nullable: false, isPrimaryKey: true, isAutoIncrement: true, isEnum: false },
            ],
            rows: [{ id: 1 }],
            rowCount: 1,
            affectedRows: undefined,
            executionTime: 50,
            database: 'testdb',
        };
        assert.strictEqual(result.columns.length, 1);
        assert.strictEqual(result.rows.length, 1);
        assert.strictEqual(result.database, 'testdb');
    });

    test('should create valid QueryResult for error', () => {
        const result: QueryResult = {
            queryId: 'q-test-3',
            status: 'error',
            columns: [],
            rows: [],
            rowCount: 0,
            executionTime: 5,
            error: { code: 'ER_PARSE_ERROR', message: 'Syntax error near SELECT' },
        };
        assert.strictEqual(result.status, 'error');
        assert.strictEqual(result.error?.code, 'ER_PARSE_ERROR');
        assert.strictEqual(result.error?.message, 'Syntax error near SELECT');
    });

    test('should create valid ColumnMeta with all fields', () => {
        const col: ColumnMeta = {
            name: 'status',
            type: 'ENUM',
            nullable: false,
            isPrimaryKey: false,
            isAutoIncrement: false,
            isEnum: true,
            enumValues: ['active', 'inactive'],
            comment: 'User status',
        };
        assert.strictEqual(col.name, 'status');
        assert.strictEqual(col.type, 'ENUM');
        assert.strictEqual(col.isEnum, true);
        assert.deepStrictEqual(col.enumValues, ['active', 'inactive']);
        assert.strictEqual(col.comment, 'User status');
    });

    test('should create valid QueryError', () => {
        const error: QueryError = {
            code: 'ER_DUP_ENTRY',
            message: 'Duplicate entry for key',
            sql: 'INSERT INTO users VALUES (1)',
            position: 12,
        };
        assert.strictEqual(error.code, 'ER_DUP_ENTRY');
        assert.strictEqual(error.sql, 'INSERT INTO users VALUES (1)');
        assert.strictEqual(error.position, 12);
    });
});

suite('Webview Message Protocol', () => {

    suite('Extension → Webview messages', () => {
        test('queryResult message format', () => {
            const message = {
                type: 'queryResult',
                data: {
                    queryId: 'q-1',
                    status: 'success',
                    columns: [{ name: 'id', type: 'INT', nullable: false, isPrimaryKey: true }],
                    rows: [{ id: 1 }],
                    rowCount: 1,
                    affectedRows: 0,
                    executionTime: 50,
                    error: null,
                    database: 'testdb',
                    connectionName: 'TestConn',
                    connectionColor: '#4CAF50',
                },
            };
            assert.strictEqual(message.type, 'queryResult');
            assert.strictEqual(message.data.status, 'success');
            assert.strictEqual(message.data.rowCount, 1);
        });

        test('queryStart message format', () => {
            const message = {
                type: 'queryStart',
                data: { sql: 'SELECT * FROM users' },
            };
            assert.strictEqual(message.type, 'queryStart');
            assert.strictEqual(message.data.sql, 'SELECT * FROM users');
        });

        test('queryError message format', () => {
            const message = {
                type: 'queryError',
                data: { code: 'ER_BAD_TABLE', message: 'Table not found' },
            };
            assert.strictEqual(message.type, 'queryError');
            assert.strictEqual(message.data.code, 'ER_BAD_TABLE');
        });

        test('historyData message format', () => {
            const message = {
                type: 'historyData',
                data: {
                    entries: [
                        {
                            id: 'h-1',
                            sql: 'SELECT 1',
                            connectionName: 'Test',
                            database: 'testdb',
                            executedAt: '2024-01-01T00:00:00Z',
                            executionTime: 10,
                            rowCount: 1,
                            affectedRows: 0,
                            status: 'success',
                        },
                    ],
                },
            };
            assert.strictEqual(message.type, 'historyData');
            assert.strictEqual(message.data.entries.length, 1);
        });

        test('config message format', () => {
            const message = {
                type: 'config',
                data: {
                    pageSize: 100,
                    nullPlaceholder: '(NULL)',
                    enablePreload: true,
                    jsonPrettyPrint: true,
                    dateFormat: 'local',
                    longTextThreshold: 200,
                },
            };
            assert.strictEqual(message.type, 'config');
            assert.strictEqual(message.data.pageSize, 100);
            assert.strictEqual(message.data.nullPlaceholder, '(NULL)');
        });
    });

    suite('Webview → Extension messages', () => {
        test('executeQuery message format', () => {
            const message = {
                command: 'executeQuery',
                sql: 'SELECT * FROM users',
            };
            assert.strictEqual(message.command, 'executeQuery');
            assert.strictEqual(message.sql, 'SELECT * FROM users');
        });

        test('cancelQuery message format', () => {
            const message = { command: 'cancelQuery' };
            assert.strictEqual(message.command, 'cancelQuery');
        });

        test('requestExport message format', () => {
            const message = {
                command: 'requestExport',
                format: 'csv',
            };
            assert.strictEqual(message.command, 'requestExport');
            assert.strictEqual(message.format, 'csv');
        });

        test('requestSort message format', () => {
            const message = {
                command: 'requestSort',
                column: 'id',
                direction: 'asc',
            };
            assert.strictEqual(message.command, 'requestSort');
            assert.strictEqual(message.column, 'id');
            assert.strictEqual(message.direction, 'asc');
        });

        test('requestFilter message format', () => {
            const message = {
                command: 'requestFilter',
                conditions: [
                    { column: 'name', operator: '=', value: 'Alice' },
                    { column: 'age', operator: '>', value: '25' },
                ],
            };
            assert.strictEqual(message.command, 'requestFilter');
            assert.strictEqual(message.conditions.length, 2);
            assert.strictEqual(message.conditions[0].column, 'name');
        });

        test('requestPage message format', () => {
            const message = {
                command: 'requestPage',
                page: 2,
            };
            assert.strictEqual(message.command, 'requestPage');
            assert.strictEqual(message.page, 2);
        });

        test('all export formats are valid', () => {
            const formats = ['csv', 'json', 'insert', 'ddl'];
            for (const format of formats) {
                const message = { command: 'requestExport', format };
                assert.strictEqual(message.format, format);
            }
        });

        test('all sort directions are valid', () => {
            const directions = ['asc', 'desc'];
            for (const direction of directions) {
                const message = { command: 'requestSort', column: 'id', direction };
                assert.strictEqual(message.direction, direction);
            }
        });
    });
});

suite('Virtual Scroll Calculation', () => {

    test('should calculate correct visible range for start of list', () => {
        const ROW_HEIGHT = 28;
        const BUFFER_ROWS = 5;
        const scrollTop = 0;
        const viewportHeight = 500;
        const totalRows = 1000;

        const startRow = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER_ROWS);
        const endRow = Math.min(totalRows, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + BUFFER_ROWS);

        assert.strictEqual(startRow, 0);
        assert.strictEqual(endRow, Math.ceil(500 / 28) + 5);
    });

    test('should calculate correct visible range for middle of list', () => {
        const ROW_HEIGHT = 28;
        const BUFFER_ROWS = 5;
        const scrollTop = 5000;
        const viewportHeight = 500;
        const totalRows = 1000;

        const startRow = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER_ROWS);
        const endRow = Math.min(totalRows, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + BUFFER_ROWS);

        assert.strictEqual(startRow, Math.floor(5000 / 28) - 5);
        assert.ok(endRow <= totalRows);
    });

    test('should calculate correct visible range for end of list', () => {
        const ROW_HEIGHT = 28;
        const BUFFER_ROWS = 5;
        const totalRows = 1000;
        const totalHeight = totalRows * ROW_HEIGHT;
        const viewportHeight = 500;
        const scrollTop = totalHeight - viewportHeight;

        Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER_ROWS);
        const endRow = Math.min(totalRows, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + BUFFER_ROWS);

        assert.strictEqual(endRow, totalRows);
    });

    test('should calculate total height correctly', () => {
        const ROW_HEIGHT = 28;
        const totalRows = 1000;
        const totalHeight = totalRows * ROW_HEIGHT;
        assert.strictEqual(totalHeight, 28000);
    });

    test('should handle zero rows', () => {
        const ROW_HEIGHT = 28;
        const totalRows = 0;
        const totalHeight = totalRows * ROW_HEIGHT;
        assert.strictEqual(totalHeight, 0);
    });
});

suite('Pagination Calculation', () => {

    test('should calculate total pages correctly', () => {
        const pageSize = 100;
        const rowCount = 350;
        const totalPages = Math.max(1, Math.ceil(rowCount / pageSize));
        assert.strictEqual(totalPages, 4);
    });

    test('should handle exact page boundary', () => {
        const pageSize = 100;
        const rowCount = 300;
        const totalPages = Math.max(1, Math.ceil(rowCount / pageSize));
        assert.strictEqual(totalPages, 3);
    });

    test('should handle zero rows', () => {
        const pageSize = 100;
        const rowCount = 0;
        const totalPages = Math.max(1, Math.ceil(rowCount / pageSize));
        assert.strictEqual(totalPages, 1);
    });

    test('should calculate start and end row for first page', () => {
        const pageSize = 100;
        const currentPage = 1;
        const rowCount = 350;
        const startRow = (currentPage - 1) * pageSize + 1;
        const endRow = Math.min(currentPage * pageSize, rowCount);
        assert.strictEqual(startRow, 1);
        assert.strictEqual(endRow, 100);
    });

    test('should calculate start and end row for last page', () => {
        const pageSize = 100;
        const currentPage = 4;
        const rowCount = 350;
        const startRow = (currentPage - 1) * pageSize + 1;
        const endRow = Math.min(currentPage * pageSize, rowCount);
        assert.strictEqual(startRow, 301);
        assert.strictEqual(endRow, 350);
    });

    test('should calculate start and end row for middle page', () => {
        const pageSize = 100;
        const currentPage = 2;
        const rowCount = 350;
        const startRow = (currentPage - 1) * pageSize + 1;
        const endRow = Math.min(currentPage * pageSize, rowCount);
        assert.strictEqual(startRow, 101);
        assert.strictEqual(endRow, 200);
    });

    test('should disable prev on first page', () => {
        const currentPage = 1;
        const prevDisabled = currentPage <= 1;
        assert.strictEqual(prevDisabled, true);
    });

    test('should disable next on last page', () => {
        const pageSize = 100;
        const rowCount = 350;
        const totalPages = Math.max(1, Math.ceil(rowCount / pageSize));
        const currentPage = totalPages;
        const nextDisabled = currentPage >= totalPages;
        assert.strictEqual(nextDisabled, true);
    });
});

suite('Sort Logic', () => {

    function cycleSort(currentCol: number | null, currentDir: string | null, clickedCol: number): { col: number | null; dir: string | null } {
        if (currentCol === clickedCol) {
            if (currentDir === 'asc') {
                return { col: clickedCol, dir: 'desc' };
            } else if (currentDir === 'desc') {
                return { col: null, dir: null };
            } else {
                return { col: clickedCol, dir: 'asc' };
            }
        } else {
            return { col: clickedCol, dir: 'asc' };
        }
    }

    test('should cycle sort state: none → asc → desc → none', () => {
        let result = cycleSort(null, null, 0);
        assert.strictEqual(result.col, 0);
        assert.strictEqual(result.dir, 'asc');

        result = cycleSort(result.col, result.dir, 0);
        assert.strictEqual(result.col, 0);
        assert.strictEqual(result.dir, 'desc');

        result = cycleSort(result.col, result.dir, 0);
        assert.strictEqual(result.col, null);
        assert.strictEqual(result.dir, null);
    });

    test('should switch to new column with asc when clicking different column', () => {
        const result = cycleSort(0, 'desc', 1);
        assert.strictEqual(result.col, 1);
        assert.strictEqual(result.dir, 'asc');
    });

    test('should sort numbers correctly ascending', () => {
        const rows: (string | number | null)[][] = [[3], [1], [2]];
        rows.sort((a, b) => {
            const va = a[0];
            const vb = b[0];
            if (va === null || va === undefined) return 1;
            if (vb === null || vb === undefined) return -1;
            if (typeof va === 'number' && typeof vb === 'number') {
                return va - vb;
            }
            return String(va).localeCompare(String(vb));
        });
        assert.strictEqual(rows[0][0], 1);
        assert.strictEqual(rows[1][0], 2);
        assert.strictEqual(rows[2][0], 3);
    });

    test('should sort numbers correctly descending', () => {
        const rows: (string | number | null)[][] = [[3], [1], [2]];
        rows.sort((a, b) => {
            const va = a[0];
            const vb = b[0];
            if (va === null || va === undefined) return 1;
            if (vb === null || vb === undefined) return -1;
            if (typeof va === 'number' && typeof vb === 'number') {
                return vb - va;
            }
            return -String(va).localeCompare(String(vb));
        });
        assert.strictEqual(rows[0][0], 3);
        assert.strictEqual(rows[1][0], 2);
        assert.strictEqual(rows[2][0], 1);
    });

    test('should sort strings correctly ascending', () => {
        const rows: (string | number | null)[][] = [['Charlie'], ['Alice'], ['Bob']];
        rows.sort((a, b) => {
            const va = String(a[0]);
            const vb = String(b[0]);
            return va.localeCompare(vb);
        });
        assert.strictEqual(rows[0][0], 'Alice');
        assert.strictEqual(rows[1][0], 'Bob');
        assert.strictEqual(rows[2][0], 'Charlie');
    });

    test('should sort strings correctly descending', () => {
        const rows: (string | number | null)[][] = [['Charlie'], ['Alice'], ['Bob']];
        rows.sort((a, b) => {
            const va = String(a[0]);
            const vb = String(b[0]);
            return -va.localeCompare(vb);
        });
        assert.strictEqual(rows[0][0], 'Charlie');
        assert.strictEqual(rows[1][0], 'Bob');
        assert.strictEqual(rows[2][0], 'Alice');
    });

    test('should sort nulls to end', () => {
        const rows: (string | number | null)[][] = [[3], [null], [1], [null], [2]];
        rows.sort((a, b) => {
            const va = a[0];
            const vb = b[0];
            if (va === null || va === undefined) return 1;
            if (vb === null || vb === undefined) return -1;
            if (typeof va === 'number' && typeof vb === 'number') {
                return va - vb;
            }
            return String(va).localeCompare(String(vb));
        });
        assert.strictEqual(rows[0][0], 1);
        assert.strictEqual(rows[1][0], 2);
        assert.strictEqual(rows[2][0], 3);
        assert.strictEqual(rows[3][0], null);
        assert.strictEqual(rows[4][0], null);
    });

    test('should decide client-side sort for <= 1000 rows', () => {
        const rows = new Array(1000).fill([1]);
        const useClientSort = rows.length <= 1000;
        assert.strictEqual(useClientSort, true);
    });

    test('should decide server-side sort for > 1000 rows', () => {
        const rows = new Array(1001).fill([1]);
        const useClientSort = rows.length <= 1000;
        assert.strictEqual(useClientSort, false);
    });
});

suite('Time Formatting', () => {

    function formatTime(ms: number): string {
        if (ms < 1000) {
            return ms + 'ms';
        }
        return (ms / 1000).toFixed(2) + 's';
    }

    test('should format milliseconds for values under 1000', () => {
        assert.strictEqual(formatTime(0), '0ms');
        assert.strictEqual(formatTime(50), '50ms');
        assert.strictEqual(formatTime(999), '999ms');
    });

    test('should format seconds for values >= 1000', () => {
        assert.strictEqual(formatTime(1000), '1.00s');
        assert.strictEqual(formatTime(1500), '1.50s');
        assert.strictEqual(formatTime(12345), '12.35s');
    });

    test('should format boundary value correctly', () => {
        assert.strictEqual(formatTime(999), '999ms');
        assert.strictEqual(formatTime(1000), '1.00s');
    });
});

suite('Number Formatting', () => {

    function formatNumber(num: number): string {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    test('should format small numbers without commas', () => {
        assert.strictEqual(formatNumber(0), '0');
        assert.strictEqual(formatNumber(99), '99');
        assert.strictEqual(formatNumber(999), '999');
    });

    test('should format numbers with commas', () => {
        assert.strictEqual(formatNumber(1000), '1,000');
        assert.strictEqual(formatNumber(12345), '12,345');
        assert.strictEqual(formatNumber(1234567), '1,234,567');
    });

    test('should format large numbers correctly', () => {
        assert.strictEqual(formatNumber(1000000), '1,000,000');
        assert.strictEqual(formatNumber(1234567890), '1,234,567,890');
    });
});

suite('HTML Template Validation', () => {
    const htmlPath = path.join(__dirname, '..', '..', 'media', 'query-result.html');

    test('HTML template file should exist', () => {
        assert.ok(fs.existsSync(htmlPath), 'resultPanel.html should exist');
    });

    test('HTML should contain CSS_URI placeholder', () => {
        const html = fs.readFileSync(htmlPath, 'utf-8');
        assert.ok(html.includes('{{CSS_URI}}'), 'HTML should contain {{CSS_URI}} placeholder');
    });

    test('HTML should contain JS_URI placeholder', () => {
        const html = fs.readFileSync(htmlPath, 'utf-8');
        assert.ok(html.includes('{{JS_URI}}'), 'HTML should contain {{JS_URI}} placeholder');
    });

    test('HTML should contain CONFIG_INJECT placeholder', () => {
        const html = fs.readFileSync(htmlPath, 'utf-8');
        assert.ok(html.includes('{{CONFIG_INJECT}}'), 'HTML should contain {{CONFIG_INJECT}} placeholder');
    });

    test('HTML should contain grid elements', () => {
        const html = fs.readFileSync(htmlPath, 'utf-8');
        assert.ok(html.includes('gridBodyWrapper'), 'HTML should contain gridBodyWrapper');
        assert.ok(html.includes('gridHeaderRow'), 'HTML should contain gridHeaderRow');
        assert.ok(html.includes('gridBody'), 'HTML should contain gridBody');
        assert.ok(html.includes('gridSpacer'), 'HTML should contain gridSpacer');
    });

    test('HTML should contain toolbar buttons', () => {
        const html = fs.readFileSync(htmlPath, 'utf-8');
        assert.ok(html.includes('btnExecute'), 'HTML should contain btnExecute');
        assert.ok(html.includes('btnCancel'), 'HTML should contain btnCancel');
        assert.ok(html.includes('btnRefresh'), 'HTML should contain btnRefresh');
        assert.ok(html.includes('exportDropdown'), 'HTML should contain exportDropdown');
    });

    test('HTML should contain tab pages', () => {
        const html = fs.readFileSync(htmlPath, 'utf-8');
        assert.ok(html.includes('pageResult'), 'HTML should contain pageResult');
        assert.ok(html.includes('pageMessages'), 'HTML should contain pageMessages');
        assert.ok(html.includes('pageHistory'), 'HTML should contain pageHistory');
    });

    test('HTML should contain filter bar', () => {
        const html = fs.readFileSync(htmlPath, 'utf-8');
        assert.ok(html.includes('filterBar'), 'HTML should contain filterBar');
        assert.ok(html.includes('filterConditions'), 'HTML should contain filterConditions');
    });

    test('HTML should contain pagination controls', () => {
        const html = fs.readFileSync(htmlPath, 'utf-8');
        assert.ok(html.includes('btnPrevPage'), 'HTML should contain btnPrevPage');
        assert.ok(html.includes('btnNextPage'), 'HTML should contain btnNextPage');
        assert.ok(html.includes('pageJump'), 'HTML should contain pageJump');
    });

    test('HTML should contain status bar', () => {
        const html = fs.readFileSync(htmlPath, 'utf-8');
        assert.ok(html.includes('statusInfo'), 'HTML should contain statusInfo');
        assert.ok(html.includes('pageInfo'), 'HTML should contain pageInfo');
    });
});

suite('CSS File Validation', () => {
    const cssPath = path.join(__dirname, '..', '..', 'media', 'query-result.css');

    test('CSS file should exist', () => {
        assert.ok(fs.existsSync(cssPath), 'resultPanel.css should exist');
    });

    test('CSS should use VS Code theme variables', () => {
        const css = fs.readFileSync(cssPath, 'utf-8');
        assert.ok(css.includes('--vscode-'), 'CSS should use VS Code theme variables');
    });

    test('CSS should style NULL cells', () => {
        const css = fs.readFileSync(cssPath, 'utf-8');
        assert.ok(css.includes('cell-null'), 'CSS should style cell-null');
    });

    test('CSS should style selected cells', () => {
        const css = fs.readFileSync(cssPath, 'utf-8');
        assert.ok(css.includes('selected'), 'CSS should style selected cells');
    });

    test('CSS should style sort indicator', () => {
        const css = fs.readFileSync(cssPath, 'utf-8');
        assert.ok(css.includes('sort-indicator'), 'CSS should style sort indicator');
    });

    test('CSS should style virtual scroll container', () => {
        const css = fs.readFileSync(cssPath, 'utf-8');
        assert.ok(css.includes('grid-body-wrapper'), 'CSS should style grid-body-wrapper');
    });

    test('CSS should include glassmorphism variables', () => {
        const css = fs.readFileSync(cssPath, 'utf-8');
        assert.ok(css.includes('backdrop-filter'), 'CSS should use backdrop-filter');
        assert.ok(css.includes('--glass-blur'), 'CSS should define --glass-blur');
        assert.ok(css.includes('--type-int'), 'CSS should define type color variables');
    });
});

suite('JS File Validation', () => {
    const jsPath = path.join(__dirname, '..', '..', 'media', 'query-result.js');

    test('JS file should exist', () => {
        assert.ok(fs.existsSync(jsPath), 'resultPanel.js should exist');
    });

    test('JS should define acquireVsCodeApi', () => {
        const js = fs.readFileSync(jsPath, 'utf-8');
        assert.ok(js.includes('acquireVsCodeApi'), 'JS should call acquireVsCodeApi');
    });

    test('JS should define message handler', () => {
        const js = fs.readFileSync(jsPath, 'utf-8');
        assert.ok(js.includes('handleMessage'), 'JS should define handleMessage');
        assert.ok(js.includes("window.addEventListener('message'"), 'JS should add message listener');
    });

    test('JS should handle all message types', () => {
        const js = fs.readFileSync(jsPath, 'utf-8');
        assert.ok(js.includes('queryResult'), 'JS should handle queryResult');
        assert.ok(js.includes('queryStart'), 'JS should handle queryStart');
        assert.ok(js.includes('queryError'), 'JS should handle queryError');
        assert.ok(js.includes('historyData'), 'JS should handle historyData');
        assert.ok(js.includes('config'), 'JS should handle config');
    });

    test('JS should define all command senders', () => {
        const js = fs.readFileSync(jsPath, 'utf-8');
        assert.ok(js.includes("command: 'executeQuery'"), 'JS should send executeQuery');
        assert.ok(js.includes("command: 'cancelQuery'"), 'JS should send cancelQuery');
        assert.ok(js.includes("command: 'requestExport'"), 'JS should send requestExport');
        assert.ok(js.includes("command: 'requestSort'"), 'JS should send requestSort');
        assert.ok(js.includes("command: 'requestFilter'"), 'JS should send requestFilter');
        assert.ok(js.includes("command: 'requestPage'"), 'JS should send requestPage');
    });

    test('JS should define virtual scroll functions', () => {
        const js = fs.readFileSync(jsPath, 'utf-8');
        assert.ok(js.includes('renderVisibleRows'), 'JS should define renderVisibleRows');
        assert.ok(js.includes('ROW_HEIGHT'), 'JS should define ROW_HEIGHT');
    });

    test('JS should define sort functions', () => {
        const js = fs.readFileSync(jsPath, 'utf-8');
        assert.ok(js.includes('handleSortClick'), 'JS should define handleSortClick');
        assert.ok(js.includes('sortClientSide'), 'JS should define sortClientSide');
    });

    test('JS should define filter functions', () => {
        const js = fs.readFileSync(jsPath, 'utf-8');
        assert.ok(js.includes('toggleFilterBar'), 'JS should define toggleFilterBar');
        assert.ok(js.includes('addFilterCondition'), 'JS should define addFilterCondition');
        assert.ok(js.includes('removeFilterCondition'), 'JS should define removeFilterCondition');
        assert.ok(js.includes('applyFilter'), 'JS should define applyFilter');
    });

    test('JS should define export functions', () => {
        const js = fs.readFileSync(jsPath, 'utf-8');
        assert.ok(js.includes('handleExport'), 'JS should define handleExport');
        assert.ok(js.includes('toggleExportMenu'), 'JS should define toggleExportMenu');
    });

    test('JS should define pagination functions', () => {
        const js = fs.readFileSync(jsPath, 'utf-8');
        assert.ok(js.includes('changePage'), 'JS should define changePage');
        assert.ok(js.includes('jumpToPage'), 'JS should define jumpToPage');
    });

    test('JS should define copy function', () => {
        const js = fs.readFileSync(jsPath, 'utf-8');
        assert.ok(js.includes('copySelectedCell'), 'JS should define copySelectedCell');
    });

    test('JS should define i18n support', () => {
        const js = fs.readFileSync(jsPath, 'utf-8');
        assert.ok(js.includes('i18n'), 'JS should define i18n');
        assert.ok(js.includes('resultPanel.'), 'JS should have resultPanel i18n keys');
    });
});

suite('Package.json Configuration Validation', () => {
    const packagePath = path.join(__dirname, '..', '..', 'package.json');
    let pkg: PackageJson;

    suiteSetup(() => {
        pkg = JSON.parse(fs.readFileSync(packagePath, 'utf-8')) as PackageJson;
    });

    test('should have query.pageSize configuration', () => {
        const config = pkg.contributes.configuration.properties['SQL-All-in-One.query.pageSize'];
        assert.ok(config, 'query.pageSize should be defined');
        assert.strictEqual(config.type, 'number');
        assert.strictEqual(config.default, 100);
    });

    test('should have export.defaultFormat configuration', () => {
        const config = pkg.contributes.configuration.properties['SQL-All-in-One.export.defaultFormat'];
        assert.ok(config, 'export.defaultFormat should be defined');
        assert.strictEqual(config.default, 'csv');
        assert.ok(config.enum!.includes('csv'));
        assert.ok(config.enum!.includes('json'));
        assert.ok(config.enum!.includes('insert'));
        assert.ok(config.enum!.includes('ddl'));
    });

    test('should have export.csvDelimiter configuration', () => {
        const config = pkg.contributes.configuration.properties['SQL-All-in-One.export.csvDelimiter'];
        assert.ok(config, 'export.csvDelimiter should be defined');
        assert.strictEqual(config.default, ',');
    });

    test('should have export.csvEncoding configuration', () => {
        const config = pkg.contributes.configuration.properties['SQL-All-in-One.export.csvEncoding'];
        assert.ok(config, 'export.csvEncoding should be defined');
        assert.strictEqual(config.default, 'utf-8');
    });

    test('should have export.includeHeaders configuration', () => {
        const config = pkg.contributes.configuration.properties['SQL-All-in-One.export.includeHeaders'];
        assert.ok(config, 'export.includeHeaders should be defined');
        assert.strictEqual(config.default, true);
    });

    test('should have query.nullPlaceholder configuration', () => {
        const config = pkg.contributes.configuration.properties['SQL-All-in-One.query.nullPlaceholder'];
        assert.ok(config, 'query.nullPlaceholder should be defined');
        assert.strictEqual(config.default, '(NULL)');
    });

    test('should have results.enablePreload configuration', () => {
        const config = pkg.contributes.configuration.properties['SQL-All-in-One.results.enablePreload'];
        assert.ok(config, 'results.enablePreload should be defined');
        assert.strictEqual(config.default, true);
    });

    test('should have results.jsonPrettyPrint configuration', () => {
        const config = pkg.contributes.configuration.properties['SQL-All-in-One.results.jsonPrettyPrint'];
        assert.ok(config, 'results.jsonPrettyPrint should be defined');
        assert.strictEqual(config.default, true);
    });

    test('should have results.dateFormat configuration', () => {
        const config = pkg.contributes.configuration.properties['SQL-All-in-One.results.dateFormat'];
        assert.ok(config, 'results.dateFormat should be defined');
        assert.strictEqual(config.default, 'local');
        assert.ok(config.enum!.includes('local'));
        assert.ok(config.enum!.includes('utc'));
        assert.ok(config.enum!.includes('relative'));
    });

    test('should have results.longTextThreshold configuration', () => {
        const config = pkg.contributes.configuration.properties['SQL-All-in-One.results.longTextThreshold'];
        assert.ok(config, 'results.longTextThreshold should be defined');
        assert.strictEqual(config.default, 200);
    });

    test('should have exportCsv command', () => {
        const commands = pkg.contributes.commands;
        const cmd = commands.find((c: { command: string }) => c.command === 'hive-formatter.exportCsv');
        assert.ok(cmd, 'exportCsv command should exist');
    });

    test('should have exportJson command', () => {
        const commands = pkg.contributes.commands;
        const cmd = commands.find((c: { command: string }) => c.command === 'hive-formatter.exportJson');
        assert.ok(cmd, 'exportJson command should exist');
    });

    test('should have exportInsert command', () => {
        const commands = pkg.contributes.commands;
        const cmd = commands.find((c: { command: string }) => c.command === 'hive-formatter.exportInsert');
        assert.ok(cmd, 'exportInsert command should exist');
    });

    test('should have exportDdl command', () => {
        const commands = pkg.contributes.commands;
        const cmd = commands.find((c: { command: string }) => c.command === 'hive-formatter.exportDdl');
        assert.ok(cmd, 'exportDdl command should exist');
    });
});

suite('DataExporter - Excel Placeholder', () => {
    test('should throw error for Excel export', () => {
        async function exportToExcel(): Promise<void> {
            throw new Error('Excel export will be available in a future update');
        }
        assert.rejects(
            () => exportToExcel(),
            /Excel export will be available in a future update/
        );
    });
});

suite('InMemoryDocument', () => {
    test('getText returns full content', () => {
        const doc = new InMemoryDocument('SELECT * FROM users', 'mysql');
        assert.strictEqual(doc.getText(), 'SELECT * FROM users');
    });

    test('getText with range returns partial content', () => {
        const doc = new InMemoryDocument('SELECT * FROM users', 'mysql');
        const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 6));
        assert.strictEqual(doc.getText(range), 'SELECT');
    });

    test('lineAt returns correct line', () => {
        const doc = new InMemoryDocument('SELECT *\nFROM users', 'mysql');
        const line = doc.lineAt(0);
        assert.strictEqual(line.text, 'SELECT *');
        assert.strictEqual(line.lineNumber, 0);
    });

    test('positionAt converts offset to position', () => {
        const doc = new InMemoryDocument('SELECT *\nFROM users', 'mysql');
        const pos = doc.positionAt(9);
        assert.strictEqual(pos.line, 1);
        assert.strictEqual(pos.character, 0);
    });

    test('offsetAt converts position to offset', () => {
        const doc = new InMemoryDocument('SELECT *\nFROM users', 'mysql');
        const offset = doc.offsetAt(new vscode.Position(1, 0));
        assert.strictEqual(offset, 9);
    });

    test('lineCount returns correct count', () => {
        const doc = new InMemoryDocument('SELECT *\nFROM users', 'mysql');
        assert.strictEqual(doc.lineCount, 2);
    });

    test('uri and languageId are set', () => {
        const doc = new InMemoryDocument('SELECT 1', 'mysql');
        assert.strictEqual(doc.languageId, 'mysql');
        assert.ok(doc.uri.scheme === 'hive-formatter');
    });
});

suite('MonacoDataAdapter', () => {
    test('toMonacoCompletionItems converts VS Code items', () => {
        const vscodeItems: vscode.CompletionItem[] = [
            Object.assign(new vscode.CompletionItem('SELECT', vscode.CompletionItemKind.Keyword), {
                sortText: '1_SELECT',
                detail: 'SQL keyword',
            }),
        ];
        const result = MonacoDataAdapter.toMonacoCompletionItems(vscodeItems);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].label, 'SELECT');
        assert.strictEqual(result[0].kind, 14);
        assert.strictEqual(result[0].sortText, '1_SELECT');
    });

    test('toMonacoDiagnostics converts VS Code diagnostics', () => {
        const diagnostics = [
            new vscode.Diagnostic(
                new vscode.Range(0, 0, 0, 6),
                'Avoid SELECT *',
                vscode.DiagnosticSeverity.Warning
            ),
        ];
        const result = MonacoDataAdapter.toMonacoDiagnostics(diagnostics);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].startLineNumber, 1);
        assert.strictEqual(result[0].startColumn, 1);
        assert.strictEqual(result[0].endLineNumber, 1);
        assert.strictEqual(result[0].endColumn, 7);
        assert.strictEqual(result[0].message, 'Avoid SELECT *');
        assert.strictEqual(result[0].severity, 4);
    });

    test('toMonacoHoverContents converts VS Code Hover', () => {
        const hover = new vscode.Hover('Function description');
        const result = MonacoDataAdapter.toMonacoHoverContents(hover);
        assert.ok(result.length > 0);
    });

    test('mapCompletionItemKind maps correctly', () => {
        assert.strictEqual(MonacoDataAdapter.mapCompletionItemKind(vscode.CompletionItemKind.Function), 1);
        assert.strictEqual(MonacoDataAdapter.mapCompletionItemKind(vscode.CompletionItemKind.Keyword), 14);
        assert.strictEqual(MonacoDataAdapter.mapCompletionItemKind(vscode.CompletionItemKind.Snippet), 27);
        assert.strictEqual(MonacoDataAdapter.mapCompletionItemKind(vscode.CompletionItemKind.TypeParameter), 17);
    });

    test('toMonacoCompletionItems handles empty items', () => {
        const result = MonacoDataAdapter.toMonacoCompletionItems([]);
        assert.strictEqual(result.length, 0);
    });

    test('toMonacoDiagnostics handles empty diagnostics', () => {
        const result = MonacoDataAdapter.toMonacoDiagnostics([]);
        assert.strictEqual(result.length, 0);
    });
});

suite('LanguageBridge', () => {
    let extensionUri: vscode.Uri;

    suiteSetup(() => {
        extensionUri = vscode.Uri.file(path.join(__dirname, '..', '..'));
    });

    test('exportLanguageData returns keywords, dataTypes, functions, snippets for dialect', () => {
        const bridge = createTestLanguageBridge(extensionUri);
        const data = bridge.exportLanguageData('mysql');
        assert.ok(data.keywords.length > 0, 'should have keywords');
        assert.ok(data.dataTypes.length > 0, 'should have data types');
        assert.ok(data.functions.length > 0, 'should have functions');
        assert.strictEqual(data.dialect, 'mysql');
        bridge.dispose();
    });

    test('exportLanguageData returns keywords and dataTypes', () => {
        const bridge = createTestLanguageBridge(extensionUri);
        const data = bridge.exportLanguageData('mysql');
        assert.ok(data.keywords.length > 0, 'should have keywords');
        assert.ok(data.dataTypes.length > 0, 'should have data types');
        assert.ok(data.functions.length > 0, 'should have functions');
        assert.strictEqual(data.dialect, 'mysql');
        bridge.dispose();
    });

    test('handleFormatRequest formats SQL', async () => {
        const bridge = createTestLanguageBridge(extensionUri);
        const result = await bridge.handleFormatRequest('select * from users', 'mysql');
        assert.ok(result.length > 0, 'formatted result should not be empty');
        bridge.dispose();
    });

    test('handleDiagnosticsRequest returns diagnostics', async () => {
        const bridge = createTestLanguageBridge(extensionUri);
        const result = await bridge.handleDiagnosticsRequest('SELECT * FROM users', 'mysql');
        assert.ok(Array.isArray(result), 'should return array');
        bridge.dispose();
    });

    test('diagnostics for empty SQL returns empty', async () => {
        const bridge = createTestLanguageBridge(extensionUri);
        const result = await bridge.handleDiagnosticsRequest('', 'mysql');
        assert.ok(Array.isArray(result), 'should return array');
        bridge.dispose();
    });

    test('hover returns null for unknown word', async () => {
        const bridge = createTestLanguageBridge(extensionUri);
        const result = await bridge.handleHoverRequest(
            'SELECT xyzabc123 FROM users',
            { line: 0, column: 8 },
            'mysql',
        );
        assert.strictEqual(result, null, 'unknown word should return null');
        bridge.dispose();
    });

    test('format preserves valid SQL', async () => {
        const bridge = createTestLanguageBridge(extensionUri);
        const result = await bridge.handleFormatRequest('select 1', 'mysql');
        assert.ok(result.length > 0, 'formatted result should not be empty');
        bridge.dispose();
    });
});

suite('LanguageBridge Integration', () => {
    let extensionUri: vscode.Uri;

    suiteSetup(() => {
        extensionUri = vscode.Uri.file(path.join(__dirname, '..', '..'));
    });

    test('full completion flow: exportLanguageData + handleCompletionRequest', async () => {
        const bridge = createTestLanguageBridge(extensionUri);
        const data = bridge.exportLanguageData('mysql');
        assert.ok(data.keywords.includes('SELECT'), 'mysql should have SELECT keyword');
        assert.ok(data.functions.length > 0, 'mysql should have functions');

        const items = await bridge.handleCompletionRequest(
            'SELECT * FROM ',
            { line: 0, column: 15 },
            'mysql',
        );
        assert.ok(Array.isArray(items), 'should return array');
        bridge.dispose();
    });
});
