import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
    importFromCsv,
    importFromJson,
    importFromSql,
    detectCsvDelimiter,
    detectFileFormat,
    type CsvImportOptions,
    type JsonImportOptions,
} from '../database/transfer/DataImporter';
import type { IDatabaseAdapter, QueryParam } from '../database/adapters/IDatabaseAdapter';

const mockQueryResult: import('../database/adapters/IDatabaseAdapter').QueryResult = {
    queryId: 'mock-qid',
    status: 'success',
    columns: [],
    rows: [],
    rowCount: 0,
    executionTime: 0,
};

function createMockAdapter(executeFn: (sql: string, params?: QueryParam[]) => Promise<import('../database/adapters/IDatabaseAdapter').QueryResult>): IDatabaseAdapter {
    return {
        connect: async () => { /* noop */ },
        disconnect: async () => { /* noop */ },
        isConnected: () => false,
        testConnection: async () => ({ success: true }),
        execute: executeFn,
        executeBatch: async () => [],
        getExplainPlan: async () => ({ format: 'text' as const, raw: '', nodes: [] }),
        listDatabases: async () => [],
        listTables: async () => [],
        describeTable: async () => ({ columns: [], primaryKey: [], indexes: [], foreignKeys: [], triggers: [] }),
        getDialectCapabilities: () => ({
            supportsMultipleDatabases: true,
            supportsSchema: false,
            supportsExplain: true,
            supportsExplainAnalyze: false,
            supportsPreparedStatement: false,
            supportsCancel: true,
            supportsSshTunnel: false,
            maxConcurrentQueries: 10,
            supportedObjectTypes: [],
        }),
        getSupportedDataTypes: () => [],
        getTableCreateScript: async () => '',
        getDatabaseCreateScript: async () => '',
        beginTransaction: async () => { /* noop */ },
        commit: async () => { /* noop */ },
        rollback: async () => { /* noop */ },
        cancelQuery: async () => { /* noop */ },
        getConnectionId: () => 'mock',
        getTableData: async () => ({ columns: [], rows: [], totalRows: 0, hasMore: false }),
        updateRow: async () => ({ success: true }),
        deleteRow: async () => ({ success: true }),
        insertRow: async () => ({ success: true, data: {} }),
        listViews: async () => [],
        listProcedures: async () => [],
        listFunctions: async () => [],
        listTriggers: async () => [],
        listIndexes: async () => [],
        getProcedureScript: async () => '',
        getFunctionScript: async () => '',
        getTriggerScript: async () => '',
        checkConnectionHealth: async () => true,
        listSchemas: async () => [],
        getTableDDL: async () => '',
        getViewDDL: async () => '',
        getFunctionDDL: async () => '',
        getProcedureDDL: async () => '',
        getTriggerDDL: async () => '',
        getRoutineParameters: async () => [],
        getTableRowCount: async () => 0,
        quoteIdentifier: (id: string) => '`' + id + '`',
        getPoolStatus: () => ({
            totalConnections: 0,
            activeConnections: 0,
            idleConnections: 0,
            waitingRequests: 0,
            connectionLimit: 5,
            acquireTimeout: 60000,
        }),
    } as IDatabaseAdapter;
}

suite('DataImporter - detectFileFormat', () => {

    test('should detect CSV format from .csv extension', () => {
        assert.strictEqual(detectFileFormat('data.csv'), 'csv');
    });

    test('should detect CSV format from .tsv extension', () => {
        assert.strictEqual(detectFileFormat('data.tsv'), 'csv');
    });

    test('should detect JSON format from .json extension', () => {
        assert.strictEqual(detectFileFormat('data.json'), 'json');
    });

    test('should detect SQL format from .sql extension', () => {
        assert.strictEqual(detectFileFormat('data.sql'), 'sql');
    });

    test('should default to CSV for unknown extensions', () => {
        assert.throws(() => detectFileFormat('data.txt'), /Unsupported/);
    });

    test('should handle uppercase extensions', () => {
        assert.strictEqual(detectFileFormat('DATA.CSV'), 'csv');
        assert.strictEqual(detectFileFormat('DATA.JSON'), 'json');
        assert.strictEqual(detectFileFormat('DATA.SQL'), 'sql');
    });

    test('should handle files without extension', () => {
        assert.throws(() => detectFileFormat('data'), /Unsupported/);
    });

    test('should handle path with directories', () => {
        assert.strictEqual(detectFileFormat('/path/to/data.csv'), 'csv');
        assert.strictEqual(detectFileFormat('/path/to/data.json'), 'json');
    });
});

