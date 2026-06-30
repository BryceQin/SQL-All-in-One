// End-to-end performance benchmarks (No VSCode dependency).
//
// Run with:  npx tsx src/test/perf.e2e.benchmark.novscode.ts
//   or:       npx jiti src/test/perf.e2e.benchmark.novscode.ts
//
// This file measures realistic end-to-end scenarios that the existing
// `perf.benchmark.novscode.ts` (which only covers low-level helpers like
// line-number calculation, comment scanning and statement splitting) does
// not exercise:
//
//   1. SQL parsing end-to-end (SqlParserEngine.astify + cache)
//   2. AST walk end-to-end (walkAst on real parser output)
//   3. Statement splitting end-to-end (splitSqlStatements at scale)
//   4. LRU cache performance (set / get / deleteByPrefix)
//   5. Formatting end-to-end (formatDialect + formatter cache)
//
// Why the vscode shim import is required (and must come first):
//   Several production modules (e.g. `parser/DocumentAstCache`,
//   `parser/AstVisitor` -> `core/errorHandler`, `formatter/sqlFormatter`
//   -> `i18n`) do `import * as vscode from 'vscode'` at the top level for
//   type-only or runtime-fallback purposes. When this file is run outside
//   of VS Code (via tsx / jiti), `require('vscode')` throws
//   `MODULE_NOT_FOUND` and *all* downstream imports fail – even code paths
//   that never actually invoke a vscode API. The side-effect import of
//   `./vscodeShim.novscode.cjs` (which MUST be the first import in this
//   file) injects a minimal no-op `vscode` module into the Node module
//   resolver before any project module is loaded. The shim only makes
//   module *loading* succeed; benchmarks must not invoke real vscode APIs.

// IMPORTANT: keep this as the very first import – it installs the vscode
// shim that all subsequent project imports depend on.
import './vscodeShim.novscode.cjs'

import * as assert from 'assert'
import { createParserEngine, SqlParserEngine } from '../parser/SqlParserEngine'
import { walkAst } from '../parser/AstVisitor'
import { splitSqlStatements } from '../parser/DocumentAstCache'
import { LRUCache } from '../utils/lruCache'
import { formatDialect } from '../formatter/sqlFormatter'
import { getContainer, Tokens } from '../core/diContainer'
import type { SqlDialect } from '../parser/dialectMapper'
import type { AST } from 'node-sql-parser'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Measure the median wall-clock time of `fn` over `iterations` runs (after a
 * short warmup). Returns milliseconds. Median (rather than mean) is used to
 * reduce the impact of GC pauses and OS scheduling jitter.
 */
function measureTime(fn: () => void, iterations = 30): number {
    // Warmup – let the JIT settle and any lazy module loading complete.
    for (let i = 0; i < 5; i++) fn()
    const times: number[] = []
    for (let i = 0; i < iterations; i++) {
        const start = performance.now()
        fn()
        times.push(performance.now() - start)
    }
    times.sort((a, b) => a - b)
    return times[Math.floor(times.length / 2)]
}

/**
 * Measure the median wall-clock time of a *cold* `astify` call (i.e. with
 * the engine's LRU cache emptied before every iteration). Unlike
 * `measureTime`, there is no warmup phase, because warmup would populate
 * the cache and turn the cold measurement into a warm one. A small number
 * of iterations is used because cold parses are much slower than cached
 * ones.
 */
function measureColdParse(
    engine: SqlParserEngine,
    sql: string,
    dialect: SqlDialect,
    iterations = 10,
): number {
    const times: number[] = []
    for (let i = 0; i < iterations; i++) {
        engine.dispose() // ensure cache miss
        const start = performance.now()
        engine.astify(sql, dialect)
        times.push(performance.now() - start)
    }
    times.sort((a, b) => a - b)
    return times[Math.floor(times.length / 2)]
}

function formatMs(ms: number): string {
    return ms.toFixed(4) + 'ms'
}

function speedup(oldTime: number, newTime: number): string {
    if (newTime <= 0) return 'n/a'
    return (oldTime / newTime).toFixed(2) + 'x'
}

function hr(label: string): void {
    console.log('')
    console.log('-'.repeat(70))
    console.log(label)
    console.log('-'.repeat(70))
}

