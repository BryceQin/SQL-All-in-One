/**
 * Performance benchmark for lexer/parser optimizations.
 *
 * This script is self-contained (no VSCode dependency) and can be run with:
 *   npx tsx src/test/perf.optimization.benchmark.ts
 *
 * It compares the old (pre-optimization) implementations against the new
 * optimized ones to quantify the performance improvements.
 */

import { NestedComment } from "../lexer/NestedComment";
import { lineColFromIndexFast, precomputeLineOffsets } from "../lexer/lineColFromIndex";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function measureTime(fn: () => void, iterations = 50): number {
    // Warmup
    for (let i = 0; i < 5; i++) fn();
    const times: number[] = [];
    for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        fn();
        times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    // Use median to reduce noise
    return times[Math.floor(times.length / 2)];
}

function formatMs(ms: number): string {
    return ms.toFixed(4) + "ms";
}

function speedup(oldTime: number, newTime: number): string {
    return (oldTime / newTime).toFixed(2) + "x";
}

// ---------------------------------------------------------------------------
// Old implementations (for comparison)
// ---------------------------------------------------------------------------

/** Old NestedComment: per-character regex matching. */
class OldNestedComment {
    public lastIndex = 0;
    private static readonly START = /\/\*/uy;
    private static readonly ANY_CHAR = /[\s\S]/uy;
    private static readonly END = /\*\//uy;

    public exec(input: string): string[] | null {
        let result = "";
        let match: string | null;
        let nestLevel = 0;

        if ((match = this.matchSection(OldNestedComment.START, input))) {
            result += match;
            nestLevel++;
        } else {
            return null;
        }

        while (nestLevel > 0) {
            if ((match = this.matchSection(OldNestedComment.START, input))) {
                result += match;
                nestLevel++;
            } else if ((match = this.matchSection(OldNestedComment.END, input))) {
                result += match;
                nestLevel--;
            } else if ((match = this.matchSection(OldNestedComment.ANY_CHAR, input))) {
                result += match;
            } else {
                return null;
            }
        }
        return [result];
    }

    private matchSection(regex: RegExp, input: string): string | null {
        regex.lastIndex = this.lastIndex;
        const matches = regex.exec(input);
        if (matches) {
            this.lastIndex += matches[0].length;
        }
        return matches ? matches[0] : null;
    }
}

/** Old lineColFromIndex: O(n) linear scan. */
function oldLineColFromIndex(source: string, index: number): { line: number; col: number } {
    let line = 1;
    let lastNewline = -1;
    const limit = Math.min(index, source.length);
    for (let i = 0; i < limit; i++) {
        if (source.charCodeAt(i) === 10) {
            line++;
            lastNewline = i;
        }
    }
    return { line, col: index - lastNewline };
}

// ---------------------------------------------------------------------------
// Test data generators
// ---------------------------------------------------------------------------

function generateSqlWithComments(commentLength: number, count: number): string {
    const parts: string[] = [];
    const body = "x".repeat(commentLength);
    for (let i = 0; i < count; i++) {
        parts.push(`/* ${body} */ SELECT 1`);
    }
    return parts.join("\n");
}

function generateNestedComments(depth: number, count: number): string {
    const parts: string[] = [];
    for (let i = 0; i < count; i++) {
        let s = "/* ";
        for (let d = 0; d < depth; d++) s += "/* inner ";
        for (let d = 0; d < depth; d++) s += " */";
        s += " end */";
        parts.push(s);
    }
    return parts.join("\n");
}

