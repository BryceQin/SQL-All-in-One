import * as assert from "assert";
import { AstLinter, type LintCancellationToken } from "../providers/AstLinter";

/**
 * Tests for the async, periodically-yielding lint path on AstLinter.
 *
 * The async path (`lintAsync`) is the safe fallback for moving lint work off
 * the main thread: it splits rule traversal into chunks and yields to the
 * event loop via `setImmediate`, so large SQL files no longer block the
 * extension host for tens to hundreds of milliseconds.
 *
 * These tests verify that:
 *   1. `lintAsync` produces the same diagnostics as the synchronous `lint`.
 *   2. `lintAsync` respects cooperative cancellation via a CancellationToken.
 *   3. `lintAsync` actually yields to the event loop when processing enough
 *      nodes (i.e. interleaves with other macrotasks).
 */
suite("AstLinter Async (setImmediate yielding) Test Suite", () => {
    let linter: AstLinter;

    suiteSetup(() => {
        // The shared test DI container (helpers/diSetup.ts) registers the
        // rule registry with default config, mirroring how astLinter.test.ts
        // constructs its linter.
        linter = new AstLinter();
    });

    test("lintAsync produces the same diagnostics as lint for SELECT *", async () => {
        const sql = "SELECT * FROM users";
        const syncDiags = linter.lint(sql, "mysql");
        const asyncDiags = await linter.lintAsync(sql, "mysql");

        const syncCodes = syncDiags.map((d) => d.code).sort();
        const asyncCodes = asyncDiags.map((d) => d.code).sort();
        assert.deepStrictEqual(asyncCodes, syncCodes, "lintAsync should produce the same diagnostic codes as lint");
        // Spot-check a concrete rule still fires.
        const starDiags = asyncDiags.filter((d) => d.code === "avoid_select_star");
        assert.ok(starDiags.length > 0, "Should detect SELECT * via lintAsync");
    });

    test("lintAsync matches lint on a UNION query (multiple statements)", async () => {
        const sql = "SELECT * FROM users UNION SELECT * FROM orders";
        const syncDiags = linter.lint(sql, "mysql");
        const asyncDiags = await linter.lintAsync(sql, "mysql");

        const syncCodes = syncDiags.map((d) => d.code).sort();
        const asyncCodes = asyncDiags.map((d) => d.code).sort();
        assert.deepStrictEqual(asyncCodes, syncCodes, "lintAsync should match lint for UNION queries");
        const starDiags = asyncDiags.filter((d) => d.code === "avoid_select_star");
        assert.ok(starDiags.length >= 2, "Should detect SELECT * on both sides of UNION via lintAsync");
    });

    test("lintAsync returns empty array for invalid SQL (no throw)", async () => {
        const sql = "NOT VALID SQL AT ALL !!!";
        const diags = await linter.lintAsync(sql, "mysql");
        assert.ok(Array.isArray(diags), "Should return an array even for invalid SQL");
    });

    test("lintAsync matches lint for CREATE TABLE without PK", async () => {
        const sql = "CREATE TABLE users (id INT, name VARCHAR(100))";
        const syncDiags = linter.lint(sql, "mysql");
        const asyncDiags = await linter.lintAsync(sql, "mysql");

        const syncCodes = syncDiags.map((d) => d.code).sort();
        const asyncCodes = asyncDiags.map((d) => d.code).sort();
        assert.deepStrictEqual(asyncCodes, syncCodes, "lintAsync should match lint for CREATE TABLE");
        const pkDiags = asyncDiags.filter((d) => d.code === "missing_primary_key");
        assert.ok(pkDiags.length > 0, "Should detect missing PK via lintAsync");
    });

    test("lintAsync respects pre-cancellation and stops before per-node rules", async () => {
        // With the token already cancelled, the async path should bail out
        // before running any per-node rules. Global rules run before the
        // first cancellation check, so we only assert that node-level rules
        // (like avoid_select_star) did not fire.
        const token: LintCancellationToken = { isCancellationRequested: true };
        const sql = "SELECT * FROM users UNION SELECT * FROM orders UNION SELECT * FROM t3";

        const diags = await linter.lintAsync(sql, "mysql", undefined, undefined, token);

        const starDiags = diags.filter((d) => d.code === "avoid_select_star");
        assert.strictEqual(starDiags.length, 0, "Pre-cancelled token should stop traversal before per-node rules run");
    });

    test("lintAsync yields to the event loop while processing a large AST", async function () {
        // Construct a SQL string with many subqueries so that the async
        // traversal processes more than LINT_YIELD_NODE_INTERVAL (64) nodes
        // and therefore yields to the event loop at least once via
        // setImmediate. We then verify that a macrotask scheduled before
        // lintAsync runs after at least one yield (i.e. lintAsync did not run
        // to completion purely synchronously).
        this.timeout(30000);

        let macrotaskRan = false;
        setImmediate(() => {
            macrotaskRan = true;
        });

        // 80 subqueries -> each UNION branch contributes a 'select' node plus
        // column_ref / star / from children, so the total node count far
        // exceeds LINT_YIELD_NODE_INTERVAL (64). With a hard node-count
        // threshold, this deterministically triggers at least one setImmediate
        // yield regardless of host speed.
        let sql = "SELECT * FROM ";
        for (let i = 0; i < 80; i++) {
            sql += "(SELECT * FROM t" + i + ") ";
            if (i < 79) sql += "UNION ";
        }
        await linter.lintAsync(sql, "mysql");

        // After lintAsync resolves, the macrotask scheduled above should have
        // had a chance to run during one of the internal setImmediate yields.
        // If lintAsync never yielded, macrotaskRan would still be false
        // because the await chain would resolve via microtasks before the
        // separately scheduled setImmediate got to execute.
        assert.ok(macrotaskRan, "lintAsync should yield to the event loop (via setImmediate) at least once when processing a large AST");
    });
});