suite('DataImporter - detectCsvDelimiter', () => {

    test('should detect comma delimiter', () => {
        assert.strictEqual(detectCsvDelimiter('name,age,city'), ',');
    });

    test('should detect tab delimiter', () => {
        assert.strictEqual(detectCsvDelimiter('name\tage\tcity'), '\t');
    });

    test('should detect semicolon delimiter', () => {
        assert.strictEqual(detectCsvDelimiter('name;age;city'), ';');
    });

    test('should default to comma for single-column files', () => {
        assert.strictEqual(detectCsvDelimiter('name'), ',');
    });
});

suite('DataImporter - importFromJson', () => {

    let tempDir: string;

    suiteSetup(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'json-import-test-'));
    });

    suiteTeardown(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    test('should import JSON array to table', async () => {
        const filePath = path.join(tempDir, 'data.json');
        fs.writeFileSync(filePath, JSON.stringify([
            { id: 1, name: 'Alice', age: 30 },
            { id: 2, name: 'Bob', age: 25 },
        ]));

        const adapter = createMockAdapter(async () => (mockQueryResult));
        const options: JsonImportOptions = {
            onError: 'skip',
            dedupStrategy: 'ignore',
        };

        const result = await importFromJson(adapter, 'users', filePath, options);
        assert.strictEqual(result.success, true);
        assert.strictEqual(result.totalRows, 2);
        assert.strictEqual(result.importedRows, 2);
        assert.strictEqual(result.skippedRows, 0);
        assert.strictEqual(result.errors.length, 0);
    });

    test('should reject non-array JSON', async () => {
        const filePath = path.join(tempDir, 'notarray.json');
        fs.writeFileSync(filePath, JSON.stringify({ id: 1, name: 'Alice' }));

        const adapter = createMockAdapter(async () => (mockQueryResult));
        const options: JsonImportOptions = {
            onError: 'skip',
            dedupStrategy: 'ignore',
        };

        const result = await importFromJson(adapter, 'users', filePath, options);
        assert.strictEqual(result.success, false);
        assert.strictEqual(result.errors.length, 1);
        assert.ok(result.errors[0].message.includes('array'));
    });

    test('should handle empty JSON array', async () => {
        const filePath = path.join(tempDir, 'empty.json');
        fs.writeFileSync(filePath, '[]');

        const adapter = createMockAdapter(async () => (mockQueryResult));
        const options: JsonImportOptions = {
            onError: 'skip',
            dedupStrategy: 'ignore',
        };

        const result = await importFromJson(adapter, 'users', filePath, options);
        assert.strictEqual(result.totalRows, 0);
        assert.strictEqual(result.importedRows, 0);
    });

    test('should handle null values in JSON', async () => {
        const filePath = path.join(tempDir, 'nulls.json');
        fs.writeFileSync(filePath, JSON.stringify([
            { id: 1, name: null, age: 30 },
        ]));

        const adapter = createMockAdapter(async () => (mockQueryResult));
        const options: JsonImportOptions = {
            onError: 'skip',
            dedupStrategy: 'ignore',
        };

        const result = await importFromJson(adapter, 'users', filePath, options);
        assert.strictEqual(result.success, true);
        assert.strictEqual(result.importedRows, 1);
    });

    test('should handle batch insert failure with skip mode', async () => {
        const filePath = path.join(tempDir, 'batchfail.json');
        fs.writeFileSync(filePath, JSON.stringify([
            { id: 1, name: 'Alice' },
            { id: 2, name: 'Bob' },
        ]));

        let callCount = 0;
        const adapter = createMockAdapter(async () => {
            callCount++;
            if (callCount === 1) throw new Error('Batch insert failed');
            return mockQueryResult;
        });

        const options: JsonImportOptions = {
            onError: 'skip',
            dedupStrategy: 'ignore',
            batchSize: 100,
        };

        const result = await importFromJson(adapter, 'users', filePath, options);
        assert.strictEqual(result.totalRows, 2);
    });

    test('should handle batch insert failure with abort mode', async () => {
        const filePath = path.join(tempDir, 'abort.json');
        fs.writeFileSync(filePath, JSON.stringify([
            { id: 1, name: 'Alice' },
            { id: 2, name: 'Bob' },
        ]));

        const adapter = createMockAdapter(async () => {
            throw new Error('Insert failed');
        });

        const options: JsonImportOptions = {
            onError: 'abort',
            dedupStrategy: 'ignore',
        };

        const result = await importFromJson(adapter, 'users', filePath, options);
        assert.strictEqual(result.success, false);
        assert.ok(result.errors.length > 0);
    });
});