function generateLongSql(lineCount: number): string {
    const lines: string[] = [];
    for (let i = 0; i < lineCount; i++) {
        lines.push(`SELECT column_${i} AS alias_${i}, COUNT(*) AS cnt_${i} FROM table_${i} GROUP BY column_${i}`);
    }
    return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Benchmark suites
// ---------------------------------------------------------------------------

console.log("=".repeat(70));
console.log("Performance Optimization Benchmarks");
console.log("=".repeat(70));
console.log("");

// --- Benchmark 1: NestedComment (flat, long comments) ---
{
    const sql = generateSqlWithComments(500, 50);
    const oldNc = new OldNestedComment();
    const newNc = new NestedComment();

    const oldTime = measureTime(() => {
        oldNc.lastIndex = 0;
        let pos = 0;
        while (pos < sql.length) {
            oldNc.lastIndex = pos;
            const r = oldNc.exec(sql);
            if (r) {
                pos = oldNc.lastIndex;
            } else {
                pos++;
            }
        }
    }, 20);

    const newTime = measureTime(() => {
        newNc.lastIndex = 0;
        let pos = 0;
        while (pos < sql.length) {
            newNc.lastIndex = pos;
            const r = newNc.exec(sql);
            if (r) {
                pos = newNc.lastIndex;
            } else {
                pos++;
            }
        }
    }, 20);

    console.log("[Benchmark 1] NestedComment (flat, 500-char x 50 comments):");
    console.log(`  Old (per-char regex): ${formatMs(oldTime)} median`);
    console.log(`  New (indexOf batch):  ${formatMs(newTime)} median`);
    console.log(`  Speedup: ${speedup(oldTime, newTime)}`);
    console.log("");
}

// --- Benchmark 2: NestedComment (deeply nested) ---
{
    const sql = generateNestedComments(5, 100);
    const oldNc = new OldNestedComment();
    const newNc = new NestedComment();

    const oldTime = measureTime(() => {
        oldNc.lastIndex = 0;
        let pos = 0;
        while (pos < sql.length) {
            oldNc.lastIndex = pos;
            const r = oldNc.exec(sql);
            if (r) {
                pos = oldNc.lastIndex;
            } else {
                pos++;
            }
        }
    }, 20);

    const newTime = measureTime(() => {
        newNc.lastIndex = 0;
        let pos = 0;
        while (pos < sql.length) {
            newNc.lastIndex = pos;
            const r = newNc.exec(sql);
            if (r) {
                pos = newNc.lastIndex;
            } else {
                pos++;
            }
        }
    }, 20);

    console.log("[Benchmark 2] NestedComment (nested depth=5 x 100):");
    console.log(`  Old (per-char regex): ${formatMs(oldTime)} median`);
    console.log(`  New (indexOf batch):  ${formatMs(newTime)} median`);
    console.log(`  Speedup: ${speedup(oldTime, newTime)}`);
    console.log("");
}

// --- Benchmark 3: lineColFromIndex (many lookups on long text) ---
{
    const lineCount = 2000;
    const sql = generateLongSql(lineCount);
    // Collect positions to look up (simulate comma-matching scenario)
    const positions: number[] = [];
    let idx = 0;
    while ((idx = sql.indexOf(",", idx + 1)) !== -1) {
        positions.push(idx);
    }

    const oldTime = measureTime(() => {
        for (const pos of positions) {
            oldLineColFromIndex(sql, pos);
        }
    }, 20);

    const lineStarts = precomputeLineOffsets(sql);
    const newTime = measureTime(() => {
        for (const pos of positions) {
            lineColFromIndexFast(lineStarts, pos);
        }
    }, 20);

    // Also measure with precompute included (amortized)
    const newTimeWithPrecompute = measureTime(() => {
        const ls = precomputeLineOffsets(sql);
        for (const pos of positions) {
            lineColFromIndexFast(ls, pos);
        }
    }, 20);

    console.log(`[Benchmark 3] lineColFromIndex (${positions.length} lookups on ${lineCount}-line SQL):`);
    console.log(`  Old (O(n) scan per call):              ${formatMs(oldTime)} median`);
    console.log(`  New (O(log n), precompute excluded):   ${formatMs(newTime)} median`);
    console.log(`  New (O(log n), precompute included):   ${formatMs(newTimeWithPrecompute)} median`);
    console.log(`  Speedup (precompute excluded): ${speedup(oldTime, newTime)}`);
    console.log(`  Speedup (precompute included): ${speedup(oldTime, newTimeWithPrecompute)}`);

    // Correctness check
    for (const pos of positions) {
        const old = oldLineColFromIndex(sql, pos);
        const fast = lineColFromIndexFast(lineStarts, pos);
        if (old.line !== fast.line || old.col !== fast.col) {
            console.log(`  MISMATCH at pos ${pos}: old={line:${old.line},col:${old.col}} fast={line:${fast.line},col:${fast.col}}`);
            break;
        }
    }
    console.log("");
}

// --- Benchmark 4: lineColFromIndex (single lookup, error path) ---
{
    const lineCount = 5000;
    const sql = generateLongSql(lineCount);
    const pos = sql.length - 1;

    const oldTime = measureTime(() => {
        oldLineColFromIndex(sql, pos);
    }, 100);

    const lineStarts = precomputeLineOffsets(sql);
    const newTime = measureTime(() => {
        lineColFromIndexFast(lineStarts, pos);
    }, 100);

    console.log(`[Benchmark 4] lineColFromIndex (single lookup near end of ${lineCount}-line SQL):`);
    console.log(`  Old (O(n) scan):        ${formatMs(oldTime)} median`);
    console.log(`  New (O(log n) search):  ${formatMs(newTime)} median`);
    console.log(`  Speedup: ${speedup(oldTime, newTime)}`);
    console.log("");
}

// --- Benchmark 5: lineColFromIndex correctness on edge cases ---
{
    console.log("[Benchmark 5] Correctness verification (lineColFromIndexFast vs lineColFromIndex):");
    const cases: { src: string; idx: number }[] = [
        { src: "hello", idx: 0 },
        { src: "hello world", idx: 6 },
        { src: "hello", idx: 5 },
        { src: "line1\nline2\nline3", idx: 8 },
        { src: "first\nsecond", idx: 6 },
        { src: "a\nb\nc", idx: 4 },
        { src: "", idx: 0 },
        { src: "hello\nworld", idx: 5 },
        { src: "a\n\nb", idx: 2 },
    ];
    let allPass = true;
    for (const { src, idx } of cases) {
        const old = oldLineColFromIndex(src, idx);
        const lineStarts = precomputeLineOffsets(src);
        const fast = lineColFromIndexFast(lineStarts, idx);
        const pass = old.line === fast.line && old.col === fast.col;
        if (!pass) {
            allPass = false;
            console.log(
                `  FAIL: src=${JSON.stringify(src)} idx=${idx} old={line:${old.line},col:${old.col}} fast={line:${fast.line},col:${fast.col}}`,
            );
        }
    }
    if (allPass) {
        console.log("  All edge cases pass ✓");
    }
    console.log("");
}

// --- Benchmark 6: NestedComment correctness ---
{
    console.log("[Benchmark 6] NestedComment correctness verification:");
    const cases = [
        "/* comment */",
        "/* outer /* inner */ more */",
        "/* a /* b /* c */ d */ e */",
        "hello world",
        "/* unclosed",
        "not a comment */",
    ];
    let allPass = true;
    for (const input of cases) {
        const oldNc = new OldNestedComment();
        const newNc = new NestedComment();
        oldNc.lastIndex = 0;
        newNc.lastIndex = 0;
        const oldR = oldNc.exec(input);
        const newR = newNc.exec(input);
        const oldStr = oldR ? oldR[0] : null;
        const newStr = newR ? newR[0] : null;
        const pass = oldStr === newStr;
        if (!pass) {
            allPass = false;
            console.log(`  FAIL: input=${JSON.stringify(input)} old=${JSON.stringify(oldStr)} new=${JSON.stringify(newStr)}`);
        }
    }
    if (allPass) {
        console.log("  All NestedComment cases pass ✓");
    }
    console.log("");
}

console.log("=".repeat(70));
console.log("Benchmark complete.");
console.log("=".repeat(70));
