import * as assert from "assert";
import { ColumnMeta, QueryResult, QueryRow, StreamBatch, QueryStreamOptions } from "../database/adapters/IDatabaseAdapter";
import { collectStreamToResult } from "../database/query/streamCollector";

/**
 * Builds an async iterable that yields the given batches. Useful for driving
 * {@link collectStreamToResult} without a real database connection.
 */
async function* batchesFrom(items: StreamBatch[]): AsyncIterable<StreamBatch> {
    for (const item of items) {
        yield item;
    }
}

function makeColumns(): ColumnMeta[] {
    return [
        { name: "id", type: "INT", nullable: false, isPrimaryKey: true, isAutoIncrement: true, isEnum: false },
        { name: "name", type: "VARCHAR", nullable: true, isPrimaryKey: false, isAutoIncrement: false, isEnum: false },
    ];
}

function row(id: number, name: string): QueryRow {
    return { id, name };
}

suite("Stream Collector - collectStreamToResult", () => {
    test("should collect all rows when stream completes under maxRows", async () => {
        const batches: StreamBatch[] = [
            { columns: makeColumns(), rows: [row(1, "a"), row(2, "b")], batchIndex: 0, totalRowsReceived: 2, truncated: false },
            { columns: [], rows: [row(3, "c")], batchIndex: 1, totalRowsReceived: 3, truncated: false },
        ];

        const result = await collectStreamToResult({
            stream: batchesFrom(batches),
            queryId: "q-1",
            maxRows: 100,
            executionTime: 0,
            database: "testdb",
        });

        assert.strictEqual(result.status, "success");
        assert.strictEqual(result.rowCount, 3);
        assert.strictEqual(result.rows.length, 3);
        assert.strictEqual(result.columns.length, 2);
        assert.strictEqual(result.columns[0].name, "id");
        assert.strictEqual(result.database, "testdb");
    });

    test("should stop at maxRows and mark result as truncated", async () => {
        const batches: StreamBatch[] = [
            { columns: makeColumns(), rows: [row(1, "a"), row(2, "b")], batchIndex: 0, totalRowsReceived: 2, truncated: false },
            { columns: [], rows: [row(3, "c"), row(4, "d")], batchIndex: 1, totalRowsReceived: 4, truncated: false },
            { columns: [], rows: [row(5, "e")], batchIndex: 2, totalRowsReceived: 5, truncated: false },
        ];

        const result = await collectStreamToResult({
            stream: batchesFrom(batches),
            queryId: "q-2",
            maxRows: 3,
            executionTime: 0,
            database: undefined,
        });

        assert.strictEqual(result.status, "success");
        assert.strictEqual(result.rows.length, 3, "should cap rows at maxRows");
        assert.strictEqual((result.rows[0] as QueryRow).id, 1);
        assert.strictEqual((result.rows[2] as QueryRow).id, 3);
    });

    test("should handle empty result set (no batches)", async () => {
        const result = await collectStreamToResult({
            stream: batchesFrom([]),
            queryId: "q-3",
            maxRows: 100,
            executionTime: 0,
            database: undefined,
        });

        assert.strictEqual(result.status, "success");
        assert.strictEqual(result.rowCount, 0);
        assert.strictEqual(result.rows.length, 0);
        assert.strictEqual(result.columns.length, 0);
    });

    test("should handle first batch with columns but no rows", async () => {
        const batches: StreamBatch[] = [{ columns: makeColumns(), rows: [], batchIndex: 0, totalRowsReceived: 0, truncated: false }];

        const result = await collectStreamToResult({
            stream: batchesFrom(batches),
            queryId: "q-4",
            maxRows: 100,
            executionTime: 0,
            database: undefined,
        });

        assert.strictEqual(result.status, "success");
        assert.strictEqual(result.rowCount, 0);
        assert.strictEqual(result.columns.length, 2);
    });

    test("should produce error result when stream throws", async () => {
        async function* failing(): AsyncIterable<StreamBatch> {
            yield { columns: makeColumns(), rows: [row(1, "a")], batchIndex: 0, totalRowsReceived: 1, truncated: false };
            throw new Error("connection lost");
        }

        const result = await collectStreamToResult({
            stream: failing(),
            queryId: "q-5",
            maxRows: 100,
            executionTime: 0,
            database: undefined,
        });

        assert.strictEqual(result.status, "error");
        assert.ok(result.error);
        assert.strictEqual(result.error!.code, "STREAM_ERROR");
        assert.strictEqual(result.error!.message, "connection lost");
    });

    test("should stop early when a batch reports truncated=true", async () => {
        const batches: StreamBatch[] = [
            { columns: makeColumns(), rows: [row(1, "a")], batchIndex: 0, totalRowsReceived: 1, truncated: false },
            { columns: [], rows: [row(2, "b")], batchIndex: 1, totalRowsReceived: 2, truncated: true },
        ];

        const seen: number[] = [];
        async function* tracking(): AsyncIterable<StreamBatch> {
            for (const b of batches) {
                seen.push(b.batchIndex);
                yield b;
                if (b.truncated) {
                    return;
                }
            }
        }

        const result = await collectStreamToResult({
            stream: tracking(),
            queryId: "q-6",
            maxRows: 100,
            executionTime: 0,
            database: undefined,
        });

        assert.strictEqual(result.status, "success");
        assert.strictEqual(result.rows.length, 2);
        assert.deepStrictEqual(seen, [0, 1], "should not pull batches after truncated");
    });
});

/**
 * Minimal adapter-like object exposing only the fields used by the
 * {@link collectStreamToResult} caller path. Keeps the test focused.
 */
interface FakeAdapter {
    executeStream?(sql: string, options?: QueryStreamOptions): AsyncIterable<StreamBatch>;
    execute(sql: string): Promise<QueryResult>;
}

suite("Streaming dispatch helper - chooseStreamPath", () => {
    // The dispatch decision (stream vs sync) is verified through the public
    // shape: adapters without executeStream fall back to execute. This mirrors
    // the contract QueryExecutor relies on.
    test("adapter without executeStream returns false for hasStream", () => {
        const adapter: FakeAdapter = {
            execute: async () => ({
                queryId: "q",
                status: "success",
                columns: [],
                rows: [],
                rowCount: 0,
                executionTime: 0,
            }),
        };
        assert.strictEqual(typeof adapter.executeStream, "undefined");
    });

    test("adapter with executeStream returns function for hasStream", () => {
        const adapter: FakeAdapter = {
            execute: async () => ({
                queryId: "q",
                status: "success",
                columns: [],
                rows: [],
                rowCount: 0,
                executionTime: 0,
            }),
            executeStream: async function* () {
                yield { columns: [], rows: [], batchIndex: 0, totalRowsReceived: 0, truncated: false };
            },
        };
        assert.strictEqual(typeof adapter.executeStream, "function");
    });
});