/** Generate `count` simple SELECT statements joined by `;\n`. */
function generateLargeSql(statementCount: number): string {
    const parts: string[] = []
    for (let i = 0; i < statementCount; i++) {
        parts.push(`SELECT col${i}_1, col${i}_2, col${i}_3 FROM table_${i} WHERE id = ${i} ORDER BY col${i}_1`)
    }
    return parts.join(';\n')
}

/**
 * Generate a single SELECT with a deeply nested subquery in the WHERE
 * clause, producing an AST whose walk depth is ~`depth`.
 */
function generateDeepAstSql(depth: number): string {
    let sql = 'SELECT 1'
    for (let i = 0; i < depth; i++) {
        sql = `SELECT ${i} FROM t${i} WHERE id IN (${sql})`
    }
    return sql
}

/** Build a synthetic AST of the given depth without going through the parser. */
function generateSyntheticAst(depth: number, breadth: number): Record<string, unknown> {
    const node: Record<string, unknown> = {
        type: 'select',
        loc: { start: { line: 1, column: 1 }, end: { line: 1, column: 10 } },
    }
    const columns: unknown[] = []
    for (let i = 0; i < breadth; i++) {
        columns.push({
            type: 'column_ref',
            table: null,
            column: `col${i}`,
            loc: { start: { line: 1, column: i * 10 }, end: { line: 1, column: i * 10 + 5 } },
        })
    }
    node.columns = columns
    if (depth > 0) {
        node.from = [{
            type: 'table',
            db: null,
            table: `table_${depth}`,
            as: null,
            loc: { start: { line: 1, column: 1 }, end: { line: 1, column: 10 } },
        }]
        node.where = generateSyntheticAst(depth - 1, breadth)
    }
    return node
}

// ---------------------------------------------------------------------------
// Register a ParserEngine in the DI container.
//
// `formatDialect` -> `AstFormatter.format` -> `getParserEngine()` requires
// a registered ParserEngine instance. We create one directly (bypassing the
// container factory) and register it so the formatter can find it.
// ---------------------------------------------------------------------------
const parserEngine: SqlParserEngine = createParserEngine()
getContainer().register(Tokens.ParserEngine, parserEngine)

// ---------------------------------------------------------------------------
// Benchmark 1: SQL parsing end-to-end (astify + cache)
// ---------------------------------------------------------------------------
hr('Benchmark 1: SQL parsing end-to-end (SqlParserEngine.astify)')

{
    const dialect: SqlDialect = 'mysql'
    const sizes = [100, 500, 1000]

    // Note on "incremental parsing": SqlParserEngine.astify keys its LRU
    // cache on a hash of the *entire* SQL text, so there is no true
    // incremental-parse API (re-parsing a lightly-edited document still
    // re-parses the whole input). We therefore measure only the two
    // meaningful end states: a cold parse (cache miss) and a warm parse
    // (cache hit). The cold measurement disposes the engine cache before
    // every iteration so each timed call is a genuine cache miss.
    for (const size of sizes) {
        const sql = generateLargeSql(size)

        // Cold parse – clear the cache before *each* timed iteration so the
        // call is a real cache miss. measureTime()'s internal warmup would
        // otherwise populate the cache and turn "cold" into "warm".
        const coldTime = measureColdParse(parserEngine, sql, dialect, 10)

        // Warm parse – prime the cache once, then time repeated hits.
        parserEngine.astify(sql, dialect) // prime
        const warmTime = measureTime(() => {
            parserEngine.astify(sql, dialect)
        }, 30)

        // Functional correctness: parsing must succeed and (for this input)
        // return an array of statement ASTs.
        const ast = parserEngine.astify(sql, dialect)
        const astArray: unknown[] = Array.isArray(ast) ? ast : [ast]
        assert.ok(astArray.length > 0, `astify should produce at least one statement for size=${size}`)
        // Each top-level node should look like an AST node with a `type`.
        const firstNode = astArray[0] as Record<string, unknown> | undefined
        assert.ok(firstNode && typeof firstNode === 'object' && 'type' in firstNode,
            `astify top-level node should have a type for size=${size}`)

        console.log(`[size=${size}] statements:`)
        console.log(`  Cold parse (cache miss): ${formatMs(coldTime)} median`)
        console.log(`  Warm parse (cache hit):  ${formatMs(warmTime)} median`)
        console.log(`  Cache speedup:           ${speedup(coldTime, warmTime)}`)
    }
}