suite('DataImporter - importFromSql', () => {

    let tempDir: string;

    suiteSetup(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sql-import-test-'));
    });

    suiteTeardown(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    test('should import SQL file with multiple statements', async () => {
        const filePath = path.join(tempDir, 'data.sql');
        fs.writeFileSync(filePath, "INSERT INTO users (name) VALUES ('Alice');\nINSERT INTO users (name) VALUES ('Bob');");

        const executedSqls: string[] = [];
        const adapter = createMockAdapter(async (sql: string) => {
            executedSqls.push(sql);
            return mockQueryResult;
        });

        const result = await importFromSql(adapter, filePath);
        assert.strictEqual(result.importedRows, 2);
        assert.strictEqual(result.skippedRows, 0);
    });

    test('should skip failed SQL statements', async () => {
        const filePath = path.join(tempDir, 'errors.sql');
        fs.writeFileSync(filePath, "INSERT INTO users (name) VALUES ('Alice');\nBAD SQL;\nINSERT INTO users (name) VALUES ('Bob');");

        let callCount = 0;
        const adapter = createMockAdapter(async () => {
            callCount++;
            if (callCount === 2) throw new Error('Syntax error');
            return mockQueryResult;
        });

        const result = await importFromSql(adapter, filePath);
        assert.strictEqual(result.importedRows, 2);
        assert.strictEqual(result.skippedRows, 1);
        assert.strictEqual(result.errors.length, 1);
    });

    test('should handle empty SQL file', async () => {
        const filePath = path.join(tempDir, 'empty.sql');
        fs.writeFileSync(filePath, '');

        const adapter = createMockAdapter(async () => (mockQueryResult));
        const result = await importFromSql(adapter, filePath);
        assert.strictEqual(result.importedRows, 0);
    });

    test('should handle SQL file with only whitespace/semicolons', async () => {
        const filePath = path.join(tempDir, 'whitespace.sql');
        fs.writeFileSync(filePath, '  ;  ;  ');

        const adapter = createMockAdapter(async () => (mockQueryResult));
        const result = await importFromSql(adapter, filePath);
        assert.strictEqual(result.importedRows, 0);
    });
});

