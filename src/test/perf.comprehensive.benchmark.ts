/**
 * Comprehensive performance benchmark for optimization verification.
 *
 * Run with: npx tsx src/test/perf.comprehensive.benchmark.ts
 *
 * This benchmark measures key performance metrics that should improve
 * by at least 15% after optimization.
 */

import { precomputeLineOffsets, lineColFromIndexFast } from "../lexer/lineColFromIndex";
import { NestedComment } from "../lexer/NestedComment";

function measureTime(fn: () => void, iterations = 50): number {
    for (let i = 0; i < 5; i++) fn();
    const times: number[] = [];
    for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        fn();
        times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    return times[Math.floor(times.length / 2)];
}

function formatMs(ms: number): string {
    return ms.toFixed(4) + "ms";
}

function generateLongSql(lineCount: number): string {
    const lines: string[] = [];
    for (let i = 0; i < lineCount; i++) {
        lines.push(`SELECT column_${i} AS alias_${i}, COUNT(*) AS cnt_${i} FROM table_${i} GROUP BY column_${i}`);
    }
    return lines.join("\n");
}

function generateSqlWithComments(count: number): string {
    const parts: string[] = [];
    for (let i = 0; i < count; i++) {
        parts.push(`/* comment ${i} */ SELECT ${i}`);
    }
    return parts.join("\n");
}

function generateLargeSql(statementCount: number): string {
    const parts: string[] = [];
    for (let i = 0; i < statementCount; i++) {
        parts.push(`SELECT col${i}_1, col${i}_2 FROM table_${i} WHERE id = ${i}`);
    }
    return parts.join(";\n");
}

console.log("=".repeat(70));
console.log("Comprehensive Performance Benchmarks");
console.log("=".repeat(70));
console.log("");

{
    const sql = generateLongSql(2000);
    const time = measureTime(() => {
        precomputeLineOffsets(sql);
    }, 50);
    console.log(`[1] precomputeLineOffsets (2000 lines): ${formatMs(time)} median`);
}

{
    const sql = generateLongSql(2000);
    const lineStarts = precomputeLineOffsets(sql);
    const positions: number[] = [];
    let idx = 0;
    while ((idx = sql.indexOf(",", idx + 1)) !== -1) {
        positions.push(idx);
    }
    const time = measureTime(() => {
        for (const pos of positions) {
            lineColFromIndexFast(lineStarts, pos);
        }
    }, 50);
    console.log(`[2] lineColFromIndexFast (${positions.length} lookups): ${formatMs(time)} median`);
}

{
    const sql = generateSqlWithComments(100);
    const time = measureTime(() => {
        const nc = new NestedComment();
        nc.lastIndex = 0;
        let pos = 0;
        while (pos < sql.length) {
            nc.lastIndex = pos;
            const r = nc.exec(sql);
            if (r) {
                pos = nc.lastIndex;
            } else {
                pos++;
            }
        }
    }, 50);
    console.log(`[3] NestedComment scan (100 comments): ${formatMs(time)} median`);
}

{
    const sql = generateLargeSql(500);
    const time = measureTime(() => {
        const statements: string[] = [];
        let start = 0;
        for (let i = 0; i < sql.length; i++) {
            if (sql.charCodeAt(i) === 59) {
                const stmt = sql.substring(start, i + 1);
                if (stmt.replace(/;/g, "").trim().length > 0) {
                    statements.push(stmt);
                }
                start = i + 1;
            }
        }
    }, 50);
    console.log(`[4] String split approach (500 statements): ${formatMs(time)} median`);
}

{
    const obj: Record<string, number> = {};
    for (let i = 0; i < 20; i++) {
        obj["key" + i] = i;
    }
    const time = measureTime(() => {
        const keys = Object.keys(obj);
        for (const key of keys) {
            void obj[key];
        }
    }, 100);
    console.log(`[5] Object.keys traversal (20 keys): ${formatMs(time)} median`);
}

console.log("");
console.log("=".repeat(70));
console.log("Benchmark complete.");
console.log("=".repeat(70));
