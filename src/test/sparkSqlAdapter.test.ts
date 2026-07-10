import * as assert from "assert";
import { preprocessSparkSql, postprocessSparkSql } from "../formatter/SparkSqlAdapter";

suite("SparkSqlAdapter Tests", () => {
    suite("Delta Lake 语句 slot 化", () => {
        test("OPTIMIZE ... ZORDER BY (...) 整段 slot 化并还原", () => {
            const sql = 'OPTIMIZE my_table WHERE date >= "2024-01-01" ZORDER BY (id, date)';
            const { processedSql, state } = preprocessSparkSql(sql);
            assert.ok(!/\bOPTIMIZE\b/i.test(processedSql), "processed SQL should not contain OPTIMIZE");
            assert.ok(state.deltaStmtSlots.length > 0, "should produce delta slot");

            const restored = postprocessSparkSql(processedSql, state);
            assert.ok(/\bOPTIMIZE\b/i.test(restored), "restored should contain OPTIMIZE");
            assert.ok(/\bZORDER\s+BY\b/i.test(restored), "restored should contain ZORDER BY");
        });

        test("VACUUM ... RETAIN N HOURS 整段 slot 化", () => {
            const sql = "VACUUM my_table RETAIN 168 HOURS";
            const { processedSql, state } = preprocessSparkSql(sql);
            assert.ok(!/\bVACUUM\b/i.test(processedSql), "processed SQL should not contain VACUUM");
            const restored = postprocessSparkSql(processedSql, state);
            assert.ok(/\bVACUUM\s+my_table\s+RETAIN\s+168\s+HOURS\b/i.test(restored), "restored should contain full VACUUM statement");
        });

        test("VACUUM ... DRY RUN 整段 slot 化", () => {
            const sql = "VACUUM my_table RETAIN 168 HOURS DRY RUN";
            const { processedSql, state } = preprocessSparkSql(sql);
            assert.ok(!/\bVACUUM\b/i.test(processedSql));
            const restored = postprocessSparkSql(processedSql, state);
            assert.ok(/\bDRY\s+RUN\b/i.test(restored), "restored should contain DRY RUN");
        });

        test("CONVERT TO DELTA ... PARTITIONED BY (...) 整段 slot 化", () => {
            const sql = "CONVERT TO DELTA parquet.`/path/to/table` PARTITIONED BY (date STRING)";
            const { processedSql, state } = preprocessSparkSql(sql);
            assert.ok(!/\bCONVERT\s+TO\s+DELTA\b/i.test(processedSql));
            const restored = postprocessSparkSql(processedSql, state);
            assert.ok(/\bCONVERT\s+TO\s+DELTA\b/i.test(restored));
            assert.ok(/\bPARTITIONED\s+BY\b/i.test(restored));
        });

        test("DESCRIBE HISTORY 整段 slot 化", () => {
            const sql = "DESCRIBE HISTORY my_table";
            const { processedSql, state } = preprocessSparkSql(sql);
            assert.ok(!/\bDESCRIBE\s+HISTORY\b/i.test(processedSql));
            const restored = postprocessSparkSql(processedSql, state);
            assert.ok(/\bDESCRIBE\s+HISTORY\s+my_table\b/i.test(restored));
        });

        test("DESCRIBE DETAIL 整段 slot 化", () => {
            const sql = "DESCRIBE DETAIL my_table";
            const { processedSql, state } = preprocessSparkSql(sql);
            assert.ok(!/\bDESCRIBE\s+DETAIL\b/i.test(processedSql));
            const restored = postprocessSparkSql(processedSql, state);
            assert.ok(/\bDESCRIBE\s+DETAIL\s+my_table\b/i.test(restored));
        });

        test("CREATE TABLE ... DEEP CLONE 整段 slot 化", () => {
            const sql = 'CREATE TABLE target DEEP CLONE source LOCATION "/path"';
            const { processedSql, state } = preprocessSparkSql(sql);
            assert.ok(!/\bDEEP\s+CLONE\b/i.test(processedSql));
            const restored = postprocessSparkSql(processedSql, state);
            assert.ok(/\bDEEP\s+CLONE\b/i.test(restored));
        });

        test("CREATE OR REPLACE TABLE ... SHALLOW CLONE 整段 slot 化", () => {
            const sql = "CREATE OR REPLACE TABLE target SHALLOW CLONE source";
            const { processedSql, state } = preprocessSparkSql(sql);
            assert.ok(!/\bSHALLOW\s+CLONE\b/i.test(processedSql));
            const restored = postprocessSparkSql(processedSql, state);
            assert.ok(/\bSHALLOW\s+CLONE\b/i.test(restored));
        });

        test("GENERATE symlink_format_manifest 整段 slot 化", () => {
            const sql = "GENERATE symlink_format_manifest FOR TABLE my_table";
            const { processedSql, state } = preprocessSparkSql(sql);
            assert.ok(!/\bGENERATE\s+symlink_format_manifest\b/i.test(processedSql));
            const restored = postprocessSparkSql(processedSql, state);
            assert.ok(/\bGENERATE\s+symlink_format_manifest\b/i.test(restored));
        });
    });

    suite("原有功能回归", () => {
        test("LATERAL VIEW EXPLODE 仍正确处理", () => {
            const sql = "SELECT a, b FROM t LATERAL VIEW EXPLODE(arr) x AS a";
            const { processedSql, state } = preprocessSparkSql(sql);
            assert.ok(!/\bLATERAL\s+VIEW\b/i.test(processedSql), "processed SQL should not contain LATERAL VIEW");
            assert.ok(state.lateralViewSlots.length > 0);
            const restored = postprocessSparkSql(processedSql, state);
            assert.ok(/\bLATERAL\s+VIEW\s+EXPLODE\b/i.test(restored));
        });

        test("MERGE INTO 仍正确处理", () => {
            const sql = "MERGE INTO t USING s ON t.id = s.id WHEN MATCHED THEN UPDATE SET *";
            const { processedSql, state } = preprocessSparkSql(sql);
            assert.ok(state.mergeSlots.length > 0);
            const restored = postprocessSparkSql(processedSql, state);
            assert.ok(/\bMERGE\s+INTO\b/i.test(restored));
        });

        test("CREATE TABLE USING delta 仍正确处理", () => {
            const sql = 'CREATE TABLE t (id INT) USING DELTA LOCATION "/path"';
            const { processedSql, state } = preprocessSparkSql(sql);
            // USING 走 usingSlots 路径，不应触发 deltaStmtSlots
            assert.strictEqual(state.deltaStmtSlots.length, 0, "USING delta should not be slotted as delta statement");
            const restored = postprocessSparkSql(processedSql, state);
            assert.ok(/\bUSING\s+DELTA\b/i.test(restored));
        });

        test("SORT BY 仍正确还原", () => {
            const sql = "SELECT a, b FROM t SORT BY a DESC, b ASC";
            const { state } = preprocessSparkSql(sql);
            assert.ok(state.keywordOccurrences.length > 0, "SORT BY should produce keyword occurrence");
            const restored = postprocessSparkSql("SELECT a, b FROM t ORDER BY a DESC, b ASC", state);
            assert.ok(/\bSORT\s+BY\b/i.test(restored), "restored should contain SORT BY");
        });

        test("CLUSTER BY 仍正确还原", () => {
            const sql = "SELECT a, b FROM t CLUSTER BY a";
            const { state } = preprocessSparkSql(sql);
            const restored = postprocessSparkSql("SELECT a, b FROM t ORDER BY a", state);
            assert.ok(/\bCLUSTER\s+BY\b/i.test(restored));
        });

        test("DISTRIBUTE BY 仍正确还原", () => {
            const sql = "SELECT a, b FROM t DISTRIBUTE BY a";
            const { state } = preprocessSparkSql(sql);
            const restored = postprocessSparkSql("SELECT a, b FROM t GROUP BY a", state);
            assert.ok(/\bDISTRIBUTE\s+BY\b/i.test(restored));
        });

        test("普通 SELECT 不被任何 slot 化", () => {
            const sql = "SELECT id, name FROM users WHERE age > 18";
            const { state } = preprocessSparkSql(sql);
            assert.strictEqual(state.deltaStmtSlots.length, 0);
            assert.strictEqual(state.mergeSlots.length, 0);
            assert.strictEqual(state.lateralViewSlots.length, 0);
        });

        test("Delta 语句与普通 SELECT 共存", () => {
            const sql = "OPTIMIZE t ZORDER BY (id);\nSELECT * FROM t WHERE id > 0";
            const { processedSql, state } = preprocessSparkSql(sql);
            assert.ok(!/\bOPTIMIZE\b/i.test(processedSql));
            assert.ok(/\bSELECT\b/i.test(processedSql), "normal SELECT should remain");
            const restored = postprocessSparkSql(processedSql, state);
            assert.ok(/\bOPTIMIZE\b[\s\S]*\bSELECT\b/i.test(restored), "restored should contain both OPTIMIZE and SELECT");
        });

        test("多段 Delta 语句按顺序还原", () => {
            const sql = `OPTIMIZE t1 ZORDER BY (id);
VACUUM t2 RETAIN 168 HOURS;
DESCRIBE HISTORY t3;`;
            const { processedSql, state } = preprocessSparkSql(sql);
            assert.strictEqual(state.deltaStmtSlots.length, 3, "should produce 3 delta slots");
            const restored = postprocessSparkSql(processedSql, state);
            assert.ok(/\bOPTIMIZE\s+t1\b/i.test(restored));
            assert.ok(/\bVACUUM\s+t2\b/i.test(restored));
            assert.ok(/\bDESCRIBE\s+HISTORY\s+t3\b/i.test(restored));
        });
    });
});