// ---------------------------------------------------------------------------
// Benchmark 2: AST walk end-to-end (walkAst on real parser output)
// ---------------------------------------------------------------------------
hr('Benchmark 2: AST walk end-to-end (walkAst)')

{
    // Use real parser output so the walk exercises the same node shapes that
    // production code (linter, hover, navigation) traverses.
    const dialect: SqlDialect = 'mysql'
    const depths = [5, 8, 10]

    for (const depth of depths) {
        const sql = generateDeepAstSql(depth)
        const ast = parserEngine.astify(sql, dialect)

        let nodeCount = 0
        const walkTime = measureTime(() => {
            nodeCount = 0
            walkAst(ast, {
                enter() { nodeCount++ },
            })
        }, 50)

        // Correctness: deeper query should yield more nodes than shallower.
        assert.ok(nodeCount > 0, `walkAst should visit nodes for depth=${depth}`)
        console.log(`[depth=${depth}] nodes visited: ${nodeCount}, walk time: ${formatMs(walkTime)} median`)
    }

    // Also benchmark a synthetic AST to isolate walkAst from parser overhead,
    // at depths that would be expensive to express as SQL.
    console.log('')
    console.log('  (synthetic AST, isolating walkAst from parser overhead)')
    for (const depth of [5, 8, 10]) {
        const ast = generateSyntheticAst(depth, 10)
        let count = 0
        const t = measureTime(() => {
            count = 0
            walkAst(ast, { enter() { count++ } })
        }, 50)
        assert.ok(count > 0, `walkAst should visit nodes for synthetic depth=${depth}`)
        console.log(`  [synthetic depth=${depth}] nodes: ${count}, time: ${formatMs(t)} median`)
    }
}

// ---------------------------------------------------------------------------
// Benchmark 3: Statement splitting end-to-end (splitSqlStatements at scale)
// ---------------------------------------------------------------------------
hr('Benchmark 3: Statement splitting end-to-end (splitSqlStatements)')

{
    const sizes = [100, 500, 1000]
    for (const size of sizes) {
        const sql = generateLargeSql(size)

        let result: { text: string; start: number; end: number }[] = []
        const t = measureTime(() => {
            result = splitSqlStatements(sql)
        }, 30)

        // Correctness: each generated statement ends with `;` except possibly
        // the last; the splitter should return exactly `size` statements.
        assert.strictEqual(result.length, size,
            `splitSqlStatements should return ${size} statements, got ${result.length}`)
        // First statement should start at offset 0.
        assert.strictEqual(result[0].start, 0, 'first statement should start at offset 0')

        console.log(`[size=${size}] split time: ${formatMs(t)} median (${result.length} statements)`)
    }

    // Also exercise the string/comment awareness paths so the benchmark
    // reflects real-world SQL with literals and comments.
    {
        const parts: string[] = []
        for (let i = 0; i < 200; i++) {
            parts.push(`-- comment ${i}\nSELECT 'a;b' /* block; */ FROM t${i};`)
        }
        const sql = parts.join('\n')
        let result: { text: string; start: number; end: number }[] = []
        const t = measureTime(() => {
            result = splitSqlStatements(sql)
        }, 30)
        assert.strictEqual(result.length, 200, `expected 200 statements, got ${result.length}`)
        console.log(`[200 stmts w/ comments+strings] split time: ${formatMs(t)} median`)
    }
}

// ---------------------------------------------------------------------------
// Benchmark 4: LRU cache performance (set / get / deleteByPrefix)
// ---------------------------------------------------------------------------
hr('Benchmark 4: LRU cache performance (LRUCache)')

