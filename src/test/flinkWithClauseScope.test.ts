import * as assert from "assert";
import { preprocessFlinkSql, postprocessFlinkSql } from "../formatter/FlinkSqlAdapter";

suite("Flink WITH Clause Scope Tests", () => {
    test("CREATE TABLE 的 WITH connector 被正确 slot 化", () => {
        const sql = `CREATE TABLE t (
    id INT
) WITH (
    'connector' = 'kafka',
    'topic' = 'test'
)`;
        const { processedSql, state } = preprocessFlinkSql(sql);
        assert.ok(!/\bWITH\s*\(/i.test(processedSql), "CREATE TABLE WITH should be slotted");
        const restored = postprocessFlinkSql(processedSql, state);
        assert.ok(/'connector'\s*=\s*'kafka'/.test(restored));
    });

    test("SELECT 语句中的 WITH 不被误伤（关键回归）", () => {
        const sql = `SELECT id FROM t WHERE name IN (WITH RECURSIVE t2 AS (SELECT 1) SELECT * FROM t2)`;
        const { state } = preprocessFlinkSql(sql);
        const hasWithSlot = state.slots.some((s) => /WITH\s*\(/i.test(s.original) && !/CREATE\s+TABLE/i.test(s.original));
        assert.ok(!hasWithSlot, "should not slot WITH in non-CREATE-TABLE context");
    });

    test("多个 CREATE TABLE 的 WITH 各自独立 slot 化", () => {
        const sql = `CREATE TABLE t1 (id INT) WITH ('connector'='kafka');
CREATE TABLE t2 (id INT) WITH ('connector'='jdbc')`;
        const { processedSql, state } = preprocessFlinkSql(sql);
        const withSlotCount = state.slots.filter((s) => /^WITH\s*\(/i.test(s.original.trim())).length;
        assert.ok(withSlotCount >= 2, `expected >=2 WITH slots, got ${withSlotCount}`);
        const restored = postprocessFlinkSql(processedSql, state);
        assert.ok(/'connector'\s*=\s*'kafka'/.test(restored));
        assert.ok(/'connector'\s*=\s*'jdbc'/.test(restored));
    });

    test("CTE WITH 不被误伤", () => {
        const sql = `WITH cte AS (SELECT 1 AS x)
SELECT * FROM cte`;
        const { processedSql, state } = preprocessFlinkSql(sql);
        const hasWithSlot = state.slots.some((s) => /^WITH\s*\(/i.test(s.original.trim()));
        assert.ok(!hasWithSlot, "CTE WITH should not be slotted");
        const restored = postprocessFlinkSql(processedSql, state);
        assert.ok(/\bWITH\s+cte\b/i.test(restored));
    });

    test("CREATE VIEW 的 WITH（无 connector）不被误伤", () => {
        const sql = `CREATE VIEW v AS SELECT id FROM t`;
        const { state } = preprocessFlinkSql(sql);
        const hasWithSlot = state.slots.some((s) => /^WITH\s*\(/i.test(s.original.trim()));
        assert.ok(!hasWithSlot, "CREATE VIEW without WITH should not produce WITH slot");
    });

    test("非 CREATE TABLE 上下文中的 WITH (...) 不被误伤（关键回归）", () => {
        // 模拟 SELECT 子查询中含 WITH (...) 提示形式
        const sql = `SELECT * FROM (SELECT id WITH (LOCK)) sub`;
        const { state } = preprocessFlinkSql(sql);
        const hasWithSlot = state.slots.some((s) => /^WITH\s*\(/i.test(s.original.trim()));
        assert.ok(!hasWithSlot, "WITH (...) inside SELECT subquery should not be slotted as CREATE TABLE connector");
    });

    test("CREATE TABLE ... LIKE ... WITH 被正确处理", () => {
        const sql = `CREATE TABLE new_t WITH ('connector'='kafka')
LIKE source_t;`;
        const { processedSql, state } = preprocessFlinkSql(sql);
        const hasLikeSlot = state.slots.some((s) => /\bLIKE\b/i.test(s.original));
        assert.ok(hasLikeSlot, "LIKE should be slotted");
        const restored = postprocessFlinkSql(processedSql, state);
        assert.ok(/\bLIKE\b/i.test(restored));
        assert.ok(/'connector'\s*=\s*'kafka'/.test(restored));
    });
});