suite('DataImporter - importFromCsv', () => {

    let tempDir: string;

    suiteSetup(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'csv-import-test-'));
    });

    suiteTeardown(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    test('should import CSV file with headers', async () => {
        const filePath = path.join(tempDir, 'data.csv');
        fs.writeFileSync(filePath, 'id,name,age\n1,Alice,30\n2,Bob,25');

        const executedSqls: string[] = [];
        const adapter = createMockAdapter(async (sql: string) => {
            executedSqls.push(sql);
            return mockQueryResult;
        });

        const options: CsvImportOptions = {
            onError: 'skip',
            dedupStrategy: 'ignore',
        };

        const result = await importFromCsv(adapter, 'users', filePath, options);
        assert.strictEqual(result.totalRows, 2);
        assert.strictEqual(result.importedRows, 2);
        assert.strictEqual(result.errors.length, 0);
    });

    test('should import CSV with custom delimiter', async () => {
        const filePath = path.join(tempDir, 'semi.csv');
        fs.writeFileSync(filePath, 'id;name;age\n1;Alice;30\n2;Bob;25');

        const executedSqls: string[] = [];
        const adapter = createMockAdapter(async (sql: string) => {
            executedSqls.push(sql);
            return mockQueryResult;
        });

        const options: CsvImportOptions = {
            delimiter: ';',
            onError: 'skip',
            dedupStrategy: 'ignore',
        };

        const result = await importFromCsv(adapter, 'users', filePath, options);
        assert.strictEqual(result.totalRows, 2);
        assert.strictEqual(result.importedRows, 2);
    });

    test('should import CSV with field mapping', async () => {
        const filePath = path.join(tempDir, 'mapped.csv');
        fs.writeFileSync(filePath, 'user_id,user_name\n1,Alice\n2,Bob');

        const executedSqls: string[] = [];
        const adapter = createMockAdapter(async (sql: string) => {
            executedSqls.push(sql);
            return mockQueryResult;
        });

        const options: CsvImportOptions = {
            mapping: { user_id: 'id', user_name: 'name' },
            onError: 'skip',
            dedupStrategy: 'ignore',
        };

        const result = await importFromCsv(adapter, 'users', filePath, options);
        assert.strictEqual(result.totalRows, 2);
        assert.strictEqual(result.importedRows, 2);
        assert.ok(executedSqls[0].includes('`id`'));
        assert.ok(executedSqls[0].includes('`name`'));
    });

    test('should skip columns with __skip__ mapping', async () => {
        const filePath = path.join(tempDir, 'skipcol.csv');
        fs.writeFileSync(filePath, 'id,name,age\n1,Alice,30');

        const executedSqls: string[] = [];
        const adapter = createMockAdapter(async (sql: string) => {
            executedSqls.push(sql);
            return mockQueryResult;
        });

        const options: CsvImportOptions = {
            mapping: { id: 'id', name: 'name', age: '__skip__' },
            onError: 'skip',
            dedupStrategy: 'ignore',
        };

        const result = await importFromCsv(adapter, 'users', filePath, options);
        assert.strictEqual(result.importedRows, 1);
        assert.ok(!executedSqls[0].includes('`age`'));
    });

    test('should handle CSV with quoted fields', async () => {
        const filePath = path.join(tempDir, 'quoted.csv');
        fs.writeFileSync(filePath, 'id,name\n1,"Alice, Jr."\n2,"Bob ""The Builder"""');

        const executedSqls: string[] = [];
        const adapter = createMockAdapter(async (sql: string) => {
            executedSqls.push(sql);
            return mockQueryResult;
        });

        const options: CsvImportOptions = {
            onError: 'skip',
            dedupStrategy: 'ignore',
        };

        const result = await importFromCsv(adapter, 'users', filePath, options);
        assert.strictEqual(result.totalRows, 2);
        assert.strictEqual(result.importedRows, 2);
    });

    test('should handle CSV with batch insert failure (skip mode)', async () => {
        const filePath = path.join(tempDir, 'batchfail.csv');
        fs.writeFileSync(filePath, 'id,name\n1,Alice\n2,Bob');

        const adapter = createMockAdapter(async () => {
            throw new Error('Insert failed');
        });

        const options: CsvImportOptions = {
            onError: 'skip',
            dedupStrategy: 'ignore',
        };

        const result = await importFromCsv(adapter, 'users', filePath, options);
        assert.strictEqual(result.totalRows, 2);
        assert.strictEqual(result.skippedRows, 2);
    });

    test('should handle CSV with batch insert failure (abort mode)', async () => {
        const filePath = path.join(tempDir, 'abort.csv');
        fs.writeFileSync(filePath, 'id,name\n1,Alice\n2,Bob');

        const adapter = createMockAdapter(async () => {
            throw new Error('Insert failed');
        });

        const options: CsvImportOptions = {
            onError: 'abort',
            dedupStrategy: 'ignore',
        };

        const result = await importFromCsv(adapter, 'users', filePath, options);
        assert.strictEqual(result.success, false);
        assert.ok(result.errors.length > 0);
    });

    test('should handle empty CSV file', async () => {
        const filePath = path.join(tempDir, 'empty.csv');
        fs.writeFileSync(filePath, '');

        const adapter = createMockAdapter(async () => (mockQueryResult));

        const options: CsvImportOptions = {
            onError: 'skip',
            dedupStrategy: 'ignore',
        };

        const result = await importFromCsv(adapter, 'users', filePath, options);
        assert.strictEqual(result.totalRows, 0);
        assert.strictEqual(result.importedRows, 0);
    });

    test('should handle CSV with only headers', async () => {
        const filePath = path.join(tempDir, 'headers_only.csv');
        fs.writeFileSync(filePath, 'id,name,age');

        const adapter = createMockAdapter(async () => (mockQueryResult));

        const options: CsvImportOptions = {
            onError: 'skip',
            dedupStrategy: 'ignore',
        };

        const result = await importFromCsv(adapter, 'users', filePath, options);
        assert.strictEqual(result.totalRows, 0);
        assert.strictEqual(result.importedRows, 0);
    });
});