{
    const setSizes = [1000, 10000]

    for (const n of setSizes) {
        const cache = new LRUCache<string, number>({ maxSize: n * 2, maxAge: Infinity })

        const setTime = measureTime(() => {
            for (let i = 0; i < n; i++) {
                cache.set(`key${i}`, i)
            }
        }, 20)

        const getTime = measureTime(() => {
            for (let i = 0; i < n; i++) {
                void cache.get(`key${i}`)
            }
        }, 20)

        // Correctness: every set key must be gettable.
        const sample = cache.get(`key${Math.floor(n / 2)}`)
        assert.strictEqual(sample, Math.floor(n / 2), `cache.get should return the set value`)
        assert.strictEqual(cache.size(), n, `cache.size should be ${n} after ${n} sets`)

        // deleteByPrefix: the prefix index only groups on delimiters like
        // `::`/`:`/`/`. We use keys that contain `::` so the prefix path is
        // exercised, then time the bulk delete.
        const prefixCache = new LRUCache<string, number>({ maxSize: n * 2, maxAge: Infinity })
        const prefix = 'doc1::'
        for (let i = 0; i < n; i++) {
            prefixCache.set(`${prefix}stmt${i}`, i)
        }
        // Force the prefix index to be built, then time the bulk delete.
        void prefixCache.size()
        const delTime = measureTime(() => {
            // Re-populate (delete is destructive) before each timing run.
            for (let i = 0; i < n; i++) {
                prefixCache.set(`${prefix}stmt${i}`, i)
            }
            prefixCache.deleteByPrefix(prefix)
        }, 10)

        assert.strictEqual(prefixCache.size(), 0,
            `deleteByPrefix should remove all ${n} entries, ${prefixCache.size()} remain`)

        console.log(`[size=${n}] set: ${formatMs(setTime)} median | get: ${formatMs(getTime)} median | deleteByPrefix: ${formatMs(delTime)} median`)
    }
}

// ---------------------------------------------------------------------------
// Benchmark 5: Formatting end-to-end (formatDialect + formatter cache)
// ---------------------------------------------------------------------------
hr('Benchmark 5: Formatting end-to-end (formatDialect)')

{
    const dialect: SqlDialect = 'mysql'
    const sizes = [10, 50, 200]

    for (const size of sizes) {
        const sql = generateLargeSql(size)

        // First format – cold formatter cache (the AstFormatter for the
        // default-options+dialect key is constructed on first call).
        const firstTime = measureTime(() => {
            formatDialect(sql, { dialect })
        }, 10)

        // Warm formatter cache – the formatter instance is reused; only the
        // parse + format work remains.
        const cachedTime = measureTime(() => {
            formatDialect(sql, { dialect })
        }, 20)

        // Correctness: output must be a non-empty string containing SELECT.
        const out = formatDialect(sql, { dialect })
        assert.ok(typeof out === 'string' && out.length > 0, 'formatDialect should return a non-empty string')
        assert.ok(/SELECT/i.test(out), 'formatted output should contain SELECT')

        console.log(`[size=${size}] first format: ${formatMs(firstTime)} median | cached formatter: ${formatMs(cachedTime)} median | speedup: ${speedup(firstTime, cachedTime)}`)
    }

    // Single-statement format latency – the most common user action.
    {
        const sql = 'select a, b, c from t where x = 1 and y > 2 order by a'
        const t = measureTime(() => {
            formatDialect(sql, { dialect: 'mysql' })
        }, 50)
        const out = formatDialect(sql, { dialect: 'mysql' })
        assert.ok(out.length > 0, 'single-statement format output should be non-empty')
        console.log(`[single stmt] format latency: ${formatMs(t)} median`)
    }
}

// ---------------------------------------------------------------------------
// Sanity round-trip: parse -> walk -> format should not lose information
// for a simple query. This is a behavioural guard, not a perf measurement.
// ---------------------------------------------------------------------------
hr('Sanity: parse -> walk -> format round-trip')

{
    const sql = 'SELECT id, name FROM users WHERE id = 1'
    const dialect: SqlDialect = 'mysql'
    const ast: AST[] | AST = parserEngine.astify(sql, dialect)

    let selectCount = 0
    walkAst(ast, {
        enter(node) {
            if (node.type === 'select') selectCount++
        },
    })
    assert.ok(selectCount >= 1, 'should find at least one select node')

    const formatted = formatDialect(sql, { dialect })
    assert.ok(formatted.length > 0, 'formatted output should be non-empty')
    console.log(`  input:        ${sql}`)
    console.log(`  select nodes: ${selectCount}`)
    console.log(`  formatted:    ${formatted.replace(/\n/g, ' ').substring(0, 80)}`)
}

console.log('')
console.log('='.repeat(70))
console.log('End-to-end benchmark complete.')
console.log('='.repeat(70))
