import * as assert from "assert";
import { precomputeLineStarts, lineFromOffset } from "../utils/lineIndex";

function generateLargeSql(statementCount: number): string {
    const parts: string[] = [];
    for (let i = 0; i < statementCount; i++) {
        parts.push(`SELECT col${i}_1, col${i}_2, col${i}_3 FROM table_${i} WHERE id = ${i} ORDER BY col${i}_1`);
    }
    return parts.join(";\n");
}

function generateLongLineSql(lineCount: number): string {
    const lines: string[] = [];
    for (let i = 0; i < lineCount; i++) {
        lines.push(
            `SELECT column_${i} AS alias_${i}, COUNT(*) AS cnt_${i} FROM table_${i} GROUP BY column_${i} HAVING cnt_${i} > 10 ORDER BY cnt_${i} DESC`,
        );
    }
    return lines.join("\n");
}

function measureTime(fn: () => void, iterations = 10): number {
    const times: number[] = [];
    for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        fn();
        times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    const sum = times.reduce((a, b) => a + b, 0);
    return sum / times.length;
}

function formatMs(ms: number): string {
    return ms.toFixed(3) + "ms";
}

function precomputeLineOffsetsLocal(text: string): number[] {
    const offsets: number[] = [0];
    for (let i = 0; i < text.length; i++) {
        if (text.charCodeAt(i) === 10) {
            offsets.push(i + 1);
        }
    }
    return offsets;
}

function computeLineColumnFastLocal(lineOffsets: number[], offset: number): { line: number; column: number } {
    let low = 0;
    let high = lineOffsets.length - 1;
    while (low < high) {
        const mid = (low + high + 1) >>> 1;
        if (lineOffsets[mid] <= offset) {
            low = mid;
        } else {
            high = mid - 1;
        }
    }
    const lineStart = lineOffsets[low];
    return { line: low + 1, column: offset - lineStart + 1 };
}

function computeLineColumnOld(text: string, offset: number): { line: number; column: number } {
    let line = 1;
    let lastNewlinePos = -1;
    const limit = Math.min(offset, text.length);
    for (let i = 0; i < limit; i++) {
        if (text.charCodeAt(i) === 10) {
            line++;
            lastNewlinePos = i;
        }
    }
    return { line, column: offset - lastNewlinePos };
}

suite("Performance Benchmarks (No VSCode)", () => {
    suite("Line Number Calculation", () => {
        test("O(n) split approach vs O(1) precompute approach - 1000 lines", () => {
            const lineCount = 1000;
            const sql = generateLongLineSql(lineCount);
            const positions: number[] = [];
            let idx = 0;
            while ((idx = sql.indexOf("SELECT", idx + 1)) !== -1) {
                positions.push(idx);
            }

            const oldTime = measureTime(() => {
                for (const pos of positions) {
                    void sql.substring(0, pos).split("\n").length;
                }
            }, 20);

            const lineStarts = precomputeLineStarts(sql);
            const newTime = measureTime(() => {
                for (const pos of positions) {
                    void lineFromOffset(lineStarts, pos);
                }
            }, 20);

            console.log(`  [Benchmark] Line calc x${positions.length}:`);
            console.log(`    Old (split): ${formatMs(oldTime)} avg`);
            console.log(`    New (precompute): ${formatMs(newTime)} avg`);
            console.log(`    Speedup: ${(oldTime / newTime).toFixed(2)}x`);
            assert.ok(newTime < oldTime, `New approach should be faster`);
        });

        test("computeLineColumn vs computeLineColumnFast - 100 statements", () => {
            const sql = generateLargeSql(100);
            const stmtStarts: number[] = [];
            let pos = 0;
            while ((pos = sql.indexOf("SELECT", pos + 1)) !== -1) {
                stmtStarts.push(pos);
            }

            const oldTime = measureTime(() => {
                for (const start of stmtStarts) {
                    computeLineColumnOld(sql, start);
                }
            }, 50);

            const lineOffsets = precomputeLineOffsetsLocal(sql);
            const newTime = measureTime(() => {
                for (const start of stmtStarts) {
                    computeLineColumnFastLocal(lineOffsets, start);
                }
            }, 50);

            console.log(`  [Benchmark] computeLineColumn x${stmtStarts.length}:`);
            console.log(`    Old (linear scan): ${formatMs(oldTime)} avg`);
            console.log(`    New (binary search): ${formatMs(newTime)} avg`);
            console.log(`    Speedup: ${(oldTime / newTime).toFixed(2)}x`);
            assert.ok(newTime < oldTime, `New approach should be faster`);
        });
    });

    suite("Correctness Verification", () => {
        test("lineFromOffset matches split approach", () => {
            const sql = generateLongLineSql(100);
            const lineStarts = precomputeLineStarts(sql);
            const positions: number[] = [];
            let idx = 0;
            while ((idx = sql.indexOf("SELECT", idx + 1)) !== -1) {
                positions.push(idx);
            }

            for (const pos of positions) {
                const oldLine = sql.substring(0, pos).split("\n").length;
                const newLine = lineFromOffset(lineStarts, pos);
                assert.strictEqual(newLine, oldLine, `Line mismatch at offset ${pos}`);
            }
        });

        test("computeLineColumnFast matches computeLineColumn", () => {
            const sql = generateLargeSql(50);
            const stmtStarts: number[] = [];
            let pos = 0;
            while ((pos = sql.indexOf("SELECT", pos + 1)) !== -1) {
                stmtStarts.push(pos);
            }

            const lineOffsets = precomputeLineOffsetsLocal(sql);
            for (const start of stmtStarts) {
                const old = computeLineColumnOld(sql, start);
                const fast = computeLineColumnFastLocal(lineOffsets, start);
                assert.strictEqual(fast.line, old.line, `Line mismatch at offset ${start}`);
                assert.strictEqual(fast.column, old.column, `Column mismatch at offset ${start}`);
            }
        });
    });
});