suite('DataImporter - SQL value formatting', () => {

    test('should format NULL values correctly in generated SQL', async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'format-test-'));
        const filePath = path.join(tempDir, 'nulls.json');
        fs.writeFileSync(filePath, JSON.stringify([
            { id: 1, name: null },
        ]));

        const executedSqls: string[] = [];
        const executedParams: QueryParam[][] = [];
        const adapter = createMockAdapter(async (sql: string, params?: QueryParam[]) => {
            executedSqls.push(sql);
            if (params) { executedParams.push(params); }
            return mockQueryResult;
        });

        const options: JsonImportOptions = {
            onError: 'skip',
            dedupStrategy: 'ignore',
        };

        await importFromJson(adapter, 'users', filePath, options);
        assert.ok(executedSqls.length > 0);
        // The importer uses parameterized queries (? placeholders) to prevent
        // SQL injection, so NULL values are passed as null params rather than
        // inlined into the SQL text.
        assert.ok(executedSqls[0].includes('?'), 'Should use parameterized placeholders');
        const params = executedParams[0];
        const nullParam = params.find((p) => p.value === null);
        assert.ok(nullParam, 'Should pass null as a parameter value');

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    test('should escape single quotes in string values', async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'format-test-'));
        const filePath = path.join(tempDir, 'quotes.json');
        fs.writeFileSync(filePath, JSON.stringify([
            { id: 1, name: "O'Brien" },
        ]));

        const executedSqls: string[] = [];
        const executedParams: QueryParam[][] = [];
        const adapter = createMockAdapter(async (sql: string, params?: QueryParam[]) => {
            executedSqls.push(sql);
            if (params) { executedParams.push(params); }
            return mockQueryResult;
        });

        const options: JsonImportOptions = {
            onError: 'skip',
            dedupStrategy: 'ignore',
        };

        await importFromJson(adapter, 'users', filePath, options);
        assert.ok(executedSqls.length > 0);
        // With parameterized queries the raw string value is passed as a param,
        // so single quotes do not need to be escaped in the SQL text.
        const params = executedParams[0];
        const nameParam = params.find((p) => p.value === "O'Brien");
        assert.ok(nameParam, 'Should pass the string value (with single quote) as a parameter');

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    test('should format numbers without quotes', async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'format-test-'));
        const filePath = path.join(tempDir, 'numbers.json');
        fs.writeFileSync(filePath, JSON.stringify([
            { id: 1, age: 30, score: 95.5 },
        ]));

        const executedSqls: string[] = [];
        const executedParams: QueryParam[][] = [];
        const adapter = createMockAdapter(async (sql: string, params?: QueryParam[]) => {
            executedSqls.push(sql);
            if (params) { executedParams.push(params); }
            return mockQueryResult;
        });

        const options: JsonImportOptions = {
            onError: 'skip',
            dedupStrategy: 'ignore',
        };

        await importFromJson(adapter, 'users', filePath, options);
        assert.ok(executedSqls.length > 0);
        // Numbers are passed as numeric params (not quoted strings) via the
        // parameterized query interface.
        const params = executedParams[0];
        assert.ok(params.some((p) => p.value === 30), 'Should pass integer as a numeric parameter');
        assert.ok(params.some((p) => p.value === 95.5), 'Should pass decimal as a numeric parameter');

        fs.rmSync(tempDir, { recursive: true, force: true });
    });
});

suite('DataImporter - batch processing', () => {

    test('should respect batch size for JSON import', async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'batch-test-'));
        const filePath = path.join(tempDir, 'large.json');

        const data = [];
        for (let i = 0; i < 25; i++) {
            data.push({ id: i, name: `User${i}` });
        }
        fs.writeFileSync(filePath, JSON.stringify(data));

        const executedSqls: string[] = [];
        const adapter = createMockAdapter(async (sql: string) => {
            executedSqls.push(sql);
            return mockQueryResult;
        });

        const options: JsonImportOptions = {
            batchSize: 10,
            onError: 'skip',
            dedupStrategy: 'ignore',
        };

        const result = await importFromJson(adapter, 'users', filePath, options);
        assert.strictEqual(result.importedRows, 25);
        assert.ok(executedSqls.length >= 3, 'Should have at least 3 batches for 25 rows with batch size 10');

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    test('should respect batch size for CSV import', async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'batch-test-'));
        const filePath = path.join(tempDir, 'large.csv');

        let csvContent = 'id,name\n';
        for (let i = 0; i < 25; i++) {
            csvContent += `${i},User${i}\n`;
        }
        fs.writeFileSync(filePath, csvContent);

        const executedSqls: string[] = [];
        const adapter = createMockAdapter(async (sql: string) => {
            executedSqls.push(sql);
            return mockQueryResult;
        });

        const options: CsvImportOptions = {
            batchSize: 10,
            onError: 'skip',
            dedupStrategy: 'ignore',
        };

        const result = await importFromCsv(adapter, 'users', filePath, options);
        assert.strictEqual(result.totalRows, 25);
        assert.strictEqual(result.importedRows, 25);
        assert.ok(executedSqls.length >= 3, 'Should have at least 3 batches');

        fs.rmSync(tempDir, { recursive: true, force: true });
    });
});
